import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Loader2 } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";

interface InterimPaymentProps {
  ticketId: string;
  patientId: string;
}

export function InterimPayment({ ticketId, patientId }: InterimPaymentProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [charges, setCharges] = useState<any[]>([]);
  const [existingPayments, setExistingPayments] = useState(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) fetchCharges();
  }, [open]);

  const fetchCharges = async () => {
    const [chargesRes, paymentsRes] = await Promise.all([
      supabase.from("service_charges").select("*").eq("ticket_id", ticketId),
      supabase.from("payments").select("amount").eq("patient_id", patientId).eq("status", "completed"),
    ]);
    setCharges(chargesRes.data || []);
    const paid = (paymentsRes.data || []).reduce((s: number, p: any) => s + (p.amount || 0), 0);
    setExistingPayments(paid);
  };

  const totalCharges = charges.reduce((s, c) => s + (c.amount || 0), 0);
  const balance = totalCharges - existingPayments;

  const handlePay = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) return;
    setProcessing(true);

    try {
      // Find or create invoice
      let invoiceId: string;
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("patient_id", patientId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (existingInvoice) {
        invoiceId = existingInvoice.id;
      } else {
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        const { data: newInv } = await supabase.from("invoices").insert({
          patient_id: patientId,
          invoice_number: invoiceNumber,
          total_amount: totalCharges,
          net_amount: totalCharges,
          amount_paid: 0,
          balance: totalCharges,
          status: "pending",
        }).select("id").single();
        invoiceId = newInv!.id;
      }

      await supabase.from("payments").insert({
        patient_id: patientId,
        invoice_id: invoiceId,
        amount: payAmount,
        payment_method: method as any,
        status: "completed",
        paid_at: new Date().toISOString(),
      });

      // Update invoice
      const newPaid = existingPayments + payAmount;
      const newBalance = totalCharges - newPaid;
      await supabase.from("invoices").update({
        amount_paid: newPaid,
        balance: newBalance,
        status: newBalance <= 0 ? "paid" : "partial",
      }).eq("id", invoiceId);

      await logAuditEvent({
        action: "INTERIM_PAYMENT",
        module: "billing",
        details: { ticket_id: ticketId, amount: payAmount, method, patient_id: patientId },
      });

      toast({ title: "Payment recorded", description: `KES ${payAmount} received via ${method}` });
      setOpen(false);
      setAmount("");
    } catch (error: any) {
      toast({ title: "Payment failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <Receipt className="h-4 w-4" /> Pay Now
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Interim Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              {charges.map(c => (
                <div key={c.id} className="flex justify-between">
                  <span>{c.description}</span>
                  <span>KES {c.amount}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total</span><span>KES {totalCharges.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid</span><span>KES {existingPayments.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-primary">
                <span>Balance</span><span>KES {balance.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Amount (KES)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={balance.toFixed(2)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handlePay} disabled={processing || !amount}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
