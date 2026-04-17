import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface STKPushRequest {
  phoneNumber: string;
  amount: number;
  invoiceId: string;
  accountReference: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read credentials from system_settings first, fallback to env secrets
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_shortcode", "mpesa_passkey", "mpesa_environment"]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) {
      if (s.value) settingsMap[s.key] = s.value;
    }

    // Trim credentials to remove any accidental whitespace/newlines
    const consumerKey = (settingsMap["mpesa_consumer_key"] || Deno.env.get("MPESA_CONSUMER_KEY") || "").trim();
    const consumerSecret = (settingsMap["mpesa_consumer_secret"] || Deno.env.get("MPESA_CONSUMER_SECRET") || "").trim();
    const shortCode = (settingsMap["mpesa_shortcode"] || Deno.env.get("MPESA_SHORTCODE") || "").trim();
    const passkey = (settingsMap["mpesa_passkey"] || Deno.env.get("MPESA_PASSKEY") || "").trim();
    const environment = (settingsMap["mpesa_environment"] || "sandbox").trim();

    console.log(`Credentials check - key len: ${consumerKey.length}, secret len: ${consumerSecret.length}, shortcode: ${shortCode}, passkey len: ${passkey.length}, env: ${environment}`);

    if (!consumerKey || !consumerSecret || !shortCode || !passkey) {
      throw new Error("M-Pesa credentials not configured");
    }

    const { phoneNumber, amount, invoiceId, accountReference }: STKPushRequest = await req.json();

    if (!phoneNumber || !amount || !invoiceId) {
      throw new Error("Missing required fields: phoneNumber, amount, invoiceId");
    }

    // Format phone number (ensure it starts with 254)
    let formattedPhone = phoneNumber.replace(/\s/g, "").replace(/^0/, "254").replace(/^\+/, "");
    if (!formattedPhone.startsWith("254")) {
      formattedPhone = "254" + formattedPhone;
    }

    console.log(`Initiating STK Push for ${formattedPhone}, amount: ${amount}, env: ${environment}`);

    // Determine base URL based on environment
    const baseUrl = environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

    // Get OAuth token
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`Token generation failed (status ${tokenResponse.status}):`, errorText);
      throw new Error(`M-Pesa OAuth failed: ${errorText.slice(0, 200)}. Check your Consumer Key & Secret match the '${environment}' environment.`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error("No access_token in response:", JSON.stringify(tokenData));
      throw new Error("M-Pesa returned no access token. Verify your Consumer Key & Secret.");
    }

    // Generate timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    // Generate password
    const password = btoa(`${shortCode}${passkey}${timestamp}`);

    // Callback URL
    const callbackUrl = `${supabaseUrl}/functions/v1/mpesa-callback`;

    // Initiate STK Push
    const stkPushResponse = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(amount),
          PartyA: formattedPhone,
          PartyB: shortCode,
          PhoneNumber: formattedPhone,
          CallBackURL: callbackUrl,
          AccountReference: accountReference || invoiceId,
          TransactionDesc: `Payment for Invoice ${invoiceId}`,
        }),
      }
    );

    const stkPushData = await stkPushResponse.json();
    console.log("STK Push Response:", JSON.stringify(stkPushData));

    if (stkPushData.ResponseCode === "0") {
      const { error: insertError } = await supabase.from("mpesa_transactions").insert({
        phone_number: formattedPhone,
        amount: amount,
        invoice_id: invoiceId,
        merchant_request_id: stkPushData.MerchantRequestID,
        checkout_request_id: stkPushData.CheckoutRequestID,
        status: "pending",
      });

      if (insertError) {
        console.error("Error storing transaction:", insertError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "STK Push initiated successfully",
          checkoutRequestId: stkPushData.CheckoutRequestID,
          merchantRequestId: stkPushData.MerchantRequestID,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    } else {
      throw new Error(stkPushData.errorMessage || "STK Push failed");
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("M-Pesa STK Push Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
