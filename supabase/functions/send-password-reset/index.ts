import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetRequest {
  email: string;
  redirectUrl: string;
}

function generateResetToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Retry logic for sending emails
async function sendWithRetry(
  client: SMTPClient,
  emailConfig: any,
  maxRetries = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to send email...`);
      await client.send(emailConfig);
      console.log(`Email sent successfully on attempt ${attempt}`);
      return;
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error?.message || error);
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectUrl }: ResetRequest = await req.json();

    if (!email) {
      throw new Error("Email is required");
    }

    // Get SMTP configuration from environment
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = 465; // Use port 465 for implicit TLS (SMTPS)
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const fromEmail = Deno.env.get("SMTP_FROM_EMAIL") || smtpUser;
    const fromName = Deno.env.get("SMTP_FROM_NAME") || "CUEA Infirmary";
    const siteUrl = Deno.env.get("SITE_URL") || redirectUrl?.split('/reset-password')[0];

    if (!smtpHost || !smtpUser || !smtpPassword) {
      throw new Error("SMTP configuration is incomplete. Please check SMTP_HOST, SMTP_USER, and SMTP_PASSWORD secrets.");
    }

    console.log(`SMTP Config: host=${smtpHost}, port=${smtpPort}, user=${smtpUser}, from=${fromEmail}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by email
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error fetching users:", userError);
      throw new Error("Failed to lookup user");
    }

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal if user exists or not for security
      console.log(`Password reset requested for non-existent email: ${email}`);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate previous tokens for this user
    await supabase
      .from("email_otp_tokens")
      .update({ verified: true })
      .eq("user_id", user.id)
      .eq("verified", false);

    // Store new token
    const { error: insertError } = await supabase
      .from("email_otp_tokens")
      .insert({
        user_id: user.id,
        email: email,
        otp_code: resetToken,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing reset token:", insertError);
      throw new Error("Failed to store reset token");
    }

    // Build reset URL
    const resetUrl = `${redirectUrl}?token=${resetToken}&email=${encodeURIComponent(email)}`;

    console.log(`Connecting to SMTP server: ${smtpHost}:${smtpPort}`);

    // Initialize SMTP client with port 465 (implicit TLS)
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
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background-color:#f4f4f4;}
.container{max-width:600px;margin:0 auto;padding:20px;}
.header{background:linear-gradient(135deg,#0066cc,#0099cc);padding:30px;text-align:center;color:white;border-radius:8px 8px 0 0;}
.header h1{margin:0;font-size:24px;}
.content{background:#ffffff;padding:30px;border-radius:0 0 8px 8px;}
.button{display:inline-block;background:#0066cc;color:white!important;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;margin:20px 0;}
.footer{text-align:center;color:#666;font-size:12px;margin-top:20px;padding-top:20px;border-top:1px solid #ddd;}
.warning{background:#fff3cd;border:1px solid #ffc107;padding:15px;border-radius:8px;margin:20px 0;font-size:14px;}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>🏥 ${fromName}</h1>
<p style="margin:5px 0 0 0;opacity:0.9;">Hospital Management System</p>
</div>
<div class="content">
<h2>Reset Your Password</h2>
<p>You recently requested to reset your password. Click the button below to choose a new one:</p>
<div style="text-align:center;">
<a href="${resetUrl}" class="button">Reset Password</a>
</div>
<div class="warning">
<strong>⏰ This link expires in 1 hour.</strong><br>
If you didn't request this, you can safely ignore this email.
</div>
<p style="font-size:12px;color:#666;">
If the button doesn't work, copy and paste this link into your browser:<br>
<a href="${resetUrl}" style="word-break:break-all;">${resetUrl}</a>
</p>
<div class="footer">
<p>${fromName} - Hospital Management System</p>
<p>This is an automated message from ${fromEmail}</p>
</div>
</div>
</div>
</body>
</html>`;

    // Send email with retry logic
    await sendWithRetry(client, {
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: `${fromName} - Reset Your Password`,
      content: `Reset your password by visiting: ${resetUrl}. This link expires in 1 hour.`,
      html: htmlContent,
    });

    await client.close();

    // Log email
    await supabase.from("email_logs").insert({
      recipient_email: email,
      email_type: "password_reset",
      subject: "Reset Your Password",
      status: "sent",
      sent_at: new Date().toISOString(),
      reference_id: user.id,
    });

    console.log(`Password reset email sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending password reset:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
