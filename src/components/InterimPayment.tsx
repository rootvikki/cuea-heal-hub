import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PaymentPanel } from "@/components/PaymentPanel";
import { createInvoiceForTicket, type Invoice } from "@/lib/billing";
import { formatKES } from "@/lib/pricing";

interface InterimPaymentProps {
  ticketId: string;
  patientId: string;
}

/** "Pay now" from any station: bills everything charged so far on this visit and takes payment (no cash). */
export function InterimPayment({ ticketId, patientId }: InterimPaymentProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [charges, setCharges] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [ticket, setTicket] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const [chg, tk, pt] = await Promise.all([
        supabase.from("service_charges").select("*").eq("ticket_id", ticketId).order("created_at"),
        supabase.from("tickets").select("id, payment_mode").eq("id", ticketId).maybeSingle(),
        supabase.from("patients").select("admission_number, payroll_number, insurance_provider, insurance_number, patient_type, profiles!inner(phone)").eq("id", patientId).maybeSingle(),
      ]);
      setCharges(chg.data || []);
      setTicket(tk.data);
      setPatient(pt.data);
      try {
        setInvoice(await createInvoiceForTicket(ticketId));
      } catch (e) {
        toast.error("Could not prepare the bill", { description: e instanceof Error ? e.message : String(e) });
      }
      setLoading(false);
    })();
  }, [open, ticketId, patientId]);

  const total = charges.reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1 h-8">
        <Receipt className="h-4 w-4" /> Pay now
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pay for this visit</DialogTitle>
            <DialogDescription>Everything charged so far on this visit.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border divide-y text-sm">
                {charges.length === 0 && <p className="p-3 text-muted-foreground">No charges yet.</p>}
                {charges.map((c) => (
                  <div key={c.id} className="flex justify-between gap-3 px-3 py-2">
                    <span>{c.description}</span><span className="whitespace-nowrap">{formatKES(c.amount)}</span>
                  </div>
                ))}
                {charges.length > 0 && (
                  <div className="flex justify-between px-3 py-2 font-bold"><span>Total</span><span>{formatKES(total)}</span></div>
                )}
              </div>
              {invoice && Number(invoice.balance ?? 0) > 0 ? (
                <PaymentPanel
                  invoice={invoice}
                  paymentMode={ticket?.payment_mode}
                  patientPhone={patient?.profiles?.phone}
                  patient={patient}
                  onPaid={async (balance) => {
                    if (balance <= 0) setOpen(false);
                    else setInvoice(await createInvoiceForTicket(ticketId));
                  }}
                />
              ) : charges.length > 0 ? (
                <p className="text-center text-sm font-medium text-[hsl(var(--success))]">Everything on this visit is paid.</p>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
