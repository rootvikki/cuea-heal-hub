import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { logAuditEvent } from "@/lib/auditLog";
import { Download, FileSpreadsheet, FileText, Wallet, Receipt, Smartphone, RotateCcw, Loader2, Calculator } from "lucide-react";
import * as XLSX from "xlsx";
import {
  EMPTY_FILTERS, GROUPS, METHODS, PATIENT_TYPES, PERIODS, PERIOD_LABELS,
  filterPayments, groupPayments, nairobiParts, normalisePayment, queryBounds, rangeFor,
  type GroupBy, type PaymentFilters, type PaymentRow,
} from "@/lib/paymentsQuery";
import { DETAIL_HEADERS, buildPaymentsCSV, buildPaymentsWorkbook, detailValues, type MpesaAttempt } from "@/lib/paymentsExport";
import { buildPaymentsPdf } from "@/lib/paymentsPdf";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUSES: Record<string, string> = { completed: "Completed", pending: "Pending", refunded: "Refunded", failed: "Failed" };
const PAGE = 1000;

export function PaymentsReport() {
  const { toast } = useToast();
  const { profile } = useUser();
  const [period, setPeriod] = useState<string>("this_month");
  const [from, setFrom] = useState(rangeFor("this_month")[0]);
  const [to, setTo] = useState(rangeFor("this_month")[1]);
  const [filters, setFilters] = useState<PaymentFilters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [raw, setRaw] = useState<any[]>([]);
  const [mpesa, setMpesa] = useState<MpesaAttempt[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const set = (k: keyof PaymentFilters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const choosePeriod = (p: string) => {
    setPeriod(p);
    if (p !== "custom") { const [a, b] = rangeFor(p); setFrom(a); setTo(b); }
  };

  const load = async () => {
    if (!from || !to || from > to) return;
    setLoading(true);
    const [lo, hi] = queryBounds(from, to);
    const all: any[] = [];
    // Page through results so large periods are complete (the server returns at most 1000 rows per request)
    for (let page = 0; page < 50; page++) {
      const { data, error } = await supabase.from("payments")
        .select("id, amount, payment_method, transaction_ref, status, paid_at, created_at, received_by, invoices(invoice_number, tickets(ticket_number, payment_mode, departments(name))), patients(patient_id, patient_type, admission_number, payroll_number, profiles(full_name, phone))")
        .gte("created_at", lo).lte("created_at", hi)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) { setLoading(false); toast({ title: "Could not load payments", description: error.message, variant: "destructive" }); return; }
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const { data: tx } = await supabase.from("mpesa_transactions")
      .select("created_at, phone_number, amount, status, mpesa_receipt_number, result_desc, invoices(invoice_number)")
      .gte("created_at", lo).lte("created_at", hi).order("created_at", { ascending: false }).limit(1000);
    setMpesa((tx || []).map((t: any) => {
      const p = nairobiParts(t.created_at);
      return { at: `${p.date.split("-").reverse().join("/")} ${p.time}`, phone: t.phone_number, amount: Number(t.amount), status: t.status, receipt: t.mpesa_receipt_number || "-", invoice: t.invoices?.invoice_number || "-", reason: t.result_desc || "" };
    }));
    const ids = Array.from(new Set(all.map((r) => r.received_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      setStaffNames(Object.fromEntries((profs || []).map((p) => [p.user_id, p.full_name])));
    }
    setRaw(all);
    setLoading(false);
  };
  useEffect(() => { load(); }, [from, to]);

  const rows = useMemo<PaymentRow[]>(() => raw.map((r) => normalisePayment(r, staffNames)), [raw, staffNames]);
  const view = useMemo(() => filterPayments(rows, filters), [rows, filters]);
  const groups = useMemo(() => (groupBy === "none" ? [] : groupPayments(view, groupBy)), [view, groupBy]);
  const total = view.reduce((a, r) => a + r.amount, 0);
  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department))).filter((d) => d !== "-").sort(), [rows]);
  const receivers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.receivedById) m.set(r.receivedById, r.receivedBy); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const mpesaCounts = mpesa.reduce<Record<string, number>>((a, m) => { a[m.status] = (a[m.status] || 0) + 1; return a; }, {});
  const activeFilters = Object.entries(filters).filter(([k, v]) => v !== (EMPTY_FILTERS as any)[k]).length;

  const filterSummary = () => {
    const out = [`Period: ${from.split("-").reverse().join("/")} to ${to.split("-").reverse().join("/")}`];
    if (filters.patientType !== "all") out.push(`Patient type: ${PATIENT_TYPES[filters.patientType]}`);
    if (filters.method !== "all") out.push(`Method: ${METHODS[filters.method]}`);
    if (filters.status !== "all") out.push(`Status: ${STATUSES[filters.status] || filters.status}`);
    if (filters.receivedBy !== "all") out.push(`Received by: ${filters.receivedBy === "system" ? "M-Pesa (auto)" : staffNames[filters.receivedBy] || "Staff"}`);
    if (filters.department !== "all") out.push(`Department: ${filters.department}`);
    if (filters.paymentMode !== "all") out.push(`Visit payment mode: ${filters.paymentMode === "insurance" ? "Insurance" : "M-Pesa / School fees"}`);
    if (filters.minAmount || filters.maxAmount) out.push(`Amount: ${filters.minAmount || "0"} – ${filters.maxAmount || "any"}`);
    if (filters.search.trim()) out.push(`Search: "${filters.search.trim()}"`);
    if (out.length === 1) out.push("All patients, all methods, all users");
    return out;
  };
  const fileBase = `CUEA-Infirmary-Payments-${from}_to_${to}`;
  const audit = (format: string) => logAuditEvent({ action: "payments_report_exported", module: "reports", details: { format, from, to, rows: view.length, total, filters: filterSummary() } });

  const exportCSV = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + buildPaymentsCSV(view)], { type: "text/csv;charset=utf-8" }));
    a.download = `${fileBase}.csv`; a.click();
    audit("csv");
  };
  const exportExcel = () => {
    XLSX.writeFile(buildPaymentsWorkbook(view, { filters: filterSummary(), groupBy, mpesa }), `${fileBase}.xlsx`);
    audit("excel");
  };
  const exportPDF = async () => {
    setExporting("pdf");
    try {
      const doc = await buildPaymentsPdf(view, { filters: filterSummary(), groupBy, preparedBy: profile?.full_name });
      doc.save(`${fileBase}.pdf`);
      audit("pdf");
    } finally { setExporting(null); }
  };

  const sel = (label: string, value: string, onChange: (v: string) => void, options: [string, string][], allLabel: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Payments report — choose what to include</CardTitle>
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}><RotateCcw className="h-4 w-4 mr-1" /> Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => choosePeriod(p)}>{PERIOD_LABELS[p]}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
            <div className="space-y-2"><Label>From</Label><Input type="date" value={from} max={to} onChange={(e) => { setPeriod("custom"); setFrom(e.target.value); }} className="h-12" /></div>
            <div className="space-y-2"><Label>To</Label><Input type="date" value={to} min={from} onChange={(e) => { setPeriod("custom"); setTo(e.target.value); }} className="h-12" /></div>
            {sel("Patient type", filters.patientType, (v) => set("patientType", v), Object.entries(PATIENT_TYPES), "All patients")}
            {sel("Payment method", filters.method, (v) => set("method", v), Object.entries(METHODS), "All methods")}
            {sel("Received by", filters.receivedBy, (v) => set("receivedBy", v), [["system", "M-Pesa (auto)"], ...receivers], "All users")}
            {sel("Status", filters.status, (v) => set("status", v), Object.entries(STATUSES), "Any status")}
            {sel("Department", filters.department, (v) => set("department", v), departments.map((d) => [d, d] as [string, string]), "All departments")}
            {sel("Visit payment mode", filters.paymentMode, (v) => set("paymentMode", v), [["mpesa", "M-Pesa / School fees"], ["insurance", "Insurance"]], "Any mode")}
            <div className="space-y-2"><Label>Amount from (KES)</Label><Input type="number" min={0} value={filters.minAmount} onChange={(e) => set("minAmount", e.target.value)} placeholder="0" className="h-12" /></div>
            <div className="space-y-2"><Label>Amount up to (KES)</Label><Input type="number" min={0} value={filters.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} placeholder="Any" className="h-12" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Search</Label><Input value={filters.search} onChange={(e) => set("search", e.target.value)} placeholder="Name, OPD no., receipt, invoice, ticket, phone, admission/staff no." className="h-12" /></div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2 w-full sm:w-64">
              <Label>Group totals by</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GROUPS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportPDF} disabled={!view.length || !!exporting}>
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />} Branded PDF
              </Button>
              <Button variant="outline" onClick={exportExcel} disabled={!view.length}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
              <Button variant="outline" onClick={exportCSV} disabled={!view.length}><Download className="h-4 w-4 mr-2" /> CSV</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Excel includes sheets for totals by day, method, patient type, staff and department, plus every M-Pesa prompt (paid, failed or cancelled) for reconciliation. All totals are live formulas.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><Wallet className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total collected</p><p className="text-2xl font-bold">{kes(total)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Receipt className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Payments</p><p className="text-2xl font-bold">{view.length}{view.length !== rows.length && <span className="text-sm font-normal text-muted-foreground"> of {rows.length}</span>}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Calculator className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Average payment</p><p className="text-2xl font-bold">{kes(view.length ? total / view.length : 0)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Smartphone className="h-8 w-8 text-primary" /><div className="text-sm">
          <p className="text-muted-foreground">M-Pesa prompts sent: {mpesa.length}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(mpesaCounts).map(([s, c]) => <Badge key={s} variant={s === "completed" ? "default" : s === "failed" ? "destructive" : "outline"}>{s === "completed" ? "Paid" : s === "failed" ? "Failed / cancelled" : "Waiting"}: {c}</Badge>)}
            {!mpesa.length && <span className="text-muted-foreground">None in this period</span>}
          </div>
        </div></CardContent></Card>
      </div>

      {groupBy !== "none" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Totals by {GROUPS[groupBy].toLowerCase()}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>{GROUPS[groupBy]}</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="text-right">Amount (KES)</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell>{groupBy === "day" ? g.label.split("-").reverse().join("/") : g.label}</TableCell>
                    <TableCell className="text-right">{g.count}</TableCell>
                    <TableCell className="text-right font-medium">{g.total.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{total ? ((g.total / total) * 100).toFixed(1) : "0.0"}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter><TableRow><TableCell>Total</TableCell><TableCell className="text-right">{view.length}</TableCell><TableCell className="text-right">{total.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</TableCell><TableCell className="text-right">100%</TableCell></TableRow></TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{DETAIL_HEADERS.map((h) => <TableHead key={h} className={h.startsWith("Amount") ? "text-right whitespace-nowrap" : "whitespace-nowrap"}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={DETAIL_HEADERS.length} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : view.length === 0 ? <TableRow><TableCell colSpan={DETAIL_HEADERS.length} className="text-center py-8 text-muted-foreground">No payments for these choices</TableCell></TableRow>
                : view.slice(0, 300).map((r) => {
                  const x = detailValues(r);
                  x[0] = r.date.split("-").reverse().join("/");
                  return <TableRow key={r.id}>{x.map((c, i) => <TableCell key={i} className={i === 15 ? "text-right font-medium whitespace-nowrap" : "whitespace-nowrap"}>{i === 15 ? Number(c).toLocaleString("en-KE", { minimumFractionDigits: 2 }) : c}</TableCell>)}</TableRow>;
                })}
            </TableBody>
          </Table>
          {view.length > 300 && <p className="text-xs text-muted-foreground mt-2">Showing the first 300 of {view.length}. Exports include all rows.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
