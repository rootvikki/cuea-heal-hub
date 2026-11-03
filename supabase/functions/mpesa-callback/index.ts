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

    // M-Pesa may send the same callback more than once — only process it once
    if (transaction.status !== "pending") {
      console.log(`Callback for ${CheckoutRequestID} already processed (${transaction.status})`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
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
            // M-Pesa sends Kenyan time (EAT, UTC+3) as YYYYMMDDHHmmss
            const d = String(item.Value);
            const parsed = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}+03:00`);
            transactionDate = isNaN(parsed.getTime()) ? null : parsed;
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

      // Update invoice and record the payment
      if (transaction.invoice_id) {
        const { data: invoice } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", transaction.invoice_id)
          .single();

        if (invoice) {
          const newAmountPaid = Number(invoice.amount_paid || 0) + paidAmount;
          const newBalance = Math.max(Number(invoice.net_amount) - newAmountPaid, 0);
          const newStatus = newBalance <= 0 ? "paid" : "partial";

          await supabase
            .from("invoices")
            .update({ amount_paid: newAmountPaid, balance: newBalance, status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", transaction.invoice_id);

          await supabase.from("payments").insert({
            invoice_id: transaction.invoice_id,
            patient_id: invoice.patient_id,
            amount: paidAmount,
            payment_method: "mpesa",
            transaction_ref: mpesaReceiptNumber,
            status: "completed",
            paid_at: transactionDate?.toISOString() || new Date().toISOString(),
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
