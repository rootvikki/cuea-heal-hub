import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { explainResult, finalizeMpesaSuccess, mpesaCallbackToken, sameToken } from "../_shared/mpesa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Safaricom must always get a 200 back, otherwise it keeps retrying.
const ok = (body: unknown = { ResultCode: 0, ResultDesc: "Accepted" }) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Only Safaricom knows the token we put in the callback address; ignore anything else.
    const token = new URL(req.url).searchParams.get("t") || "";
    if (!sameToken(token, await mpesaCallbackToken())) {
      console.warn("M-Pesa callback ignored: missing or wrong token");
      return ok();
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const callback = await req.json();
    const stk = callback?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) return ok();
    console.log("M-Pesa callback:", JSON.stringify(stk));

    const { data: tx } = await supabase.from("mpesa_transactions").select("*").eq("checkout_request_id", stk.CheckoutRequestID).maybeSingle();
    if (!tx) { console.error("Transaction not found", stk.CheckoutRequestID); return ok(); }

    const items: Array<{ Name: string; Value?: string | number }> = stk.CallbackMetadata?.Item || [];
    const get = (n: string) => items.find((i) => i.Name === n)?.Value;
    const receipt = get("MpesaReceiptNumber") ? String(get("MpesaReceiptNumber")) : null;
    let paidAt: Date | null = null;
    const d = get("TransactionDate") ? String(get("TransactionDate")) : "";
    if (d.length === 14) {
      // M-Pesa sends Kenyan time (EAT, UTC+3) as YYYYMMDDHHmmss
      const parsed = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}+03:00`);
      paidAt = isNaN(parsed.getTime()) ? null : parsed;
    }

    if (Number(stk.ResultCode) === 0) {
      // "failed" too: Safaricom's own confirmation wins over an earlier status check that gave up.
      if (tx.status === "pending" || tx.status === "failed") {
        await finalizeMpesaSuccess(supabase, tx, { receipt, amount: get("Amount") ? Number(get("Amount")) : null, paidAt, resultDesc: stk.ResultDesc });
      } else if (tx.status === "completed" && !tx.mpesa_receipt_number && receipt) {
        // Already recorded by the status check — fill in the real receipt number.
        await supabase.from("mpesa_transactions").update({ mpesa_receipt_number: receipt, transaction_date: (paidAt || new Date()).toISOString(), updated_at: new Date().toISOString() }).eq("id", tx.id);
        await supabase.from("payments").update({ transaction_ref: receipt }).eq("transaction_ref", tx.checkout_request_id);
      }
      console.log(`Payment successful: ${receipt}`);
    } else if (tx.status === "pending") {
      await supabase.from("mpesa_transactions").update({
        status: "failed",
        result_code: String(stk.ResultCode),
        result_desc: explainResult(stk.ResultCode, stk.ResultDesc),
        updated_at: new Date().toISOString(),
      }).eq("id", tx.id).eq("status", "pending");
      console.log(`Payment failed (${stk.ResultCode}): ${stk.ResultDesc}`);
    }
    return ok();
  } catch (error) {
    console.error("M-Pesa callback error:", error);
    return ok();
  }
});
