import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Smartphone, XCircle, GraduationCap, Shield, RefreshCw, Receipt } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { toMpesaPhone } from "@/lib/validation";
import { formatKES } from "@/lib/pricing";
import { functionErrorMessage, recordPayment, type Invoice, type PaymentMethod } from "@/lib/billing";
import { logAuditEvent } from "@/lib/auditLog";

interface PaymentPanelProps {
  invoice: Invoice;
  /** The visit's payment mode — decides which methods are offered. */
  paymentMode?: string | null;
  patientPhone?: string | null;
  patient?: { admission_number?: string | null; payroll_number?: string | null; insurance_provider?: string | null; insurance_number?: string | null; patient_type?: string | null };
  /** Called after money is recorded. `balance` is what is still owed. */
  onPaid: (balance: number) => void;
}

type MpesaState =
  | { step: "idle" }
  | { step: "sending" }
  | { step: "waiting"; checkoutRequestId: string; since: number; message?: string }
  | { step: "paid"; receipt?: string | null }
  | { step: "failed"; message: string };

/**
 * Take payment for an invoice. Cash is not offered.
 *  • M-Pesa / School fees visits: M-Pesa STK push (with live status), M-Pesa code entered by hand, or school fees / staff account.
 *  • Insurance visits: bill to insurance.
 */
