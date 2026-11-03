import { useLiveTable } from "@/lib/liveUpdates";
import { Pager, usePaged } from "@/components/Pager";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { StationQueue, StationShell } from "@/components/StationQueue";
import { Receipt, CreditCard, FileText, DollarSign, Plus, Trash2, Send, Printer, CheckCircle2, Search } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { PaymentPanel } from "@/components/PaymentPanel";
import { SendToDialog } from "@/components/SendToDialog";
import { createInvoiceForTicket, routeAfterPayment, setVisitPaymentMode, updateUnpaidBill, type Invoice } from "@/lib/billing";
import { PAYMENT_MODES, allowedPaymentModes, formatKES, paymentModeLabel, type PaymentMode } from "@/lib/pricing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { drawInfirmaryLetterhead, openPdfWindow } from "@/lib/letterhead";
import { printInvoiceReceipt } from "@/lib/receipt";
import { useUser } from "@/contexts/UserContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingReports } from "@/components/BillingReports";
import { BarChart3 } from "lucide-react";

/** Roles that see every bill and the revenue totals. Reception (the billing desk) sees only its queue. */
const FULL_BILLING_ROLES = ["finance_officer", "cashier", "accountant", "admin", "super_admin"];

const statusColor: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", partial: "bg-blue-100 text-blue-800", paid: "bg-green-100 text-green-800", cancelled: "bg-muted" };

