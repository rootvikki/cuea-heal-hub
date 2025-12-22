import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SMSRequest {
  to: string;
  message: string;
  notificationType: string;
  referenceId?: string;
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

    const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
    const username = Deno.env.get("AFRICASTALKING_USERNAME");

    if (!apiKey || !username) {
      throw new Error("Africa's Talking credentials not configured");
    }

    const { to, message, notificationType, referenceId }: SMSRequest = await req.json();

    if (!to || !message) {
      throw new Error("Missing required fields: to, message");
    }

    // Format phone number (ensure it starts with +254 for Kenya)
    let formattedPhone = to.replace(/\s/g, "").replace(/^0/, "+254");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+" + formattedPhone;
    }

    console.log(`Sending SMS to ${formattedPhone}: ${message.substring(0, 50)}...`);

    // Store the notification record first
    const { data: notification, error: insertError } = await supabase
      .from("sms_notifications")
      .insert({
        recipient_phone: formattedPhone,
        message: message,
        notification_type: notificationType || "general",
        reference_id: referenceId,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error storing notification:", insertError);
    }

    // Send SMS via Africa's Talking
    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        apiKey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        username: username,
        to: formattedPhone,
        message: message,
        from: "CUEA-HMS", // Sender ID - needs to be registered with AT
      }),
    });

    const result = await response.json();
    console.log("Africa's Talking Response:", JSON.stringify(result));

    if (result.SMSMessageData?.Recipients?.[0]?.status === "Success") {
      // Update notification status
      if (notification) {
        await supabase
          .from("sms_notifications")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "SMS sent successfully",
          messageId: result.SMSMessageData?.Recipients?.[0]?.messageId,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      const errorMessage = result.SMSMessageData?.Recipients?.[0]?.status || "Unknown error";
      
      if (notification) {
        await supabase
          .from("sms_notifications")
          .update({
            status: "failed",
          })
          .eq("id", notification.id);
      }

      throw new Error(`SMS sending failed: ${errorMessage}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("SMS Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
