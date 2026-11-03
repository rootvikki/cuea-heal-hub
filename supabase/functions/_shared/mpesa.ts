// deno-lint-ignore-file no-explicit-any
/** Shared M-Pesa (Daraja) helpers used by mpesa-stk-push and mpesa-callback. */

/** Plain-language explanations for the Daraja result codes staff actually see. */
export const MPESA_RESULT_MESSAGES: Record<string, string> = {
  "0": "Payment received.",
  "1": "The patient's M-Pesa balance is too low for this payment.",
  "17": "M-Pesa blocked this payment for security reasons. Ask the patient to try again in a few minutes.",
  "1001": "The patient already has another M-Pesa request open. Ask them to finish or cancel it, then try again.",
  "1019": "The payment request expired before the patient answered. Send the prompt again.",
  "1025": "M-Pesa could not send the prompt. Check the number and try again.",
  "1032": "The patient cancelled the M-Pesa prompt.",
  "1037": "The patient's phone did not respond (switched off, no network, or SIM toolkit not updated). Try again or use the M-Pesa code option.",
  "2001": "The patient entered the wrong M-Pesa PIN.",
  "2002": "The till number and store (head office) number in M-Pesa Settings do not belong together. An administrator must correct them in Settings → M-Pesa.",
  "2029": "M-Pesa could not complete this payment. Check the till/paybill details in Settings → M-Pesa.",
  "9999": "M-Pesa could not send the prompt. Try again.",
};

export const explainResult = (code: unknown, fallback?: string) =>
  MPESA_RESULT_MESSAGES[String(code)] || fallback || "The payment was not completed.";

/**
 * Answers from the status check that only mean "not finished yet" — never a failure.
 * Safaricom returns these while the patient is still entering the PIN or the payment is being processed.
 */
const STILL_PROCESSING_CODES = new Set(["4999", "500.001.1001"]);
export const isStillProcessing = (code: unknown, desc?: unknown) =>
  STILL_PROCESSING_CODES.has(String(code ?? "")) || /still under processing|being processed|in progress/i.test(String(desc ?? ""));

export type MpesaConfig = {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  environment: "production" | "sandbox";
  type: "till" | "paybill";
  /** Sent as BusinessShortCode (store / head-office number for tills, paybill number for paybills). */
  businessShortCode: string;
  /** Sent as PartyB (the till number for tills, paybill number for paybills). */
  partyB: string;
  baseUrl: string;
};

/** Reads M-Pesa settings (Settings page first, then project secrets). */
export async function loadMpesaConfig(supabase: any): Promise<MpesaConfig> {
  const { data: settings } = await supabase.from("system_settings").select("key, value").like("key", "mpesa_%");
  const cfg: Record<string, string> = {};
  for (const s of settings || []) if (s.value) cfg[s.key] = String(s.value).trim();
  const env = (k: string) => (Deno.env.get(k) || "").trim();

  const environment = ((cfg.mpesa_environment || env("MPESA_ENVIRONMENT") || "sandbox").toLowerCase() === "production" ? "production" : "sandbox") as MpesaConfig["environment"];
  const type = ((cfg.mpesa_type || (env("MPESA_BUSINESS_SHORTCODE") ? "till" : "paybill")) === "till" ? "till" : "paybill") as MpesaConfig["type"];

  let businessShortCode: string, partyB: string;
  if (type === "till") {
    partyB = cfg.mpesa_till_number || cfg.mpesa_shortcode || env("MPESA_SHORTCODE") || "";
    businessShortCode = cfg.mpesa_store_number || env("MPESA_BUSINESS_SHORTCODE") || partyB;
  } else {
    businessShortCode = cfg.mpesa_shortcode || env("MPESA_SHORTCODE") || "";
    partyB = businessShortCode;
  }

  return {
    consumerKey: cfg.mpesa_consumer_key || env("MPESA_CONSUMER_KEY"),
    consumerSecret: cfg.mpesa_consumer_secret || env("MPESA_CONSUMER_SECRET"),
    passkey: cfg.mpesa_passkey || env("MPESA_PASSKEY"),
    environment,
    type,
    businessShortCode,
    partyB,
    baseUrl: environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke",
  };
}

/**
 * Marks an M-Pesa transaction as paid and records the payment on the invoice exactly once.
 * Safe to call from both the Safaricom callback and the status check.
 * A confirmed payment also overrides an earlier "failed" (e.g. a status check that gave up too soon).
 * Returns false when another request already finalised it.
 */
export async function finalizeMpesaSuccess(
  supabase: any,
  tx: { id: string; invoice_id: string | null; amount: number; checkout_request_id: string },
  info: { receipt?: string | null; amount?: number | null; paidAt?: Date | null; resultDesc?: string | null },
): Promise<boolean> {
  const paidAt = (info.paidAt || new Date()).toISOString();
  // Conditional update — only one caller can move it to "completed".
  const { data: claimed } = await supabase.from("mpesa_transactions").update({
    status: "completed",
    mpesa_receipt_number: info.receipt || null,
    transaction_date: paidAt,
    result_code: "0",
    result_desc: info.resultDesc || "Payment received",
    updated_at: new Date().toISOString(),
  }).eq("id", tx.id).in("status", ["pending", "failed"]).select("id");
  if (!claimed?.length) return false;

  if (!tx.invoice_id) return true;
  const paidAmount = Number(info.amount || tx.amount);
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", tx.invoice_id).maybeSingle();
  if (!invoice) return true;

  const newAmountPaid = Number(invoice.amount_paid || 0) + paidAmount;
  const newBalance = Math.max(Number(invoice.net_amount) - newAmountPaid, 0);
  const newStatus = newBalance <= 0 ? "paid" : "partial";
  await supabase.from("invoices").update({ amount_paid: newAmountPaid, balance: newBalance, status: newStatus, updated_at: new Date().toISOString() }).eq("id", tx.invoice_id);

  await supabase.from("payments").insert({
    invoice_id: tx.invoice_id,
    patient_id: invoice.patient_id,
    amount: paidAmount,
    payment_method: "mpesa",
    // Without a receipt yet (confirmed by status check), keep the checkout id so the callback can fill in the receipt.
    transaction_ref: info.receipt || tx.checkout_request_id,
    status: "completed",
    paid_at: paidAt,
  });

  // Fully paid: send the patient on (pharmacy collection or check-out)
  if (newStatus === "paid" && invoice.ticket_id) {
    const { data: ticket } = await supabase.from("tickets").select("id, workflow_stage").eq("id", invoice.ticket_id).maybeSingle();
    if (ticket && ticket.workflow_stage === "at_billing") {
      const { data: encs } = await supabase.from("encounters").select("id").eq("ticket_id", ticket.id);
      const encIds = (encs || []).map((e: { id: string }) => e.id);
      let waiting = 0;
      if (encIds.length) {
        const { count } = await supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("encounter_id", encIds).eq("status", "billed");
        waiting = count || 0;
      }
      const now = new Date().toISOString();
      await supabase.from("tickets").update(
        waiting > 0
          ? { status: "at_pharmacy", workflow_stage: "at_pharmacy", updated_at: now }
          : { status: "checked_out", workflow_stage: "checked_out", checked_out_at: now, updated_at: now },
      ).eq("id", ticket.id);
    }
  }
  return true;
}
