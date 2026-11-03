import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, FileText, Loader2, RotateCcw, Wallet, Receipt, Stethoscope } from "lucide-react";
import { PaymentsReport } from "@/components/PaymentsReport";
import { logAuditEvent } from "@/lib/auditLog";
import { openPdfWindow } from "@/lib/letterhead";
import { PATIENT_TYPES, PAYMENT_MODES, PERIODS, PERIOD_LABELS, queryBounds, rangeFor } from "@/lib/paymentsQuery";
import {
  BILL_GROUPS, BILL_STATUSES, CHARGE_GROUPS, EMPTY_BILL_FILTERS, EMPTY_CHARGE_FILTERS, SERVICE_TYPES, STAGES,
  billTotals, filterBills, filterCharges, groupBills, groupCharges, label, normaliseBill, normaliseCharge,
  type BillFilters, type BillGroupBy, type ChargeFilters, type ChargeGroupBy,
} from "@/lib/billsQuery";
import { tableCsv, tablePdf, tableWorkbook, type Col } from "@/lib/tableExport";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ddmm = (s: string) => s.split("-").reverse().join("/");
const PAGE = 1000;
const MODES: [string, string][] = [["mpesa", "M-Pesa"], ["school_fees", "School fees"], ["payroll", "Payroll"], ["insurance", "Insurance"]];
const PATIENT_SELECT = "patients(patient_id, patient_type, admission_number, payroll_number, profiles(full_name, phone))";

function useRange() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState(rangeFor("this_month")[0]);
  const [to, setTo] = useState(rangeFor("this_month")[1]);
  const choose = (p: string) => { setPeriod(p); if (p !== "custom") { const [a, b] = rangeFor(p); setFrom(a); setTo(b); } };
  return { period, from, to, choose, setFrom: (v: string) => { setPeriod("custom"); setFrom(v); }, setTo: (v: string) => { setPeriod("custom"); setTo(v); } };
}

/** Pages through a query so long periods are complete (the server returns at most 1000 rows per request). */
// deno-lint-ignore no-explicit-any
async function fetchAll(build: (lo: number, hi: number) => any): Promise<{ rows: any[]; error?: string }> {
  const rows: any[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

function Sel({ label: l, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; all?: string }) {
  return (
    <div className="space-y-2">
      <Label>{l}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          {all && <SelectItem value="all">{all}</SelectItem>}
          {options.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function PeriodPicker({ r }: { r: ReturnType<typeof useRange> }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => <Button key={p} size="sm" variant={r.period === p ? "default" : "outline"} onClick={() => r.choose(p)}>{PERIOD_LABELS[p]}</Button>)}
      </div>
    </>
  );
}

function ExportBar({ onPdf, onExcel, onCsv, disabled, busy }: { onPdf: () => void; onExcel: () => void; onCsv: () => void; disabled: boolean; busy?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onPdf} disabled={disabled || busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />} Branded PDF</Button>
      <Button variant="outline" onClick={onExcel} disabled={disabled}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
      <Button variant="outline" onClick={onCsv} disabled={disabled}><Download className="h-4 w-4 mr-2" /> CSV</Button>
    </div>
  );
}

const csvDownload = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }));
  a.download = name; a.click();
};

function Stat({ icon: Icon, label: l, value, sub }: { icon: typeof Wallet; label: string; value: string | number; sub?: string }) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3"><Icon className="h-8 w-8 text-primary shrink-0" /><div className="min-w-0">
      <p className="text-sm text-muted-foreground">{l}</p><p className="text-xl font-bold break-words">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div></CardContent></Card>
  );
}

// ─────────────── Bills & balances ───────────────
const BILL_COLS: Col[] = [
  { header: "Date", kind: "date" }, { header: "Time", pdf: false }, { header: "Bill No." }, { header: "Patient" }, { header: "OPD No." }, { header: "Phone", pdf: false },
  { header: "Patient type" }, { header: "Admission / Staff No.", pdf: false }, { header: "Ticket" }, { header: "Department", pdf: false }, { header: "Visit payment mode" },
  { header: "Status" }, { header: "Days unpaid", kind: "int" }, { header: "Total (KES)", kind: "money", sum: true, pdf: false }, { header: "Discount (KES)", kind: "money", sum: true, pdf: false },
  { header: "Billed (KES)", kind: "money", sum: true }, { header: "Paid (KES)", kind: "money", sum: true }, { header: "Balance (KES)", kind: "money", sum: true },
];

