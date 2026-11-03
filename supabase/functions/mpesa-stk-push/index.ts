import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAFF_ROLES = ["cashier", "finance_officer", "accountant", "receptionist", "nurse", "doctor", "clinical_officer", "lab_technician", "pharmacist", "radiologist", "admin", "super_admin"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Daraja expects the timestamp in Kenyan time (EAT, UTC+3): YYYYMMDDHHmmss. */
const darajaTimestamp = () => {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
};

/** 2547XXXXXXXX / 2541XXXXXXXX, or null if not a Kenyan mobile number. */
const toMpesaPhone = (phone: string) => {
  let p = String(phone || "").replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = "254" + p;
  return /^254[17]\d{8}$/.test(p) ? p : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Only signed-in clinic staff may start or check payments ──
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ success: false, error: "Please sign in again to take payments." }, 401);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles || []).some((r: { role: string }) => STAFF_ROLES.includes(r.role))) {
      return json({ success: false, error: "Your account is not allowed to take payments." }, 403);
    }

    // ── Credentials: system_settings first, then environment secrets ──
    const { data: settings } = await supabase
      .from("system_settings").select("key, value")
      .in("key", ["mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_shortcode", "mpesa_passkey", "mpesa_environment"]);
    const cfg: Record<string, string> = {};
    for (const s of settings || []) if (s.value) cfg[s.key] = String(s.value);

    const consumerKey = (cfg.mpesa_consumer_key || Deno.env.get("MPESA_CONSUMER_KEY") || "").trim();
    const consumerSecret = (cfg.mpesa_consumer_secret || Deno.env.get("MPESA_CONSUMER_SECRET") || "").trim();
    const tillNumber = (cfg.mpesa_shortcode || Deno.env.get("MPESA_SHORTCODE") || "").trim();
    // Buy Goods (Till): MPESA_BUSINESS_SHORTCODE = store / head-office number. PayBill: same as the shortcode.
    const businessShortCode = (Deno.env.get("MPESA_BUSINESS_SHORTCODE") || "").trim() || tillNumber;
    const passkey = (cfg.mpesa_passkey || Deno.env.get("MPESA_PASSKEY") || "").trim();
    const environment = (cfg.mpesa_environment || Deno.env.get("MPESA_ENVIRONMENT") || "sandbox").trim().toLowerCase();
    const isTill = !!Deno.env.get("MPESA_BUSINESS_SHORTCODE");
    const transactionType = isTill ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
    const baseUrl = environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

    if (!consumerKey || !consumerSecret || !tillNumber || !passkey) {
      return json({ success: false, error: "M-Pesa is not set up yet. An administrator must enter the M-Pesa keys in Settings." }, 400);
    }

    const tokenResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
    });
    if (!tokenResponse.ok) {
      const t = await tokenResponse.text();
      console.error(`OAuth failed (${tokenResponse.status}):`, t);
      return json({ success: false, error: `M-Pesa rejected the app keys. Check the Consumer Key/Secret are for the '${environment}' environment.` }, 400);
    }
    const accessToken = (await tokenResponse.json()).access_token;
    if (!accessToken) return json({ success: false, error: "M-Pesa returned no access token. Verify the Consumer Key & Secret." }, 400);

    const body = await req.json();
    const timestamp = darajaTimestamp();
    const password = btoa(`${businessShortCode}${passkey}${timestamp}`);

    // ── Status check (used when the callback is slow or never arrives) ──
    if (body.action === "query") {
      const checkoutRequestId = String(body.checkoutRequestId || "");
      if (!checkoutRequestId) return json({ success: false, error: "checkoutRequestId is required" }, 400);

      const { data: tx } = await supabase.from("mpesa_transactions").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle();
      if (tx && tx.status !== "pending") return json({ success: true, status: tx.status, receipt: tx.mpesa_receipt_number, message: tx.result_desc });

      const qRes = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: businessShortCode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
      });
      const q = await qRes.json();
      console.log("STK query:", JSON.stringify(q));
      // Still being processed on the phone
      if (q.errorCode === "500.001.1001" || q.ResultCode === undefined) {
        return json({ success: true, status: "pending", message: q.errorMessage || q.ResultDesc || "Waiting for the customer" });
      }
      const ok = String(q.ResultCode) === "0";
      if (!ok && tx) {
        await supabase.from("mpesa_transactions").update({
          status: "failed", result_code: String(q.ResultCode), result_desc: q.ResultDesc, updated_at: new Date().toISOString(),
        }).eq("id", tx.id).eq("status", "pending");
      }
      // A successful query has no receipt number — the callback records the payment.
      return json({ success: true, status: ok ? "processing" : "failed", message: q.ResultDesc });
    }

    // ── Start an STK push ──
    const { phoneNumber, amount, invoiceId, accountReference } = body as { phoneNumber: string; amount: number; invoiceId: string; accountReference?: string };
    if (!phoneNumber || !amount || !invoiceId) return json({ success: false, error: "Phone number, amount and invoice are required." }, 400);
    const phone = toMpesaPhone(phoneNumber);
    if (!phone) return json({ success: false, error: "M-Pesa needs a Kenyan Safaricom number, e.g. 0712 345 678." }, 400);
    const roundedAmount = Math.ceil(Number(amount));
    if (!(roundedAmount >= 1)) return json({ success: false, error: "Amount must be at least KES 1." }, 400);

    const { data: invoice } = await supabase.from("invoices").select("id, invoice_number, balance").eq("id", invoiceId).maybeSingle();
    if (!invoice) return json({ success: false, error: "Invoice not found." }, 404);

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: roundedAmount,
        PartyA: phone,
        PartyB: tillNumber,
        PhoneNumber: phone,
        CallBackURL: `${supabaseUrl}/functions/v1/mpesa-callback`,
        // Daraja limits: AccountReference ≤ 12 chars, TransactionDesc ≤ 13 chars
        AccountReference: String(accountReference || invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, "").slice(0, 12),
        TransactionDesc: "CUEA Clinic",
      }),
    });
    const stk = await stkRes.json();
    console.log("STK push:", JSON.stringify(stk));

    if (String(stk.ResponseCode) !== "0") {
      return json({ success: false, error: stk.errorMessage || stk.ResponseDescription || "M-Pesa did not accept the request." }, 400);
    }

    const { error: insertError } = await supabase.from("mpesa_transactions").insert({
      phone_number: phone,
      amount: roundedAmount,
      invoice_id: invoiceId,
      merchant_request_id: stk.MerchantRequestID,
      checkout_request_id: stk.CheckoutRequestID,
      status: "pending",
    });
    if (insertError) console.error("Error storing transaction:", insertError);

    return json({
      success: true,
      message: stk.CustomerMessage || "Request sent to the phone",
      checkoutRequestId: stk.CheckoutRequestID,
      merchantRequestId: stk.MerchantRequestID,
    });
  } catch (error: unknown) {
    console.error("M-Pesa error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
