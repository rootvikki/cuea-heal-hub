import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { explainResult, finalizeMpesaSuccess, loadMpesaConfig } from "../_shared/mpesa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAFF_ROLES = ["cashier", "finance_officer", "accountant", "receptionist", "nurse", "doctor", "clinical_officer", "lab_technician", "pharmacist", "radiologist", "admin", "super_admin"];
const ADMIN_ROLES = ["admin", "super_admin"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Daraja expects the timestamp in Kenyan time (EAT, UTC+3): YYYYMMDDHHmmss. */
const darajaTimestamp = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace(/[^0-9]/g, "").slice(0, 14);

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

    // ── Signed-in clinic staff, or a patient paying their own bill ──
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!user) return json({ success: false, error: "Please sign in again to take payments." }, 401);
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
    const isPatient = roles.includes("patient");
    if (!isStaff && !isPatient) return json({ success: false, error: "Your account is not allowed to take payments." }, 403);
    /** Patients may only pay / check their own invoices. */
    const mayUseInvoice = async (invoiceId: string | null | undefined) => {
      if (isStaff) return true;
      if (!invoiceId) return false;
      const { data } = await supabase.from("invoices").select("id, patients!inner(user_id)").eq("id", invoiceId).maybeSingle();
      return (data as { patients?: { user_id?: string } } | null)?.patients?.user_id === user.id;
    };

    const body = await req.json().catch(() => ({}));
    const cfg = await loadMpesaConfig(supabase);
    const summary = {
      environment: cfg.environment,
      type: cfg.type,
      tillOrPaybill: cfg.partyB,
      storeNumber: cfg.type === "till" ? cfg.businessShortCode : null,
      callbackUrl: `${supabaseUrl}/functions/v1/mpesa-callback`,
    };

    const missing = [
      !cfg.consumerKey && "Consumer Key", !cfg.consumerSecret && "Consumer Secret", !cfg.passkey && "Passkey",
      !cfg.partyB && (cfg.type === "till" ? "Till number" : "Paybill number"),
      cfg.type === "till" && !cfg.businessShortCode && "Store (head office) number",
    ].filter(Boolean);
    if (missing.length) {
      return json({ success: false, error: `M-Pesa is not fully set up. Missing: ${missing.join(", ")}. An administrator can add these in Settings → M-Pesa.`, config: summary }, 400);
    }

    const tokenResponse = await fetch(`${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${cfg.consumerKey}:${cfg.consumerSecret}`)}` },
    });
    const tokenText = await tokenResponse.text();
    let accessToken: string | undefined;
    try { accessToken = JSON.parse(tokenText).access_token; } catch { /* not json */ }
    if (!tokenResponse.ok || !accessToken) {
      console.error(`OAuth failed (${tokenResponse.status}):`, tokenText);
      return json({ success: false, error: `M-Pesa rejected the Consumer Key / Secret for the ${cfg.environment === "production" ? "live (production)" : "sandbox"} system. Re-enter them in Settings → M-Pesa.`, config: summary }, 400);
    }

    // ── Connection test (administrators, from Settings). Sends no prompt to anyone. ──
    if (body.action === "test") {
      if (!roles.some((r) => ADMIN_ROLES.includes(r))) return json({ success: false, error: "Only administrators can test the M-Pesa connection." }, 403);
      return json({ success: true, message: "M-Pesa accepted the app keys. Send a KES 1 prompt to your own phone to confirm the till and passkey.", config: summary });
    }

    const timestamp = darajaTimestamp();
    const password = btoa(`${cfg.businessShortCode}${cfg.passkey}${timestamp}`);

    // ── Status check (used when the callback is slow or never arrives) ──
    if (body.action === "query") {
      const checkoutRequestId = String(body.checkoutRequestId || "");
      if (!checkoutRequestId) return json({ success: false, error: "checkoutRequestId is required" }, 400);

      const { data: tx } = await supabase.from("mpesa_transactions").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle();
      if (!(await mayUseInvoice(tx?.invoice_id))) return json({ success: false, error: "Payment not found." }, 404);
      if (tx && tx.status !== "pending") return json({ success: true, status: tx.status, receipt: tx.mpesa_receipt_number, message: tx.result_desc });

      const qRes = await fetch(`${cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: cfg.businessShortCode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId }),
      });
      const q = await qRes.json().catch(() => ({}));
      console.log("STK query:", JSON.stringify(q));
      if (q.ResultCode === undefined) {
        return json({ success: true, status: "pending", message: "Waiting for the patient to enter their PIN…" });
      }
      if (String(q.ResultCode) === "0") {
        // Safaricom confirms payment — record it now even if the callback never arrives.
        if (tx) await finalizeMpesaSuccess(supabase, tx, { amount: tx.amount, resultDesc: q.ResultDesc });
        return json({ success: true, status: "completed", receipt: null, message: "Payment confirmed by M-Pesa." });
      }
      const message = explainResult(q.ResultCode, q.ResultDesc);
      if (tx) {
        await supabase.from("mpesa_transactions").update({
          status: "failed", result_code: String(q.ResultCode), result_desc: message, updated_at: new Date().toISOString(),
        }).eq("id", tx.id).eq("status", "pending");
      }
      return json({ success: true, status: "failed", message });
    }

    // ── Start an STK push ──
    const { phoneNumber, amount, invoiceId, accountReference } = body as { phoneNumber: string; amount: number; invoiceId: string; accountReference?: string };
    if (!phoneNumber || !amount || !invoiceId) return json({ success: false, error: "Phone number, amount and invoice are required." }, 400);
    const phone = toMpesaPhone(phoneNumber);
    if (!phone) return json({ success: false, error: "M-Pesa needs a Kenyan Safaricom number, e.g. 0712 345 678." }, 400);
    const roundedAmount = Math.ceil(Number(amount));
    if (!(roundedAmount >= 1)) return json({ success: false, error: "Amount must be at least KES 1." }, 400);

    const { data: invoice } = await supabase.from("invoices").select("id, invoice_number, balance").eq("id", invoiceId).maybeSingle();
    if (!invoice || !(await mayUseInvoice(invoiceId))) return json({ success: false, error: "Invoice not found." }, 404);
    if (!isStaff && roundedAmount > Math.ceil(Number(invoice.balance || 0))) {
      return json({ success: false, error: "The amount is more than what is owed on this bill." }, 400);
    }

    const stkRes = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: cfg.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: cfg.type === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: roundedAmount,
        PartyA: phone,
        PartyB: cfg.partyB,
        PhoneNumber: phone,
        CallBackURL: summary.callbackUrl,
        // Daraja limits: AccountReference ≤ 12 chars, TransactionDesc ≤ 13 chars
        AccountReference: String(accountReference || invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, "").slice(0, 12) || "CUEA",
        TransactionDesc: "CUEA Clinic",
      }),
    });
    const stk = await stkRes.json().catch(() => ({}));
    console.log("STK push:", JSON.stringify(stk));

    if (String(stk.ResponseCode) !== "0") {
      const raw = String(stk.errorMessage || stk.ResponseDescription || "");
      const friendly = /invalid.*(password|credentials)|wrong credentials/i.test(raw)
        ? "M-Pesa rejected the Passkey / store number combination. Check them in Settings → M-Pesa."
        : /invalid.*(shortcode|partyb|business)/i.test(raw)
        ? "M-Pesa does not recognise the till / store number. Check them in Settings → M-Pesa."
        : raw || "M-Pesa did not accept the request.";
      return json({ success: false, error: friendly }, 400);
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