const Billing = () => {
  const { hasAnyRole } = useUser();
  const fullView = hasAnyRole(FULL_BILLING_ROLES);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [charges, setCharges] = useState<any[]>([]);
  const [visitInvoices, setVisitInvoices] = useState<Invoice[]>([]);
  const [patientInfo, setPatientInfo] = useState<any>(null);
  const [newItem, setNewItem] = useState({ desc: "", amount: "" });
  const [savingBill, setSavingBill] = useState(false);
  const [payInvoice, setPayInvoice] = useState<any>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [tab, setTab] = useState("desk");

  useEffect(() => { setQueueCollapsed(!!selectedTicket); if (selectedTicket) setTab("desk"); }, [selectedTicket]);

  const fetchInvoices = useCallback(async () => {
    if (!fullView) return;
    const { data } = await supabase
      .from("invoices")
      .select("*, patients!inner(patient_id, user_id, patient_type, payroll_number, admission_number, national_id, insurance_provider, insurance_number, profiles!inner(full_name, phone))")
      .order("created_at", { ascending: false })
      .limit(300);
    setInvoices((data || []).map((inv: any) => ({ ...inv, patient: { ...inv.patients, profile: inv.patients?.profiles } })));
  }, [fullView]);

  useEffect(() => { void fetchInvoices(); }, [fetchInvoices]);

  const loadVisit = useCallback(async (ticket: any) => {
    if (!ticket) return;
    const [chg, inv, pat] = await Promise.all([
      supabase.from("service_charges").select("*").eq("ticket_id", ticket.id).order("created_at"),
      supabase.from("invoices").select("*").eq("ticket_id", ticket.id).order("created_at"),
      supabase.from("patients").select("patient_id, patient_type, payroll_number, admission_number, national_id, insurance_provider, insurance_number, profiles!inner(full_name, phone)").eq("id", ticket.patient_id).maybeSingle(),
    ]);
    // Keep amounts the desk has typed but not yet saved — a live refresh must not undo them
    setCharges((prev) => {
      const edited = new Map(prev.filter((c) => c._edited).map((c) => [c.id, c]));
      return (chg.data || []).map((c: any) => {
        const e = edited.get(c.id);
        return e && (e.invoice_id ?? null) === (c.invoice_id ?? null) ? { ...c, description: e.description, amount: e.amount, _edited: true } : { ...c, _edited: false };
      });
    });
    setVisitInvoices((inv.data || []) as Invoice[]);
    setPatientInfo(pat.data);
  }, []);

  useEffect(() => { if (selectedTicket) void loadVisit(selectedTicket); }, [selectedTicket, loadVisit]);

  // Bills, payments and charges refresh as soon as they are saved anywhere
  useLiveTable(["invoices", "payments", "service_charges"], () => {
    void fetchInvoices();
    if (selectedTicket) void loadVisit(selectedTicket);
  });

  const unbilled = charges.filter((c) => !c.invoice_id);
  const openInvoice = visitInvoices.find((i) => i.status !== "paid");
  // A confirmed bill stays editable at the desk until anything is paid on it
  const editableInvoice = openInvoice && openInvoice.status === "pending" && Number(openInvoice.amount_paid || 0) === 0 ? openInvoice : null;
  const canEditLine = (c: any) => !c.invoice_id || c.invoice_id === editableInvoice?.id;
  const billEdits = editableInvoice ? charges.filter((c) => c._edited && c.invoice_id === editableInvoice.id) : [];
  const visitTotal = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  const visitPaid = visitInvoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);

  const changeMode = async (mode: PaymentMode) => {
    if (!selectedTicket || mode === selectedTicket.payment_mode) return;
    try {
      await setVisitPaymentMode([selectedTicket.id], mode, patientInfo?.patient_type);
      setSelectedTicket({ ...selectedTicket, payment_mode: mode });
      toast.success(`Payment mode changed to ${paymentModeLabel(mode)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const editCharge = (id: string, patch: Record<string, unknown>) => setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, _edited: true } : c)));

  const removeCharge = async (id: string) => {
    const { error } = await supabase.from("service_charges").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const addCharge = async () => {
    if (!selectedTicket || !newItem.desc.trim() || !Number(newItem.amount)) return;
    const { data, error } = await supabase.from("service_charges").insert({
      description: newItem.desc.trim(), amount: Number(newItem.amount), billing_stage: "manual",
      patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, service_type: "custom",
    }).select("*").single();
    if (error) return toast.error(error.message);
    setCharges((prev) => [...prev, { ...data, _edited: false }]);
    setNewItem({ desc: "", amount: "" });
  };

  const createBill = async () => {
    if (!selectedTicket) return;
    setSavingBill(true);
    try {
      // Amounts changed on the already-confirmed (unpaid) bill are saved first
      if (editableInvoice && billEdits.length > 0) {
        const updated = await updateUnpaidBill(editableInvoice, billEdits.map((c) => ({ id: c.id, description: c.description, amount: Number(c.amount) || 0 })));
        setCharges((prev) => prev.map((c) => (c.invoice_id === editableInvoice.id ? { ...c, _edited: false } : c)));
        if (unbilled.length === 0) toast.success(`Bill ${updated.invoice_number} updated`, { description: formatKES(updated.net_amount) });
      }
      // Bill exactly what is on screen now, with the amounts as last shown
      if (unbilled.length > 0) {
        const inv = await createInvoiceForTicket(selectedTicket.id, unbilled.map((c) => ({ id: c.id, description: c.description, amount: Number(c.amount) || 0 })));
        if (!inv) toast.info("Nothing new to bill");
        else toast.success(`Bill ${inv.invoice_number} ready`, { description: formatKES(inv.net_amount) });
      }
      await loadVisit(selectedTicket);
      void fetchInvoices();
    } catch (e) {
      toast.error("Could not save the bill", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingBill(false);
    }
  };

  const afterPaid = async (balance: number) => {
    void fetchInvoices();
    if (!selectedTicket) return;
    await loadVisit(selectedTicket);
    if (balance > 0) return;
    const { data: stillOpen } = await supabase.from("invoices").select("id").eq("ticket_id", selectedTicket.id).neq("status", "paid");
    const { data: newCharges } = await supabase.from("service_charges").select("id").eq("ticket_id", selectedTicket.id).is("invoice_id", null);
    if ((stillOpen?.length || 0) > 0 || (newCharges?.length || 0) > 0) return;
    const next = await routeAfterPayment(selectedTicket.id, selectedTicket.patient?.profile?.full_name);
    toast.success(next === "at_pharmacy" ? "Paid — patient sent back to Pharmacy to collect" : "Paid — patient checked out");
    logAuditEvent({ action: "visit_paid", module: "billing", details: { ticket_id: selectedTicket.id, next } });
    setSelectedTicket(null);
  };

  const printChargeSheet = () => {
    if (!selectedTicket || !patientInfo) return;
    void openPdfWindow(async () => {
      const doc = new jsPDF();
      const regId = patientInfo.admission_number || patientInfo.payroll_number || patientInfo.national_id || patientInfo.patient_id;
      const t = await drawInfirmaryLetterhead(doc, { title: "Infirmary Charge Sheet" });
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("TO: CREDIT CONTROLLER", 20, t + 4);
      doc.setFont("helvetica", "normal");
      doc.text(`Patient Name: ${patientInfo.profiles?.full_name || ""}`, 20, t + 14);
      doc.text(`REG/ID No.: ${regId}`, 20, t + 22);
      doc.text(`Payment mode: ${paymentModeLabel(selectedTicket.payment_mode)}${selectedTicket.payment_mode === "insurance" && patientInfo.insurance_provider ? ` (${patientInfo.insurance_provider} ${patientInfo.insurance_number || ""})` : ""}`, 20, t + 30);
      doc.text(`Patient Type: ${(patientInfo.patient_type || "outsider").replace("cuea_", "").toUpperCase()}`, 120, t + 14);
      doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, 120, t + 22);
      autoTable(doc, {
        startY: t + 38,
        head: [["#", "Service Description", "Department", "Amount (KES)"]],
        body: charges.map((c, i) => [String(i + 1), c.description, (c.billing_stage || "-").replace(/_/g, " "), Number(c.amount).toLocaleString()]),
        foot: [["", "", "TOTAL BILL", visitTotal.toLocaleString()], ["", "", "PAID", visitPaid.toLocaleString()], ["", "", "BALANCE", Math.max(visitTotal - visitPaid, 0).toLocaleString()]],
        theme: "grid",
        headStyles: { fillColor: [128, 0, 32], fontStyle: "bold" },
        footStyles: { fillColor: [240, 240, 240], fontStyle: "bold", textColor: [0, 0, 0] },
        styles: { fontSize: 9 },
      });
      const y = (doc as any).lastAutoTable.finalY + 20;
      doc.text("SR. IN CHARGE: _________________________", 20, y);
      doc.text("Date: _________________________", 120, y);
      doc.setFontSize(8); doc.text("CUEA/DVC/ADM/INF/04/fm01", 20, y + 20);
      return doc;
    }, { autoPrint: true });
  };

  const filteredInvoices = invoices.filter((i) => {
    const s = invoiceSearch.toLowerCase();
    return !s || [i.invoice_number, i.patient?.profile?.full_name, i.patient?.patient_id].some((x: string) => x?.toLowerCase().includes(s));
  });
  const todayStr = new Date().toISOString().split("T")[0];
  const billPages = usePaged(filteredInvoices, { resetKey: invoiceSearch });

  return (
    <StationShell
      queue={
        <StationQueue
          stationStages={["at_billing"]}
          nextStage="checked_out"
          title="Billing Queue"
          onSelectPatient={setSelectedTicket}
          selectedTicketId={selectedTicket?.id}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Receipt className="h-7 w-7 text-primary" /> Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Check the bill, take M-Pesa / school fees / payroll / insurance, and the patient moves on automatically</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="desk" className="gap-1.5"><Receipt className="h-4 w-4" /> Billing desk</TabsTrigger>
        <TabsTrigger value="reports" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="desk" className="space-y-6">
      {selectedTicket ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{selectedTicket.patient?.profile?.full_name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedTicket.ticket_number} · {selectedTicket.patient?.patient_id}
                  {patientInfo && (patientInfo.admission_number || patientInfo.payroll_number) ? ` · ${patientInfo.admission_number || patientInfo.payroll_number}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Select value={selectedTicket.payment_mode || ""} onValueChange={(v) => void changeMode(v as PaymentMode)} disabled={!!visitInvoices.some((i) => Number(i.amount_paid || 0) > 0)}>
                    <SelectTrigger className="h-7 w-auto gap-1 rounded-full border-primary bg-primary text-primary-foreground text-xs font-semibold px-3" aria-label="Payment mode">
                      <SelectValue placeholder="Payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.filter((m) => allowedPaymentModes(patientInfo?.patient_type).includes(m.value)).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedTicket.payment_mode === "insurance" && patientInfo?.insurance_provider && <Badge variant="outline">{patientInfo.insurance_provider} {patientInfo.insurance_number}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={printChargeSheet}><Printer className="h-4 w-4 mr-1" /> Charge sheet</Button>
                <Button variant="outline" size="sm" onClick={() => setSendOpen(true)}><Send className="h-4 w-4 mr-1" /> Send to…</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-5">
            {/* Charges */}
            <div className="lg:col-span-3 space-y-3 min-w-0">
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/60">
                    <tr className="text-left">
                      <th className="px-2 py-2 border-b w-8 hidden sm:table-cell">#</th>
                      <th className="px-2 py-2 border-b">Service</th>
                      <th className="px-2 py-2 border-b w-28 hidden sm:table-cell">Dept.</th>
                      <th className="px-2 py-2 border-b w-24 sm:w-32 text-right">KES</th>
                      <th className="px-2 py-2 border-b w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((c, i) => (
                      <tr key={c.id} className="border-b">
                        <td className="px-2 py-1.5 text-muted-foreground hidden sm:table-cell">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          {canEditLine(c) ? <Input value={c.description} onChange={(e) => editCharge(c.id, { description: e.target.value })} className="h-8 text-sm" aria-label={`Service ${i + 1}`} /> : c.description}
                        </td>
                        <td className="px-2 py-1.5 capitalize text-xs text-muted-foreground hidden sm:table-cell">{(c.billing_stage || "-").replace(/_/g, " ")}</td>
                        <td className="px-2 py-1.5 text-right">
                          {canEditLine(c) ? <Input type="number" min={0} inputMode="decimal" value={c.amount} onChange={(e) => editCharge(c.id, { amount: e.target.value })} className={`h-8 text-sm text-right ${c._edited ? "border-primary ring-1 ring-primary/40" : ""}`} aria-label={`KES for ${c.description}`} /> : Number(c.amount).toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5">
                          {c.invoice_id ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" aria-label="On a bill" /> : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeCharge(c.id)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td className="px-2 py-1.5 hidden sm:table-cell"><Plus className="h-4 w-4 text-muted-foreground" /></td>
                      <td className="px-2 py-1.5"><Input placeholder="Add item…" value={newItem.desc} onChange={(e) => setNewItem({ ...newItem, desc: e.target.value })} className="h-8 text-sm" /></td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground hidden sm:table-cell">manual</td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} placeholder="0" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} className="h-8 text-sm text-right" /></td>
                      <td className="px-2 py-1.5"><Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={addCharge} disabled={!newItem.desc.trim() || !Number(newItem.amount)} aria-label="Add"><Plus className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="font-bold"><td className="hidden sm:table-cell" colSpan={2} /><td className="px-2 py-2 text-right">Total</td><td className="px-2 py-2 text-right">{visitTotal.toLocaleString()}</td><td /></tr>
                    <tr><td className="hidden sm:table-cell" colSpan={2} /><td className="px-2 py-1 text-right text-muted-foreground">Paid</td><td className="px-2 py-1 text-right">{visitPaid.toLocaleString()}</td><td /></tr>
                    <tr className="font-bold text-primary"><td className="hidden sm:table-cell" colSpan={2} /><td className="px-2 py-2 text-right">Balance</td><td className="px-2 py-2 text-right">{Math.max(visitTotal - visitPaid, 0).toLocaleString()}</td><td /></tr>
                  </tfoot>
                </table>
              </div>
              {editableInvoice && unbilled.length === 0 && billEdits.length === 0 && (
                <p className="text-xs text-muted-foreground">You can still change amounts on bill {editableInvoice.invoice_number} until a payment is taken.</p>
              )}
              {(unbilled.length > 0 || billEdits.length > 0) && (
                <Button onClick={createBill} disabled={savingBill} className="w-full h-11">
                  <FileText className="h-4 w-4 mr-2" />
                  {savingBill ? "Saving…" : unbilled.length > 0 ? `Confirm bill (${unbilled.length + billEdits.length} item${unbilled.length + billEdits.length > 1 ? "s" : ""})` : `Save changed amounts (${billEdits.length})`}
                </Button>
              )}
            </div>

            {/* Payment */}
            <div className="lg:col-span-2 min-w-0">
              {openInvoice && billEdits.length > 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Save the changed amounts to take payment.</div>
              ) : openInvoice ? (
                <PaymentPanel
                  key={`${openInvoice.id}-${selectedTicket.payment_mode}-${openInvoice.net_amount}`}
                  invoice={openInvoice}
                  paymentMode={selectedTicket.payment_mode}
                  patientPhone={patientInfo?.profiles?.phone}
                  patient={patientInfo}
                  onPaid={afterPaid}
                />
              ) : unbilled.length > 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Confirm the bill to take payment.</div>
              ) : (
                <div className="rounded-lg border p-6 text-center space-y-3">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-[hsl(var(--success))]" />
                  <p className="font-medium">Nothing to pay</p>
                  <Button onClick={() => afterPaid(0)}>Finish visit</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : !fullView ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground space-y-1">
          <Receipt className="h-8 w-8 mx-auto opacity-60" />
          <p className="font-medium text-foreground">Pick a patient from the Billing queue</p>
          <p className="text-sm">Patients appear here once a station sends them to billing.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2.5 rounded-full bg-green-100"><DollarSign className="h-5 w-5 text-green-600" /></div><div><p className="text-xs text-muted-foreground">Collected</p><p className="text-lg font-bold">{formatKES(invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0))}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2.5 rounded-full bg-yellow-100"><FileText className="h-5 w-5 text-yellow-600" /></div><div><p className="text-xs text-muted-foreground">Unpaid bills</p><p className="text-lg font-bold">{invoices.filter((i) => i.status !== "paid").length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2.5 rounded-full bg-red-100"><CreditCard className="h-5 w-5 text-red-600" /></div><div><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-bold">{formatKES(invoices.reduce((s, i) => s + Number(i.balance || 0), 0))}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2.5 rounded-full bg-blue-100"><Receipt className="h-5 w-5 text-blue-600" /></div><div><p className="text-xs text-muted-foreground">Paid today</p><p className="text-lg font-bold">{invoices.filter((i) => i.status === "paid" && i.updated_at?.startsWith(todayStr)).length}</p></div></CardContent></Card>
        </div>
      )}

      {fullView && <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-5 w-5" /> Bills</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-10" placeholder="Search bill or patient…" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[620px]">
            <thead className="bg-muted/60">
              <tr className="text-left">{["Bill #", "Patient", "Date", "Amount", "Balance", "Status", ""].map((h) => <th key={h} className="px-2 py-2 border-b">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No bills</td></tr>
              ) : billPages.pageItems.map((inv) => (
                <tr key={inv.id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-2 font-medium">{inv.invoice_number}</td>
                  <td className="px-2 py-2"><p>{inv.patient?.profile?.full_name}</p><p className="text-xs text-muted-foreground">{inv.patient?.patient_id}</p></td>
                  <td className="px-2 py-2 whitespace-nowrap">{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}</td>
                  <td className="px-2 py-2">{formatKES(inv.net_amount)}</td>
                  <td className="px-2 py-2">{formatKES(inv.balance)}</td>
                  <td className="px-2 py-2"><Badge className={statusColor[inv.status] || "bg-muted"}>{inv.status}</Badge></td>
                  <td className="px-2 py-2 text-right whitespace-nowrap space-x-1.5">
                    {Number(inv.amount_paid || 0) > 0 && <Button size="sm" variant="ghost" onClick={() => void printInvoiceReceipt(inv.id).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))}>
                      <Printer className="h-4 w-4 mr-1" /> Receipt
                    </Button>}
                    {inv.status !== "paid" && <Button size="sm" variant="outline" onClick={async () => {
                      const { data: t } = inv.ticket_id ? await supabase.from("tickets").select("payment_mode").eq("id", inv.ticket_id).maybeSingle() : { data: null };
                      setPayInvoice({ ...inv, payment_mode: (t as any)?.payment_mode ?? "mpesa" });
                    }}><DollarSign className="h-4 w-4 mr-1" /> Pay</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager pager={billPages} label="bills" />
        </CardContent>
      </Card>}
      </TabsContent>
      <TabsContent value="reports"><BillingReports /></TabsContent>
      </Tabs>

      <Dialog open={!!payInvoice} onOpenChange={(o) => !o && setPayInvoice(null)}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>{payInvoice?.patient?.profile?.full_name}</DialogDescription>
          </DialogHeader>
          {payInvoice && (
            <PaymentPanel
              key={`${payInvoice.id}-${payInvoice.payment_mode}`}
              invoice={payInvoice}
              paymentMode={payInvoice.payment_mode}
              patientPhone={payInvoice.patient?.profile?.phone}
              patient={payInvoice.patient}
              onPaid={async (balance) => {
                void fetchInvoices();
                if (balance <= 0) {
                  if (payInvoice.ticket_id) {
                    const { data: t } = await supabase.from("tickets").select("workflow_stage").eq("id", payInvoice.ticket_id).maybeSingle();
                    if (t?.workflow_stage === "at_billing") await routeAfterPayment(payInvoice.ticket_id, payInvoice.patient?.profile?.full_name);
                  }
                  setPayInvoice(null);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <SendToDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        ticket={selectedTicket ? { id: selectedTicket.id, patientName: selectedTicket.patient?.profile?.full_name } : null}
        from="Billing"
        exclude={["billing"]}
        onSent={() => setSelectedTicket(null)}
      />
    </StationShell>
  );
};

export default Billing;
