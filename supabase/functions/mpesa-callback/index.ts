import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const callbackData = await req.json();
    console.log('M-Pesa Callback received:', JSON.stringify(callbackData));

    const { Body } = callbackData;
    const { stkCallback } = Body;

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
    } = stkCallback;

    // Update transaction status
    const updateData: any = {
      result_code: ResultCode.toString(),
      result_desc: ResultDesc,
      status: ResultCode === 0 ? 'completed' : 'failed',
    };

    if (ResultCode === 0) {
      // Successful payment
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      const receiptNumber = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
      const transactionDate = callbackMetadata.find((item: any) => item.Name === 'TransactionDate')?.Value;
      const phoneNumber = callbackMetadata.find((item: any) => item.Name === 'PhoneNumber')?.Value;

      updateData.mpesa_receipt_number = receiptNumber;
      updateData.transaction_date = transactionDate ? new Date(transactionDate.toString()) : new Date();
    }

    const { data: transaction, error: txError } = await supabase
      .from('mpesa_transactions')
      .update(updateData)
      .eq('checkout_request_id', CheckoutRequestID)
      .select()
      .single();

    if (txError) {
      console.error('Error updating transaction:', txError);
      throw txError;
    }

    // If payment successful, update invoice and create payment record
    if (ResultCode === 0 && transaction?.invoice_id) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', transaction.invoice_id)
        .single();

      if (invoice) {
        // Create payment record
        await supabase.from('payments').insert({
          invoice_id: transaction.invoice_id,
          patient_id: invoice.patient_id,
          amount: transaction.amount,
          payment_method: 'mpesa',
          transaction_ref: transaction.mpesa_receipt_number,
          status: 'completed',
        });

        // Update invoice
        const newAmountPaid = parseFloat(invoice.amount_paid || '0') + parseFloat(transaction.amount);
        const newBalance = parseFloat(invoice.net_amount) - newAmountPaid;

        await supabase
          .from('invoices')
          .update({
            amount_paid: newAmountPaid,
            balance: newBalance,
            status: newBalance <= 0 ? 'paid' : 'partial',
          })
          .eq('id', transaction.invoice_id);

        console.log('Invoice updated successfully');
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('M-Pesa callback error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