export function PaymentPanel({ invoice, paymentMode, patientPhone, patient, onPaid }: PaymentPanelProps) {
  const isInsurance = paymentMode === "insurance";
  const methods: { key: PaymentMethod | "mpesa_manual"; label: string; icon: typeof Smartphone }[] = isInsurance
    ? [{ key: "insurance", label: "Bill to insurance", icon: Shield }, { key: "mpesa", label: "M-Pesa (co-pay)", icon: Smartphone }]
    : [
        { key: "mpesa", label: "M-Pesa prompt", icon: Smartphone },
        { key: "mpesa_manual", label: "M-Pesa code", icon: Receipt },
        { key: "school_fees", label: "School fees / Staff", icon: GraduationCap },
      ];

  const owed = Number(invoice.balance ?? invoice.net_amount ?? 0);
  const [method, setMethod] = useState<PaymentMethod | "mpesa_manual">(methods[0].key);
  const [amount, setAmount] = useState(String(owed));
  const [phone, setPhone] = useState(patientPhone && toMpesaPhone(patientPhone) ? patientPhone : "");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [mpesa, setMpesa] = useState<MpesaState>({ step: "idle" });
  const pollRef = useRef<number | null>(null);

  useEffect(() => { setAmount(String(owed)); }, [owed]);
  useEffect(() => {
    if (method === "insurance") setReference([patient?.insurance_provider, patient?.insurance_number].filter(Boolean).join(" / "));
    else if (method === "school_fees") setReference(patient?.admission_number || patient?.payroll_number || "");
    else setReference("");
  }, [method, patient]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const stopPolling = () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };

  const checkStatus = async (checkoutRequestId: string, askSafaricom: boolean) => {
    // 1) Our own record (updated by the M-Pesa callback)
    const { data: tx } = await supabase.from("mpesa_transactions").select("status, mpesa_receipt_number, result_desc").eq("checkout_request_id", checkoutRequestId).maybeSingle();
    if (tx?.status === "completed") return finishPaid(tx.mpesa_receipt_number);
    if (tx?.status === "failed") return finishFailed(tx.result_desc || "The payment was not completed.");
    // 2) Ask Safaricom directly (when the callback is slow or blocked)
    if (askSafaricom) {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: { action: "query", checkoutRequestId } });
      if (!error && data?.status === "completed") return finishPaid(data.receipt);
      if (!error && data?.status === "failed") return finishFailed(data.message || "The payment was not completed.");
      if (!error && data?.status === "processing") setMpesa((s) => s.step === "waiting" ? { ...s, message: "Paid on phone — waiting for M-Pesa confirmation…" } : s);
    }
  };

  const finishPaid = async (receipt?: string | null) => {
    stopPolling();
    setMpesa({ step: "paid", receipt });
    const { data: inv } = await supabase.from("invoices").select("balance").eq("id", invoice.id).maybeSingle();
    toast.success("M-Pesa payment received", { description: receipt ? `Receipt ${receipt}` : undefined });
    onPaid(Number(inv?.balance ?? 0));
  };
  const finishFailed = (message: string) => {
    stopPolling();
    setMpesa({ step: "failed", message });
  };

  const sendStk = async () => {
    const amt = Number(amount);
    if (!toMpesaPhone(phone)) return toast.error("Enter a Kenyan Safaricom number, e.g. 0712 345 678");
    if (!(amt >= 1)) return toast.error("Enter the amount to pay");
    setMpesa({ step: "sending" });
    const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
      body: { phoneNumber: toMpesaPhone(phone), amount: amt, invoiceId: invoice.id, accountReference: invoice.invoice_number },
    });
    if (error || !data?.success) {
      const message = await functionErrorMessage(error, data);
      setMpesa({ step: "failed", message });
      return;
    }
    logAuditEvent({ action: "mpesa_stk_push_sent", module: "billing", details: { invoice: invoice.invoice_number, amount: amt } });
    const checkoutRequestId = data.checkoutRequestId as string;
    setMpesa({ step: "waiting", checkoutRequestId, since: Date.now(), message: "Ask the patient to enter their M-Pesa PIN" });
    let ticks = 0;
    stopPolling();
    pollRef.current = window.setInterval(() => {
      ticks += 1;
      // Check our record every 3s; ask Safaricom every 15s; give up after 2 minutes
      void checkStatus(checkoutRequestId, ticks % 5 === 0);
      if (ticks >= 40) {
        stopPolling();
        setMpesa((s) => s.step === "waiting" ? { ...s, message: "No confirmation yet. Press “Check again”, or enter the M-Pesa code by hand." } : s);
      }
    }, 3000);
  };

  const recordOther = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter the amount");
    if (method === "mpesa_manual" && !/^[A-Z0-9]{10}$/.test(reference.trim().toUpperCase())) return toast.error("Enter the 10-character M-Pesa code, e.g. SJK3ABC12D");
    if (!reference.trim()) return toast.error(method === "insurance" ? "Enter the insurance provider / member number" : "Enter the admission / staff number");
    setSaving(true);
    try {
      const ref = method === "mpesa_manual" ? reference.trim().toUpperCase() : reference.trim();
      const balance = await recordPayment(invoice, amt, method, ref);
      toast.success("Payment recorded", { description: `${formatKES(amt)} · ${ref}` });
      onPaid(balance);
    } catch (e) {
      toast.error("Could not record payment", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
        <div>
          <p className="text-xs text-muted-foreground">Invoice {invoice.invoice_number}</p>
          <p className="text-lg font-bold">{formatKES(owed)} <span className="text-sm font-normal text-muted-foreground">to pay</span></p>
        </div>
        <Badge variant="outline">{isInsurance ? "Insurance" : "M-Pesa / School fees"}</Badge>
      </div>

      <div className={cn("grid gap-2", methods.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {methods.map((m) => {
          const Icon = m.icon;
          return (
            <button key={m.key} type="button" onClick={() => { setMethod(m.key); setMpesa({ step: "idle" }); }}
              className={cn("flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 text-xs sm:text-sm font-medium transition-all",
                method === m.key ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50")}>
              <Icon className="h-5 w-5" /> {m.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label>Amount (KES)</Label>
        <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-base" />
      </div>

      {method === "mpesa" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Safaricom number</Label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>

          {mpesa.step === "waiting" && (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm space-y-2">
              <p className="flex items-center gap-2 font-medium text-green-800"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for the patient to pay…</p>
              <p className="text-green-900/80">{mpesa.message}</p>
              <Button size="sm" variant="outline" onClick={() => void checkStatus(mpesa.checkoutRequestId, true)}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Check again</Button>
            </div>
          )}
          {mpesa.step === "paid" && (
            <p className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4" /> Paid{mpesa.receipt ? ` — receipt ${mpesa.receipt}` : ""}
            </p>
          )}
          {mpesa.step === "failed" && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {mpesa.message}
            </p>
          )}

          <Button onClick={sendStk} disabled={mpesa.step === "sending" || mpesa.step === "waiting" || mpesa.step === "paid"} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white">
            {mpesa.step === "sending" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
            {mpesa.step === "failed" ? "Try again" : "Send M-Pesa prompt"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              {method === "mpesa_manual" ? "M-Pesa confirmation code" : method === "insurance" ? "Insurance provider / member no." : "Admission / staff number"}
            </Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-12 text-base uppercase"
              placeholder={method === "mpesa_manual" ? "e.g. SJK3ABC12D" : method === "insurance" ? "e.g. AAR / INS-123456" : "e.g. ADM/2024/001"} />
            {method === "mpesa_manual" && <p className="text-xs text-muted-foreground">Use when the patient paid to the till directly. The code is on their M-Pesa SMS.</p>}
          </div>
          <Button onClick={recordOther} disabled={saving} className="w-full h-12">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {method === "insurance" ? "Bill to insurance" : method === "school_fees" ? "Charge to school fees / staff account" : "Record M-Pesa payment"}
          </Button>
        </div>
      )}
    </div>
  );
}
