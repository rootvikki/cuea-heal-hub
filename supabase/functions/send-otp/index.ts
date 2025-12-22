import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OTPRequest {
  email: string;
  userId: string;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, userId }: OTPRequest = await req.json();

    if (!email || !userId) {
      throw new Error("Email and userId are required");
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = 465; // Use port 465 for implicit TLS (SMTPS)
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || smtpUser;
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "CUEA Infirmary";

    if (!smtpHost || !smtpUser || !smtpPassword) {
      throw new Error("SMTP configuration is missing");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate previous OTPs for this user
    await supabase
      .from("email_otp_tokens")
      .update({ verified: true })
      .eq("user_id", userId)
      .eq("verified", false);

    // Store new OTP
    const { error: insertError } = await supabase
      .from("email_otp_tokens")
      .insert({
        user_id: userId,
        email: email,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      throw new Error("Failed to store OTP");
    }

    console.log(`Connecting to SMTP server: ${smtpHost}:${smtpPort}`);

    // Send OTP via email using port 465 (implicit TLS)
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background-color:#f4f4f4;}
.container{max-width:600px;margin:0 auto;padding:20px;}
.header{background:linear-gradient(135deg,#0066cc,#0099cc);padding:20px;text-align:center;color:white;border-radius:8px 8px 0 0;}
.content{background:#f9f9f9;padding:30px;border-radius:0 0 8px 8px;}
.otp-code{font-size:32px;font-weight:bold;color:#0066cc;text-align:center;padding:20px;background:white;border-radius:8px;margin:20px 0;letter-spacing:8px;}
.footer{text-align:center;color:#666;font-size:12px;margin-top:20px;}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>🏥 ${fromName}</h1>
<p>Login Verification Code</p>
</div>
<div class="content">
<p>Hello,</p>
<p>Your one-time verification code is:</p>
<div class="otp-code">${otpCode}</div>
<p>This code will expire in <strong>15 minutes</strong>.</p>
<p>If you did not request this code, please ignore this email or contact the IT department.</p>
<div class="footer">
<p>${fromName} - Hospital Management System</p>
<p>This is an automated message from ${fromEmail}</p>
</div>
</div>
</div>
</body>
</html>`;

    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: `${fromName} - Login Verification Code`,
      content: `Your verification code is: ${otpCode}. This code expires in 15 minutes.`,
      html: htmlContent,
    });

    await client.close();

    // Log email
    await supabase.from("email_logs").insert({
      recipient_email: email,
      email_type: "otp",
      subject: "Login Verification Code",
      status: "sent",
      sent_at: new Date().toISOString(),
      reference_id: userId,
    });

    console.log(`OTP sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending OTP:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
