import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  fullName: string;
  phone?: string;
  roles: string[];
  departmentId?: string;
  adminUserId: string;
}

function generateTempPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName, phone, roles, departmentId, adminUserId }: CreateUserRequest = await req.json();

    if (!email || !fullName || !roles || roles.length === 0 || !adminUserId) {
      throw new Error("Missing required fields");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin has permission
    const { data: adminRoles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId);

    if (roleError) {
      throw new Error("Failed to verify admin permissions");
    }

    const isAdmin = adminRoles?.some(r => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();

    // Create user in auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone || "",
      },
    });

    if (authError) {
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    const userId = authData.user.id;

    // Remove default patient role and add specified roles
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "patient");

    // Add specified roles
    for (const role of roles) {
      await supabase.from("user_roles").insert({
        user_id: userId,
        role: role,
      });
    }

    // If staff role, create staff record
    const staffRoles = ["doctor", "nurse", "receptionist", "lab_technician", "pharmacist", "radiologist", "finance_officer", "admin", "clinical_officer", "records_officer", "ward_manager"];
    const hasStaffRole = roles.some(r => staffRoles.includes(r));

    if (hasStaffRole) {
      const staffId = `STAFF-${Date.now().toString(36).toUpperCase()}`;
      await supabase.from("staff").insert({
        user_id: userId,
        staff_id: staffId,
        department_id: departmentId || null,
      });
    }

    // Send welcome email with credentials
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (smtpHost && smtpUser && smtpPassword) {
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

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0066cc, #0099cc); padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066cc; }
            .credential-item { margin: 10px 0; }
            .label { font-weight: bold; color: #666; }
            .value { font-family: monospace; background: #f0f0f0; padding: 5px 10px; border-radius: 4px; }
            .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏥 CUEA Infirmary</h1>
              <p>Welcome to the Hospital Management System</p>
            </div>
            <div class="content">
              <p>Hello ${fullName},</p>
              <p>Your account has been created for the CUEA Infirmary Hospital Management System.</p>
              
              <div class="credentials">
                <h3>Your Login Credentials</h3>
                <div class="credential-item">
                  <span class="label">Email:</span>
                  <span class="value">${email}</span>
                </div>
                <div class="credential-item">
                  <span class="label">Temporary Password:</span>
                  <span class="value">${tempPassword}</span>
                </div>
                <div class="credential-item">
                  <span class="label">Role(s):</span>
                  <span class="value">${roles.join(", ")}</span>
                </div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> Please change your password after your first login for security purposes.
              </div>
              
              <p>If you have any questions, please contact the IT department.</p>
              
              <div class="footer">
                <p>CUEA Infirmary - Hospital Management System</p>
                <p>This is an automated message, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await client.send({
        from: smtpUser,
        to: email,
        subject: "Welcome to CUEA Infirmary - Your Account Has Been Created",
        content: `Welcome ${fullName}! Your account has been created. Email: ${email}, Temporary Password: ${tempPassword}. Please change your password after first login.`,
        html: htmlContent,
      });

      await client.close();

      // Log email
      await supabase.from("email_logs").insert({
        recipient_email: email,
        email_type: "welcome",
        subject: "Welcome to CUEA Infirmary",
        status: "sent",
        sent_at: new Date().toISOString(),
        reference_id: userId,
      });
    }

    console.log(`User ${email} created successfully by admin ${adminUserId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "User created successfully",
        userId: userId,
        tempPassword: tempPassword 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating user:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
