import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, FileText, Wallet, Receipt, Users } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const PATIENT_TYPES: Record<string, string> = { cuea_staff: "CUEA Staff", cuea_student: "CUEA Student", outsider: "Outsider" };
const METHODS: Record<string, string> = { mpesa: "M-Pesa", cash: "Cash", card: "Card", insurance: "Insurance", bank_transfer: "Bank Transfer" };
const PERIODS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "custom"] as const;
const PERIOD_LABELS: Record<string, string> = { today: "Today", yesterday: "Yesterday", this_week: "This week", this_month: "This month", last_month: "Last month", this_year: "This year", custom: "Custom dates" };

const iso = (d: Date) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const rangeFor = (p: string): [string, string] => {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (p) {
    case "today": return [iso(now), iso(now)];
    case "yesterday": { const t = new Date(y, m, d - 1); return [iso(t), iso(t)]; }
    case "this_week": { const day = (now.getDay() + 6) % 7; return [iso(new Date(y, m, d - day)), iso(now)]; }
    case "this_month": return [iso(new Date(y, m, 1)), iso(now)];
    case "last_month": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "this_year": return [iso(new Date(y, 0, 1)), iso(now)];
    default: return [iso(new Date(y, m, 1)), iso(now)];
  }
};
const kes = (n: number) => `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentsReport() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<string>("this_month");
  const [from, setFrom] = useState(rangeFor("this_month")[0]);
  const [to, setTo] = useState(rangeFor("this_month")[1]);
  const [patientType, setPatientType] = useState("all");
  const [method, setMethod] = useState("all");
  const [receivedBy, setReceivedBy] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const choosePeriod = (p: string) => {
    setPeriod(p);
    if (p !== "custom") { const [a, b] = rangeFor(p); setFrom(a); setTo(b); }
  };

  const load = async () => {
    setLoading(true);
    let q = supabase.from("payments")
      .select("id, amount, payment_method, transaction_ref, status, paid_at, created_at, received_by, invoices(invoice_number), patients!inner(patient_id, patient_type, profiles!inner(full_name))")
      .gte("created_at", from).lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false }).limit(5000);
    if (patientType !== "all") q = q.eq("patients.patient_type", patientType as any);
    if (method !== "all") q = q.eq("payment_method", method as any);
    if (receivedBy === "system") q = q.is("received_by", null);
    else if (receivedBy !== "all") q = q.eq("received_by", receivedBy);
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast({ title: "Could not load payments", description: error.message, variant: "destructive" }); return; }
    setRows(data || []);
    const ids = Array.from(new Set((data || []).map((r: any) => r.received_by).filter(Boolean))).filter((id) => !staffNames[id as string]);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids as string[]);
      setStaffNames((prev) => ({ ...prev, ...Object.fromEntries((profs || []).map((p) => [p.user_id, p.full_name])) }));
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_all_users_with_roles");
      if (data) {
        const staff = (data as any[]).filter((u) => (u.roles || []).some((r: string) => r && r !== "patient"));
        setStaffNames((prev) => ({ ...prev, ...Object.fromEntries(staff.map((u) => [u.user_id, u.full_name || u.email])) }));
      }
    })();
  }, []);
  useEffect(() => { load(); }, [from, to, patientType, method, receivedBy]);

  const view = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => !s || r.patients?.profiles?.full_name?.toLowerCase().includes(s) || r.patients?.patient_id?.toLowerCase().includes(s) || (r.transaction_ref || "").toLowerCase().includes(s));
  }, [rows, search]);

  const total = view.reduce((a, r) => a + Number(r.amount || 0), 0);
  const byMethod = Object.entries(view.reduce<Record<string, number>>((a, r) => { a[r.payment_method] = (a[r.payment_method] || 0) + Number(r.amount); return a; }, {}));
  const byType = Object.entries(view.reduce<Record<string, number>>((a, r) => { const t = r.patients?.patient_type || "unknown"; a[t] = (a[t] || 0) + Number(r.amount); return a; }, {}));

  const headers = ["Date", "Time", "Receipt / Ref", "Patient", "OPD No.", "Patient Type", "Invoice No.", "Method", "Status", "Received By", "Amount (KES)"];
  const toRow = (r: any) => {
    const d = new Date(r.paid_at || r.created_at);
    return [d.toLocaleDateString(), d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), r.transaction_ref || "-",
      r.patients?.profiles?.full_name || "-", r.patients?.patient_id || "-", PATIENT_TYPES[r.patients?.patient_type] || "-",
      r.invoices?.invoice_number || "-", METHODS[r.payment_method] || r.payment_method, r.status || "-",
      r.received_by ? staffNames[r.received_by] || "Staff" : (r.payment_method === "mpesa" ? "M-Pesa (auto)" : "-"), Number(r.amount || 0)];
  };
  const filterSummary = () => [
    `Period: ${from} to ${to}`,
    `Patient type: ${patientType === "all" ? "All" : PATIENT_TYPES[patientType]}`,
    `Method: ${method === "all" ? "All" : METHODS[method]}`,
    `Received by: ${receivedBy === "all" ? "All users" : receivedBy === "system" ? "System / M-Pesa" : staffNames[receivedBy] || receivedBy}`,
  ];
  const fileBase = `CUEA-Payments-${from}_to_${to}`;

  const exportCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...view.map(toRow), [], ["", "", "", "", "", "", "", "", "", "TOTAL", total]].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${fileBase}.csv`; a.click();
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const n = view.length;
    const details = XLSX.utils.aoa_to_sheet([headers, ...view.map(toRow)]);
    XLSX.utils.sheet_add_aoa(details, [["", "", "", "", "", "", "", "", "", "TOTAL", { f: `SUM(K2:K${n + 1})` } as any]], { origin: `A${n + 3}` });
    details["!cols"] = [12, 8, 18, 26, 14, 14, 14, 14, 12, 22, 14].map((w) => ({ wch: w }));
    const summary = XLSX.utils.aoa_to_sheet([
      ["CUEA Infirmary — Payments Report"], [], ...filterSummary().map((f) => [f]), [`Generated: ${new Date().toLocaleString()}`], [],
      ["Total collected (KES)", { f: `Payments!K${n + 3}` } as any], ["Number of payments", n], [],
      ["By payment method", "Amount (KES)"], ...byMethod.map(([k, v]) => [METHODS[k] || k, v]), [],
      ["By patient type", "Amount (KES)"], ...byType.map(([k, v]) => [PATIENT_TYPES[k] || k, v]),
    ]);
    summary["!cols"] = [{ wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, summary, "Summary");
    XLSX.utils.book_append_sheet(wb, details, "Payments");
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const maroon: [number, number, number] = [128, 0, 32], orange: [number, number, number] = [230, 126, 34];
    let logo: string | null = null;
    try {
      const blob = await (await fetch("/favicon.png")).blob();
      logo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
    } catch { /* no logo */ }
    doc.setFillColor(...maroon); doc.rect(0, 0, W, 28, "F");
    doc.setFillColor(...orange); doc.rect(0, 28, W, 2, "F");
    if (logo) doc.addImage(logo, "PNG", 10, 4, 20, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("CUEA Infirmary", 36, 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("The Catholic University of Eastern Africa", 36, 20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Patient Payments Report", W - 10, 16, { align: "right" });
    doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(filterSummary().join("   |   "), 10, 38);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`Total collected: ${kes(total)}`, 10, 46);
    doc.text(`Payments: ${view.length}`, 110, 46);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`By method: ${byMethod.map(([k, v]) => `${METHODS[k] || k} ${kes(v)}`).join(", ") || "-"}`, 10, 52);
    doc.text(`By patient type: ${byType.map(([k, v]) => `${PATIENT_TYPES[k] || k} ${kes(v)}`).join(", ") || "-"}`, 10, 57);
    autoTable(doc, {
      head: [headers],
      body: view.map((r) => { const x = toRow(r); x[10] = Number(x[10]).toLocaleString(undefined, { minimumFractionDigits: 2 }); return x; }),
      foot: [["", "", "", "", "", "", "", "", "", "TOTAL", total.toLocaleString(undefined, { minimumFractionDigits: 2 })]],
      startY: 62, styles: { fontSize: 7.5 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
      columnStyles: { 10: { halign: "right" } }, alternateRowStyles: { fillColor: [250, 245, 240] },
      margin: { left: 10, right: 10, bottom: 16 },
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(`Generated ${new Date().toLocaleString()}  |  Page ${i} of ${pages}`, W / 2, H - 7, { align: "center" });
    }
    doc.save(`${fileBase}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Payments report — choose what to include</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => choosePeriod(p)}>{PERIOD_LABELS[p]}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-5">
            <div className="space-y-2"><Label>From</Label><Input type="date" value={from} onChange={(e) => { setPeriod("custom"); setFrom(e.target.value); }} className="h-12" /></div>
            <div className="space-y-2"><Label>To</Label><Input type="date" value={to} onChange={(e) => { setPeriod("custom"); setTo(e.target.value); }} className="h-12" /></div>
            <div className="space-y-2"><Label>Patient type</Label>
              <Select value={patientType} onValueChange={setPatientType}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All patients</SelectItem>{Object.entries(PATIENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All methods</SelectItem>{Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Received by</Label>
              <Select value={receivedBy} onValueChange={setReceivedBy}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="system">System / M-Pesa auto</SelectItem>
                  {Object.entries(staffNames).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Search patient / ref</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, OPD no., ref" className="h-12" /></div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={exportPDF} disabled={!view.length}><FileText className="h-4 w-4 mr-2" /> Branded PDF</Button>
            <Button variant="outline" onClick={exportExcel} disabled={!view.length}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</Button>
            <Button variant="outline" onClick={exportCSV} disabled={!view.length}><Download className="h-4 w-4 mr-2" /> CSV</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><Wallet className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total collected</p><p className="text-2xl font-bold">{kes(total)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Receipt className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Payments</p><p className="text-2xl font-bold">{view.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div className="text-sm">
          {byMethod.length ? byMethod.map(([k, v]) => <p key={k}><span className="text-muted-foreground">{METHODS[k] || k}:</span> <strong>{kes(v)}</strong></p>) : <p className="text-muted-foreground">No payments</p>}
        </div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>{headers.map((h) => <TableHead key={h} className={h.startsWith("Amount") ? "text-right" : ""}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={headers.length} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                : view.length === 0 ? <TableRow><TableCell colSpan={headers.length} className="text-center py-8 text-muted-foreground">No payments for these choices</TableCell></TableRow>
                : view.slice(0, 300).map((r) => {
                  const x = toRow(r);
                  return <TableRow key={r.id}>{x.map((c, i) => <TableCell key={i} className={i === 10 ? "text-right font-medium" : ""}>{i === 10 ? Number(c).toLocaleString(undefined, { minimumFractionDigits: 2 }) : c}</TableCell>)}</TableRow>;
                })}
            </TableBody>
          </Table>
          {view.length > 300 && <p className="text-xs text-muted-foreground mt-2">Showing first 300 of {view.length}. Exports include all rows.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
