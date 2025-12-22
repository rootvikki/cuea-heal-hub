import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallbackMetadata {
  Item: Array<{
    Name: string;
    Value?: string | number;
  }>;
}

interface STKCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: CallbackMetadata;
}

interface MPesaCallback {
  Body: {
    stkCallback: STKCallback;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const callback: MPesaCallback = await req.json();
    const stkCallback = callback.Body.stkCallback;

    console.log("M-Pesa Callback received:", JSON.stringify(stkCallback));

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    // Find the transaction
    const { data: transaction, error: fetchError } = await supabase
      .from("mpesa_transactions")
      .select("*, invoice_id")
      .eq("checkout_request_id", CheckoutRequestID)
      .single();

    if (fetchError || !transaction) {
      console.error("Transaction not found:", fetchError);
      return new Response(JSON.stringify({ success: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Always return 200 to M-Pesa
      });
    }

    if (ResultCode === 0) {
      // Payment successful - extract receipt number and amount
      let mpesaReceiptNumber = "";
      let transactionDate: Date | null = null;
      let paidAmount = transaction.amount;

      if (CallbackMetadata?.Item) {
        for (const item of CallbackMetadata.Item) {
          if (item.Name === "MpesaReceiptNumber") {
            mpesaReceiptNumber = String(item.Value);
          }
          if (item.Name === "TransactionDate") {
            const dateStr = String(item.Value);
            transactionDate = new Date(
              parseInt(dateStr.slice(0, 4)),
              parseInt(dateStr.slice(4, 6)) - 1,
              parseInt(dateStr.slice(6, 8)),
              parseInt(dateStr.slice(8, 10)),
              parseInt(dateStr.slice(10, 12)),
              parseInt(dateStr.slice(12, 14))
            );
          }
          if (item.Name === "Amount") {
            paidAmount = Number(item.Value);
          }
        }
      }

      // Update transaction status
      await supabase
        .from("mpesa_transactions")
        .update({
          status: "completed",
          mpesa_receipt_number: mpesaReceiptNumber,
          transaction_date: transactionDate?.toISOString() || new Date().toISOString(),
          result_code: String(ResultCode),
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      // Update invoice
      if (transaction.invoice_id) {
        const { data: invoice } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", transaction.invoice_id)
          .single();

        if (invoice) {
          const newAmountPaid = (invoice.amount_paid || 0) + paidAmount;
          const newBalance = invoice.net_amount - newAmountPaid;
          const newStatus = newBalance <= 0 ? "paid" : "partial";

          await supabase
            .from("invoices")
            .update({
              amount_paid: newAmountPaid,
              balance: newBalance,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", transaction.invoice_id);

          // Create payment record
          const { data: patientData } = await supabase
            .from("invoices")
            .select("patient_id")
            .eq("id", transaction.invoice_id)
            .single();

          await supabase.from("payments").insert({
            invoice_id: transaction.invoice_id,
            patient_id: patientData?.patient_id,
            amount: paidAmount,
            payment_method: "mpesa",
            transaction_ref: mpesaReceiptNumber,
            status: "completed",
            paid_at: transactionDate?.toISOString() || new Date().toISOString(),
          });
        }
      }

      console.log(`Payment successful: ${mpesaReceiptNumber}`);
    } else {
      // Payment failed
      await supabase
        .from("mpesa_transactions")
        .update({
          status: "failed",
          result_code: String(ResultCode),
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      console.log(`Payment failed: ${ResultDesc}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("M-Pesa Callback Error:", error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // Always return 200 to M-Pesa
    });
  }
});
