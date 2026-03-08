import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Receipt, CreditCard, Smartphone, FileText, DollarSign } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";

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
  const [selectedPatientInfo, setSelectedPatientInfo] = useState<any>(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mpesa");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

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
    setSelectedPatientInfo({ ...patient, profile, ticket });
    setChargeSheetOpen(true);
  };

  const handleGenerateAndPay = async () => {
    if (!selectedPatientInfo?.ticket?.id) return;
    await generateInvoiceFromCharges(selectedPatientInfo.ticket.id);
    setChargeSheetOpen(false);
    fetchInvoices();
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
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Receipt className="h-7 w-7 text-primary" /> Billing & Payments</h1>
            <p className="text-muted-foreground mt-1">Service charge accumulation & payment processing</p>
          </div>
          {selectedTicket && <WorkflowTimeline currentStage={selectedTicket.workflow_stage || selectedTicket.status} />}
        </div>

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
        <DialogContent className="max-w-2xl">
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
                    <TableHead>#</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Amount (KES)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPatientCharges.map((charge, idx) => (
                    <TableRow key={charge.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{charge.description}</TableCell>
                      <TableCell className="capitalize">{charge.billing_stage?.replace("_", " ") || "-"}</TableCell>
                      <TableCell>{charge.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold">
                    <TableCell colSpan={3} className="text-right">TOTAL BILL</TableCell>
                    <TableCell>KES {selectedPatientCharges.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setChargeSheetOpen(false)}>Close</Button>
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
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "mpesa" && (
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input type="tel" placeholder="254712345678" value={paymentPhone} onChange={(e) => setPaymentPhone(e.target.value)} />
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