function BillsReport() {
  const { toast } = useToast();
  const { profile } = useUser();
  const r = useRange();
  const [f, setF] = useState<BillFilters>(EMPTY_BILL_FILTERS);
  const [groupBy, setGroupBy] = useState<BillGroupBy>("none");
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof BillFilters, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!r.from || !r.to || r.from > r.to) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [lo, hi] = queryBounds(r.from, r.to);
      const { rows, error } = await fetchAll((a, b) => supabase.from("invoices")
        .select(`id, invoice_number, created_at, total_amount, discount, net_amount, amount_paid, balance, status, tickets(ticket_number, payment_mode, departments(name)), ${PATIENT_SELECT}`)
        .gte("created_at", lo).lte("created_at", hi).order("created_at", { ascending: false }).range(a, b));
      if (cancelled) return;
      if (error) toast({ title: "Could not load bills", description: error, variant: "destructive" });
      setRaw(rows); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [r.from, r.to]);

  const rows = useMemo(() => raw.map((x) => normaliseBill(x)), [raw]);
  const view = useMemo(() => filterBills(rows, f), [rows, f]);
  const tot = billTotals(view);
  const groups = groupBy === "none" ? [] : groupBills(view, groupBy);
  const departments = [...new Set(rows.map((x) => x.department))].filter((d) => d !== "-").sort();
  const active = Object.entries(f).filter(([k, v]) => v !== (EMPTY_BILL_FILTERS as any)[k]).length;

  const summary = () => {
    const out = [`Bills dated ${ddmm(r.from)} to ${ddmm(r.to)}`];
    if (f.patientType !== "all") out.push(`Patient type: ${PATIENT_TYPES[f.patientType]}`);
    if (f.status !== "all") out.push(`Status: ${BILL_STATUSES[f.status]}`);
    if (f.paymentMode !== "all") out.push(`Visit payment mode: ${PAYMENT_MODES[f.paymentMode]}`);
    if (f.department !== "all") out.push(`Department: ${f.department}`);
    if (f.balance !== "all") out.push(f.balance === "outstanding" ? "Only bills with a balance" : "Only cleared bills");
    if (f.age !== "all") out.push(`Unpaid for ${f.age === "31+" ? "more than 30" : f.age} days`);
    if (f.minAmount || f.maxAmount) out.push(`Bill amount: ${f.minAmount || 0} – ${f.maxAmount || "any"}`);
    if (f.search.trim()) out.push(`Search: "${f.search.trim()}"`);
    return out;
  };
  const values = () => view.map((x) => [x.date, x.time, x.invoice, x.patient, x.opd, x.phone, PATIENT_TYPES[x.patientType] || "Unknown", x.memberNo, x.ticket, x.department,
    PAYMENT_MODES[x.paymentMode] || label({}, x.paymentMode), label(BILL_STATUSES, x.status), x.balance > 0 ? x.ageDays : 0, x.total, x.discount, x.net, x.paid, x.balance]);
  const base = `CUEA-Infirmary-Bills-${r.from}_to_${r.to}`;
  const audit = (format: string) => logAuditEvent({ action: "bills_report_exported", module: "billing", details: { format, from: r.from, to: r.to, rows: view.length, filters: summary() } });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Bills &amp; balances — who was billed, who has paid, what is still owed</CardTitle>
          {active > 0 && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY_BILL_FILTERS)}><RotateCcw className="h-4 w-4 mr-1" /> Clear {active} filter{active > 1 ? "s" : ""}</Button>}
        </CardHeader>
        <CardContent className="space-y-5">
          <PeriodPicker r={r} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
            <div className="space-y-2"><Label>From</Label><Input type="date" className="h-12" value={r.from} max={r.to} onChange={(e) => r.setFrom(e.target.value)} /></div>
            <div className="space-y-2"><Label>To</Label><Input type="date" className="h-12" value={r.to} min={r.from} onChange={(e) => r.setTo(e.target.value)} /></div>
            <Sel label="Patient type" value={f.patientType} onChange={(v) => set("patientType", v)} options={Object.entries(PATIENT_TYPES)} all="All patients" />
            <Sel label="Bill status" value={f.status} onChange={(v) => set("status", v)} options={Object.entries(BILL_STATUSES)} all="Any status" />
            <Sel label="Visit payment mode" value={f.paymentMode} onChange={(v) => set("paymentMode", v)} options={MODES} all="Any mode" />
            <Sel label="Department" value={f.department} onChange={(v) => set("department", v)} options={departments.map((d) => [d, d])} all="All departments" />
            <Sel label="Balance" value={f.balance} onChange={(v) => set("balance", v)} options={[["outstanding", "Still owing"], ["cleared", "Fully paid"]]} all="All bills" />
            <Sel label="Unpaid for" value={f.age} onChange={(v) => set("age", v)} options={[["0-7", "0–7 days"], ["8-30", "8–30 days"], ["31+", "More than 30 days"]]} all="Any time" />
            <div className="space-y-2"><Label>Bill from (KES)</Label><Input type="number" min={0} className="h-12" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} placeholder="0" /></div>
            <div className="space-y-2"><Label>Bill up to (KES)</Label><Input type="number" min={0} className="h-12" value={f.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} placeholder="Any" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Search</Label><Input className="h-12" value={f.search} onChange={(e) => set("search", e.target.value)} placeholder="Name, OPD no., bill no., ticket, phone, admission/staff no." /></div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-full sm:w-64"><Sel label="Group totals by" value={groupBy} onChange={(v) => setGroupBy(v as BillGroupBy)} options={Object.entries(BILL_GROUPS)} /></div>
            <ExportBar disabled={!view.length} busy={busy}
              onCsv={() => { csvDownload(`${base}.csv`, tableCsv(BILL_COLS, values())); audit("csv"); }}
              onExcel={() => { XLSX.writeFile(tableWorkbook({ sheet: "Bills", title: "Bills & balances", cols: BILL_COLS, rows: values(), groupBy: [6, 10, 11, 9], filters: summary() }), `${base}.xlsx`); audit("excel"); }}
              onPdf={() => {
                setBusy(true);
                void openPdfWindow(() => tablePdf({
                  title: "Bills & Balances Report", cols: BILL_COLS, rows: values(), filters: summary(), preparedBy: profile?.full_name,
                  summary: [`Bills: ${tot.count}`, `Billed: ${kes(tot.net)}`, `Paid: ${kes(tot.paid)}`, `Outstanding: ${kes(tot.balance)} (${tot.unpaid} bills)`],
                  group: groupBy === "none" ? undefined : { head: [BILL_GROUPS[groupBy], "Bills", "Billed", "Paid", "Balance"], body: groups.map((g) => [groupBy === "day" ? ddmm(g.label) : g.label, g.count, g.net, g.paid, g.balance]), moneyFrom: 2 },
                })).finally(() => setBusy(false));
                audit("pdf");
              }} />
          </div>
          <p className="text-xs text-muted-foreground">Excel has the full list plus totals by patient type, payment mode, status and department — all live formulas.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Receipt} label="Bills" value={tot.count} sub={view.length !== rows.length ? `of ${rows.length} in period` : undefined} />
        <Stat icon={Wallet} label="Total billed" value={kes(tot.net)} />
        <Stat icon={Wallet} label="Paid" value={kes(tot.paid)} />
        <Stat icon={Wallet} label="Still owed" value={kes(tot.balance)} sub={`${tot.unpaid} bill${tot.unpaid === 1 ? "" : "s"} with a balance`} />
      </div>

      {groups.length > 0 && (
        <Card><CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead><tr className="bg-muted/60 text-left">{[BILL_GROUPS[groupBy], "Bills", "Billed (KES)", "Paid (KES)", "Balance (KES)"].map((h, i) => <th key={h} className={`px-2 py-2 border-b ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{groups.map((g) => (
              <tr key={g.key} className="border-b"><td className="px-2 py-1.5">{groupBy === "day" ? ddmm(g.label) : g.label}</td><td className="px-2 py-1.5 text-right">{g.count}</td>
                <td className="px-2 py-1.5 text-right">{g.net.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td><td className="px-2 py-1.5 text-right">{g.paid.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{g.balance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td></tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
      )}

      <Card><CardContent className="pt-6 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1000px]">
          <thead><tr className="bg-muted/60 text-left">{["Date", "Bill No.", "Patient", "OPD No.", "Type", "Ticket", "Mode", "Status", "Days unpaid", "Billed", "Paid", "Balance"].map((h) => <th key={h} className="px-2 py-2 border-b whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
              : view.length === 0 ? <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">No bills for these choices</td></tr>
              : view.slice(0, 300).map((x) => (
                <tr key={x.id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-1.5 whitespace-nowrap">{ddmm(x.date)}</td><td className="px-2 py-1.5 font-medium">{x.invoice}</td><td className="px-2 py-1.5">{x.patient}</td>
                  <td className="px-2 py-1.5">{x.opd}</td><td className="px-2 py-1.5">{PATIENT_TYPES[x.patientType] || "-"}</td><td className="px-2 py-1.5">{x.ticket}</td>
                  <td className="px-2 py-1.5">{PAYMENT_MODES[x.paymentMode] || label({}, x.paymentMode)}</td>
                  <td className="px-2 py-1.5"><Badge variant={x.status === "paid" ? "default" : x.balance > 0 ? "destructive" : "outline"} className="font-normal">{label(BILL_STATUSES, x.status)}</Badge></td>
                  <td className="px-2 py-1.5 text-right">{x.balance > 0 ? x.ageDays : "-"}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{x.net.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{x.paid.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">{x.balance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {view.length > 300 && <p className="text-xs text-muted-foreground mt-2">Showing the first 300 of {view.length}. Exports include all rows.</p>}
      </CardContent></Card>
    </div>
  );
}

// ─────────────── Services charged ───────────────
const CHARGE_COLS: Col[] = [
  { header: "Date", kind: "date" }, { header: "Time", pdf: false }, { header: "Patient" }, { header: "OPD No." }, { header: "Patient type" }, { header: "Ticket" },
  { header: "Department", pdf: false }, { header: "Visit payment mode" }, { header: "Service type" }, { header: "Station" }, { header: "Service" },
  { header: "On bill" }, { header: "Bill No.", pdf: false }, { header: "Amount (KES)", kind: "money", sum: true },
];

function ChargesReport() {
  const { toast } = useToast();
  const { profile } = useUser();
  const r = useRange();
  const [f, setF] = useState<ChargeFilters>(EMPTY_CHARGE_FILTERS);
  const [groupBy, setGroupBy] = useState<ChargeGroupBy>("service");
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ChargeFilters, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!r.from || !r.to || r.from > r.to) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [lo, hi] = queryBounds(r.from, r.to);
      const { rows, error } = await fetchAll((a, b) => supabase.from("service_charges")
        .select(`id, created_at, service_type, billing_stage, description, amount, invoice_id, invoices(invoice_number), tickets(ticket_number, payment_mode, departments(name)), ${PATIENT_SELECT}`)
        .gte("created_at", lo).lte("created_at", hi).order("created_at", { ascending: false }).range(a, b));
      if (cancelled) return;
      if (error) toast({ title: "Could not load services", description: error, variant: "destructive" });
      setRaw(rows); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [r.from, r.to]);

  const rows = useMemo(() => raw.map(normaliseCharge), [raw]);
  const view = useMemo(() => filterCharges(rows, f), [rows, f]);
  const total = view.reduce((a, x) => a + x.amount, 0);
  const unbilled = view.filter((x) => !x.billed);
  const groups = groupBy === "none" ? [] : groupCharges(view, groupBy);
  const opts = (k: "serviceType" | "stage" | "department", map: Record<string, string>) =>
    [...new Set(rows.map((x) => x[k]))].filter((v) => v !== "-").sort().map((v) => [v, k === "department" ? v : label(map, v)] as [string, string]);
  const active = Object.entries(f).filter(([k, v]) => v !== (EMPTY_CHARGE_FILTERS as any)[k]).length;

  const summary = () => {
    const out = [`Services charged ${ddmm(r.from)} to ${ddmm(r.to)}`];
    if (f.serviceType !== "all") out.push(`Service type: ${label(SERVICE_TYPES, f.serviceType)}`);
    if (f.stage !== "all") out.push(`Station: ${label(STAGES, f.stage)}`);
    if (f.patientType !== "all") out.push(`Patient type: ${PATIENT_TYPES[f.patientType]}`);
    if (f.paymentMode !== "all") out.push(`Visit payment mode: ${PAYMENT_MODES[f.paymentMode]}`);
    if (f.department !== "all") out.push(`Department: ${f.department}`);
    if (f.billed !== "all") out.push(f.billed === "billed" ? "Only items on a bill" : "Only items not yet billed");
    if (f.minAmount || f.maxAmount) out.push(`Amount: ${f.minAmount || 0} – ${f.maxAmount || "any"}`);
    if (f.search.trim()) out.push(`Search: "${f.search.trim()}"`);
    return out;
  };
  const values = () => view.map((x) => [x.date, x.time, x.patient, x.opd, PATIENT_TYPES[x.patientType] || "Unknown", x.ticket, x.department,
    PAYMENT_MODES[x.paymentMode] || label({}, x.paymentMode), label(SERVICE_TYPES, x.serviceType), label(STAGES, x.stage), x.description, x.billed ? "Yes" : "Not yet", x.invoice, x.amount]);
  const base = `CUEA-Infirmary-Services-${r.from}_to_${r.to}`;
  const audit = (format: string) => logAuditEvent({ action: "services_report_exported", module: "billing", details: { format, from: r.from, to: r.to, rows: view.length, filters: summary() } });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Services charged — every consultation, test, procedure and drug charged</CardTitle>
          {active > 0 && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY_CHARGE_FILTERS)}><RotateCcw className="h-4 w-4 mr-1" /> Clear {active} filter{active > 1 ? "s" : ""}</Button>}
        </CardHeader>
        <CardContent className="space-y-5">
          <PeriodPicker r={r} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
            <div className="space-y-2"><Label>From</Label><Input type="date" className="h-12" value={r.from} max={r.to} onChange={(e) => r.setFrom(e.target.value)} /></div>
            <div className="space-y-2"><Label>To</Label><Input type="date" className="h-12" value={r.to} min={r.from} onChange={(e) => r.setTo(e.target.value)} /></div>
            <Sel label="Service type" value={f.serviceType} onChange={(v) => set("serviceType", v)} options={opts("serviceType", SERVICE_TYPES)} all="All services" />
            <Sel label="Station" value={f.stage} onChange={(v) => set("stage", v)} options={opts("stage", STAGES)} all="All stations" />
            <Sel label="Patient type" value={f.patientType} onChange={(v) => set("patientType", v)} options={Object.entries(PATIENT_TYPES)} all="All patients" />
            <Sel label="Visit payment mode" value={f.paymentMode} onChange={(v) => set("paymentMode", v)} options={MODES} all="Any mode" />
            <Sel label="Department" value={f.department} onChange={(v) => set("department", v)} options={opts("department", {})} all="All departments" />
            <Sel label="On a bill?" value={f.billed} onChange={(v) => set("billed", v)} options={[["billed", "Billed"], ["unbilled", "Not yet billed"]]} all="Both" />
            <div className="space-y-2"><Label>Amount from (KES)</Label><Input type="number" min={0} className="h-12" value={f.minAmount} onChange={(e) => set("minAmount", e.target.value)} placeholder="0" /></div>
            <div className="space-y-2"><Label>Amount up to (KES)</Label><Input type="number" min={0} className="h-12" value={f.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} placeholder="Any" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Search</Label><Input className="h-12" value={f.search} onChange={(e) => set("search", e.target.value)} placeholder="Service (e.g. Hemogram), patient, OPD no., ticket, bill no." /></div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="w-full sm:w-64"><Sel label="Group totals by" value={groupBy} onChange={(v) => setGroupBy(v as ChargeGroupBy)} options={Object.entries(CHARGE_GROUPS)} /></div>
            <ExportBar disabled={!view.length} busy={busy}
              onCsv={() => { csvDownload(`${base}.csv`, tableCsv(CHARGE_COLS, values())); audit("csv"); }}
              onExcel={() => { XLSX.writeFile(tableWorkbook({ sheet: "Services", title: "Services charged", cols: CHARGE_COLS, rows: values(), groupBy: [10, 8, 9, 4, 7], filters: summary() }), `${base}.xlsx`); audit("excel"); }}
              onPdf={() => {
                setBusy(true);
                void openPdfWindow(() => tablePdf({
                  title: "Services Charged Report", cols: CHARGE_COLS, rows: values(), filters: summary(), preparedBy: profile?.full_name,
                  summary: [`Items: ${view.length}`, `Total charged: ${kes(total)}`, `Not yet billed: ${unbilled.length} (${kes(unbilled.reduce((a, x) => a + x.amount, 0))})`],
                  group: groupBy === "none" ? undefined : { head: [CHARGE_GROUPS[groupBy], "Items", "Amount"], body: groups.map((g) => [groupBy === "day" ? ddmm(g.label) : g.label, g.count, g.total]), moneyFrom: 2 },
                })).finally(() => setBusy(false));
                audit("pdf");
              }} />
          </div>
          <p className="text-xs text-muted-foreground">Excel has the full list plus totals by service, service type, station, patient type and payment mode — all live formulas.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Stethoscope} label="Items charged" value={view.length} sub={view.length !== rows.length ? `of ${rows.length} in period` : undefined} />
        <Stat icon={Wallet} label="Total charged" value={kes(total)} />
        <Stat icon={Receipt} label="Not yet on a bill" value={unbilled.length} sub={kes(unbilled.reduce((a, x) => a + x.amount, 0))} />
      </div>

      {groups.length > 0 && (
        <Card><CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[480px]">
            <thead><tr className="bg-muted/60 text-left">{[CHARGE_GROUPS[groupBy], "Items", "Amount (KES)", "Share"].map((h, i) => <th key={h} className={`px-2 py-2 border-b ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{groups.map((g) => (
              <tr key={g.key} className="border-b"><td className="px-2 py-1.5">{groupBy === "day" ? ddmm(g.label) : g.label}</td><td className="px-2 py-1.5 text-right">{g.count}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{g.total.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-1.5 text-right">{total ? ((g.total / total) * 100).toFixed(1) : "0.0"}%</td></tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
      )}

      <Card><CardContent className="pt-6 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[960px]">
          <thead><tr className="bg-muted/60 text-left">{["Date", "Patient", "OPD No.", "Type", "Ticket", "Mode", "Station", "Service", "On bill", "Amount"].map((h) => <th key={h} className="px-2 py-2 border-b whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
              : view.length === 0 ? <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No services for these choices</td></tr>
              : view.slice(0, 300).map((x) => (
                <tr key={x.id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-1.5 whitespace-nowrap">{ddmm(x.date)}</td><td className="px-2 py-1.5">{x.patient}</td><td className="px-2 py-1.5">{x.opd}</td>
                  <td className="px-2 py-1.5">{PATIENT_TYPES[x.patientType] || "-"}</td><td className="px-2 py-1.5">{x.ticket}</td>
                  <td className="px-2 py-1.5">{PAYMENT_MODES[x.paymentMode] || label({}, x.paymentMode)}</td><td className="px-2 py-1.5">{label(STAGES, x.stage)}</td>
                  <td className="px-2 py-1.5">{x.description}</td>
                  <td className="px-2 py-1.5">{x.billed ? x.invoice : <Badge variant="outline" className="font-normal">Not yet</Badge>}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap font-semibold">{x.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {view.length > 300 && <p className="text-xs text-muted-foreground mt-2">Showing the first 300 of {view.length}. Exports include all rows.</p>}
      </CardContent></Card>
    </div>
  );
}

/** Billing desk reports: payments received, bills & balances, services charged. */
export function BillingReports() {
  return (
    <Tabs defaultValue="payments" className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="payments">Payments received</TabsTrigger>
        <TabsTrigger value="bills">Bills &amp; balances</TabsTrigger>
        <TabsTrigger value="services">Services charged</TabsTrigger>
      </TabsList>
      <TabsContent value="payments"><PaymentsReport /></TabsContent>
      <TabsContent value="bills"><BillsReport /></TabsContent>
      <TabsContent value="services"><ChargesReport /></TabsContent>
    </Tabs>
  );
}
