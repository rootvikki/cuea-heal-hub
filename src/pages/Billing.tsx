import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { StationQueue } from "@/components/StationQueue";
import { Receipt, CreditCard, Smartphone, FileText, DollarSign, Plus, Trash2, Pencil } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";

const Billing = () => {
  const { toast } = useToast();
  const { getActiveTicket, onPaymentComplete } = useQueueTransition();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [serviceCharges, setServiceCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [chargeSheetOpen, setChargeSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [selectedPatientCharges, setSelectedPatientCharges] = useState<any[]>([]);
  const [editableCharges, setEditableCharges] = useState<any[]>([]);
  const [selectedPatientInfo, setSelectedPatientInfo] = useState<any>(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mpesa");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*, patients!inner(patient_id, user_id, patient_type, payroll_number, admission_number, national_id, profiles!inner(full_name, phone)), invoice_items(*)")
      .order("created_at", { ascending: false });

    if (data) {
      const mapped = (data as any[]).map((invoice) => ({
        ...invoice,
        patient: {
          ...invoice.patients,
          profile: invoice.patients?.profiles,
        },
        items: invoice.invoice_items,
      }));
      setInvoices(mapped);
    }
    setLoading(false);
  };

  // Generate invoice from accumulated service charges for a patient's ticket
  const generateInvoiceFromCharges = async (ticketId: string) => {
    // Get all charges for this ticket
    const { data: charges } = await supabase.from("service_charges").select("*").eq("ticket_id", ticketId);
    if (!charges || charges.length === 0) {
      toast({ title: "No charges", description: "No service charges found for this visit", variant: "destructive" });
      return;
    }

    const patientId = charges[0].patient_id;
    const encounterId = charges[0].encounter_id;
    const totalAmount = charges.reduce((sum, c) => sum + (c.amount || 0), 0);
    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        patient_id: patientId,
        encounter_id: encounterId,
        total_amount: totalAmount,
        net_amount: totalAmount,
        balance: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) {
      toast({ title: "Error", description: invoiceError.message, variant: "destructive" });
      return;
    }

    // Create invoice items from service charges
    const items = charges.map(c => ({
      invoice_id: invoice.id,
      description: c.description,
      quantity: 1,
      unit_price: c.amount,
      total_price: c.amount,
    }));

    await supabase.from("invoice_items").insert(items);

    toast({ title: "Invoice generated", description: `${invoiceNumber} — KES ${totalAmount.toFixed(2)}` });
    logAuditEvent({ action: "invoice_generated", module: "billing", details: { invoice_number: invoiceNumber, patient_id: patientId, total: totalAmount } });
    fetchInvoices();
  };

  const viewChargeSheet = async (ticket: any) => {
    const { data: charges } = await supabase.from("service_charges").select("*").eq("ticket_id", ticket.id).order("created_at");
    
    const { data: patient } = await supabase.from("patients").select("patient_id, user_id, patient_type, payroll_number, admission_number, national_id").eq("id", ticket.patient_id).single();
    const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("user_id", patient?.user_id).single();

    setSelectedPatientCharges(charges || []);
    setEditableCharges((charges || []).map((c: any) => ({ ...c, _edited: false, _isNew: false })));
    setSelectedPatientInfo({ ...patient, profile, ticket });
    setNewItemDesc("");
    setNewItemAmount("");
    setChargeSheetOpen(true);
  };

  // Editable charge helpers
  const updateChargeAmount = (index: number, newAmount: string) => {
    setEditableCharges(prev => prev.map((c, i) => i === index ? { ...c, amount: parseFloat(newAmount) || 0, _edited: true } : c));
  };

  const updateChargeDescription = (index: number, desc: string) => {
    setEditableCharges(prev => prev.map((c, i) => i === index ? { ...c, description: desc, _edited: true } : c));
  };

  const removeCharge = (index: number) => {
    setEditableCharges(prev => prev.filter((_, i) => i !== index));
  };

  const addNewCharge = () => {
    if (!newItemDesc.trim() || !newItemAmount.trim()) return;
    const newCharge = {
      id: `new-${Date.now()}`,
      description: newItemDesc.trim(),
      amount: parseFloat(newItemAmount) || 0,
      billing_stage: "manual",
      patient_id: selectedPatientInfo?.ticket?.patient_id,
      ticket_id: selectedPatientInfo?.ticket?.id,
      service_type: "custom",
      _isNew: true,
      _edited: false,
    };
    setEditableCharges(prev => [...prev, newCharge]);
    setNewItemDesc("");
    setNewItemAmount("");
  };

  const handleGenerateAndPay = async () => {
    if (!selectedPatientInfo?.ticket?.id) return;

    // Save new/edited charges to DB first
    for (const charge of editableCharges) {
      if (charge._isNew) {
        await supabase.from("service_charges").insert({
          description: charge.description,
          amount: charge.amount,
          billing_stage: "manual",
          patient_id: charge.patient_id,
          ticket_id: charge.ticket_id,
          encounter_id: charge.encounter_id || null,
          service_type: "custom",
        });
      } else if (charge._edited) {
        await supabase.from("service_charges").update({
          description: charge.description,
          amount: charge.amount,
        }).eq("id", charge.id);
      }
    }

    // Delete removed charges
    const currentIds = editableCharges.filter(c => !c._isNew).map(c => c.id);
    const removedIds = selectedPatientCharges.filter(c => !currentIds.includes(c.id)).map(c => c.id);
    for (const id of removedIds) {
      await supabase.from("service_charges").delete().eq("id", id);
    }

    await generateInvoiceFromCharges(selectedPatientInfo.ticket.id);
    setChargeSheetOpen(false);
    fetchInvoices();
  };

  const generateChargeSheetPDF = () => {
    if (!selectedPatientInfo || editableCharges.length === 0) return;
    const doc = new jsPDF();
    const total = editableCharges.reduce((s, c) => s + (c.amount || 0), 0);
    const regId = selectedPatientInfo.admission_number || selectedPatientInfo.payroll_number || selectedPatientInfo.national_id || selectedPatientInfo.patient_id;

    // CUEA Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("THE CATHOLIC UNIVERSITY OF EASTERN AFRICA", 105, 20, { align: "center" });
    doc.setFontSize(11);
    doc.text("UNIVERSITY INFIRMARY", 105, 28, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("P.O. BOX 62157-00200, NAIROBI | TEL: 020-8891601", 105, 34, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(20, 38, 190, 38);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("INFIRMARY CHARGE SHEET", 105, 48, { align: "center" });
    doc.setFontSize(10);
    doc.text("TO: CREDIT CONTROLLER", 20, 58);

    doc.setFont("helvetica", "normal");
    doc.text(`Patient Name: ${selectedPatientInfo.profile?.full_name || ""}`, 20, 68);
    doc.text(`REG/ID No.: ${regId}`, 20, 76);
    doc.text(`Patient Type: ${(selectedPatientInfo.patient_type || "outsider").replace("_", " ").toUpperCase()}`, 120, 68);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 120, 76);

    const tableData = editableCharges.map((c, i) => [
      (i + 1).toString(),
      c.description,
      (c.billing_stage || "-").replace("_", " "),
      `KES ${c.amount.toLocaleString()}`,
    ]);

    autoTable(doc, {
      startY: 84,
      head: [["#", "Service Description", "Stage", "Amount (KES)"]],
      body: tableData,
      foot: [["", "", "TOTAL BILL", `KES ${total.toLocaleString()}`]],
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontStyle: "bold" },
      footStyles: { fillColor: [240, 240, 240], fontStyle: "bold", textColor: [0, 0, 0] },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFont("helvetica", "normal");
    doc.text("SR. IN CHARGE: _________________________", 20, finalY);
    doc.text("Date: _________________________", 120, finalY);
    doc.setFontSize(8);
    doc.text("CUEA/DVC/ADM/INF/04/fm01", 20, finalY + 20);

    doc.save(`Charge_Sheet_${regId}_${new Date().toISOString().split("T")[0]}.pdf`);
    toast({ title: "PDF Downloaded", description: "Charge sheet PDF generated" });
  };

  const handlePayment = async () => {
    if (!selectedInvoice) return;
    setProcessingPayment(true);

    try {
      if (paymentMethod === "mpesa") {
        // For M-Pesa: only trigger STK push. The callback handles payment recording.
        const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
          body: {
            phoneNumber: paymentPhone,
            amount: selectedInvoice.balance,
            invoiceId: selectedInvoice.id,
            accountReference: selectedInvoice.invoice_number,
          },
        });
        if (error) throw error;
        toast({ title: "STK Push sent", description: "Check phone to complete M-Pesa payment" });
        logAuditEvent({ action: "mpesa_stk_push_sent", module: "billing", details: { invoice: selectedInvoice.invoice_number, phone: paymentPhone, amount: selectedInvoice.balance } });
        setPaymentDialogOpen(false);
        setPaymentPhone("");
        return;
      }

      // For non-M-Pesa: record payment directly
      const { error: payError } = await supabase.from("payments").insert({
        invoice_id: selectedInvoice.id,
        patient_id: selectedInvoice.patient_id,
        amount: selectedInvoice.balance,
        payment_method: paymentMethod as any,
        transaction_ref: `${paymentMethod.toUpperCase()}-${Date.now().toString().slice(-8)}`,
        status: "completed",
        received_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });

      if (!payError) {
        await supabase.from("invoices").update({
          amount_paid: selectedInvoice.net_amount,
          balance: 0,
          status: "paid",
        }).eq("id", selectedInvoice.id);

        toast({ title: "Payment recorded", description: `Invoice ${selectedInvoice.invoice_number} paid` });
        logAuditEvent({ action: "payment_recorded", module: "billing", details: { invoice: selectedInvoice.invoice_number, method: paymentMethod, amount: selectedInvoice.balance } });

        // Auto-checkout patient
        const ticket = await getActiveTicket(selectedInvoice.patient_id);
        if (ticket && (ticket.status === "at_billing" || ticket.workflow_stage === "at_billing")) {
          await onPaymentComplete({ ticketId: ticket.id });
        }

        fetchInvoices();
      }

      setPaymentDialogOpen(false);
      setPaymentPhone("");
    } catch (error) {
      toast({ title: "Payment error", description: "Failed to process payment", variant: "destructive" });
    } finally {
      setProcessingPayment(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", partial: "bg-blue-100 text-blue-800", paid: "bg-green-100 text-green-800", cancelled: "bg-muted" };
    return colors[status] || "bg-muted";
  };

  const getPaymentMethodLabel = (patientType: string | null) => {
    switch (patientType) {
      case "cuea_staff": return "Payroll / Insurance";
      case "cuea_student": return "Student Account";
      default: return "M-Pesa / Cash";
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["at_billing"]}
        nextStage="checked_out"
        title="Billing Queue"
        onSelectPatient={(ticket) => {
          setSelectedTicket(ticket);
          viewChargeSheet(ticket);
        }}
        selectedTicketId={selectedTicket?.id}
        collapsed={queueCollapsed}
        onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Receipt className="h-7 w-7 text-primary" /> Billing & Payments</h1>
            <p className="text-muted-foreground mt-1">Service charge accumulation & payment processing</p>
          </div>
          {selectedTicket && <WorkflowTimeline currentStage={selectedTicket.workflow_stage || selectedTicket.status} />}
        </div>

        {selectedTicket && <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />}

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-green-100"><DollarSign className="h-6 w-6 text-green-600" /></div><div><p className="text-sm text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">KES {invoices.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0).toLocaleString()}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-yellow-100"><FileText className="h-6 w-6 text-yellow-600" /></div><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{invoices.filter(i => i.status === "pending").length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-red-100"><CreditCard className="h-6 w-6 text-red-600" /></div><div><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold">KES {invoices.reduce((s, i) => s + parseFloat(i.balance || 0), 0).toLocaleString()}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-blue-100"><Receipt className="h-6 w-6 text-blue-600" /></div><div><p className="text-sm text-muted-foreground">Paid Today</p><p className="text-2xl font-bold">{invoices.filter(i => i.status === "paid" && i.updated_at?.startsWith(new Date().toISOString().split('T')[0])).length}</p></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">No invoices yet</TableCell></TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <p>{invoice.patient?.profile?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{invoice.patient?.patient_id}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {(invoice.patient?.patient_type || "outsider").replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>KES {parseFloat(invoice.net_amount).toLocaleString()}</TableCell>
                      <TableCell>KES {parseFloat(invoice.balance).toLocaleString()}</TableCell>
                      <TableCell><Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge></TableCell>
                      <TableCell>
                        {invoice.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => { setSelectedInvoice(invoice); setPaymentDialogOpen(true); }}>
                            <DollarSign className="h-4 w-4 mr-1" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Charge Sheet Dialog */}
      <Dialog open={chargeSheetOpen} onOpenChange={setChargeSheetOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> CUEA Infirmary Charge Sheet</DialogTitle>
            <DialogDescription>TO CREDIT CONTROLLER</DialogDescription>
          </DialogHeader>
          {selectedPatientInfo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Patient Name</p>
                  <p className="font-medium">{selectedPatientInfo.profile?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reg/ID No.</p>
                  <p className="font-medium">{selectedPatientInfo.admission_number || selectedPatientInfo.payroll_number || selectedPatientInfo.national_id || selectedPatientInfo.patient_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Patient Type</p>
                  <Badge variant="outline" className="capitalize">{(selectedPatientInfo.patient_type || "outsider").replace("_", " ")}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Mode</p>
                  <p className="font-medium">{getPaymentMethodLabel(selectedPatientInfo.patient_type)}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Service Description</TableHead>
                    <TableHead className="w-24">Stage</TableHead>
                    <TableHead className="w-36">Amount (KES)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editableCharges.map((charge, idx) => (
                    <TableRow key={charge.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={charge.description}
                          onChange={(e) => updateChargeDescription(idx, e.target.value)}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell className="capitalize text-xs text-muted-foreground">{charge.billing_stage?.replace("_", " ") || "-"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={charge.amount}
                          onChange={(e) => updateChargeAmount(idx, e.target.value)}
                          className="h-8 text-sm font-medium"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeCharge(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Add new item row */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-muted-foreground">
                      <Plus className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="New item description..."
                        value={newItemDesc}
                        onChange={(e) => setNewItemDesc(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">manual</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={newItemAmount}
                        onChange={(e) => setNewItemAmount(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary hover:text-primary"
                        onClick={addNewCharge}
                        disabled={!newItemDesc.trim() || !newItemAmount.trim()}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={3} className="text-right">TOTAL BILL</TableCell>
                    <TableCell colSpan={2}>KES {editableCharges.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setChargeSheetOpen(false)}>Close</Button>
                <Button variant="secondary" onClick={generateChargeSheetPDF} className="gap-2">
                  <FileText className="h-4 w-4" /> Print Charge Sheet
                </Button>
                <Button onClick={handleGenerateAndPay}>Generate Invoice</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              {selectedInvoice && <>Invoice: {selectedInvoice.invoice_number} | Balance: KES {parseFloat(selectedInvoice.balance).toLocaleString()}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "mpesa" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Phone Number</Label>
                <Input type="tel" placeholder="254712345678" value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} className="h-12 text-base" />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
              {paymentMethod === "mpesa" ? (
                <Button onClick={handlePayment} disabled={processingPayment || !paymentPhone} className="bg-green-600 hover:bg-green-700 text-white">
                  <Smartphone className="h-4 w-4 mr-1" /> {processingPayment ? "Sending..." : "Send STK Push"}
                </Button>
              ) : (
                <Button onClick={handlePayment} disabled={processingPayment}>
                  {processingPayment ? "Processing..." : "Complete Payment"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
