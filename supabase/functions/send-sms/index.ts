import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  phoneNumber: string;
  message: string;
  notificationType: string;
  referenceId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { phoneNumber, message, notificationType, referenceId }: SMSRequest = await req.json();
    console.log('Sending SMS:', { phoneNumber, notificationType });

    const apiKey = Deno.env.get('AFRICASTALKING_API_KEY');
    const username = Deno.env.get('AFRICASTALKING_USERNAME');

    if (!apiKey || !username) {
      throw new Error('Africa\'s Talking credentials not configured');
    }

    // Format phone number
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Send SMS via Africa's Talking
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
      },
      body: new URLSearchParams({
        'username': username,
        'to': formattedPhone,
        'message': message,
      }),
    });

    const data = await response.json();
    console.log('Africa\'s Talking response:', data);

    const status = data.SMSMessageData?.Recipients?.[0]?.status === 'Success' ? 'sent' : 'failed';

    // Save SMS notification to database
    await supabase.from('sms_notifications').insert({
      recipient_phone: formattedPhone,
      message: message,
      status: status,
      notification_type: notificationType,
      reference_id: referenceId,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });

    return new Response(
      JSON.stringify({
        success: status === 'sent',
        message: status === 'sent' ? 'SMS sent successfully' : 'SMS failed to send',
        data: data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('SMS sending error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
