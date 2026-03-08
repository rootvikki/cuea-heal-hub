import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller has receptionist or admin role
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const allowedRoles = ["receptionist", "admin", "super_admin"];
    const hasPermission = callerRoles?.some((r: any) => allowedRoles.includes(r.role));
    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Insufficient permissions. Only receptionists and admins can register patients." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      fullName, phone, email, password, dateOfBirth, gender,
      nationalId, nationality, postalAddress, address,
      patientType, payrollNumber, admissionNumber, visitReason,
      insuranceProvider, insuranceNumber,
      nextOfKinName, nextOfKinRelationship, nextOfKinPhone,
    } = body;

    if (!fullName || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if a user with this email already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (emailExists) {
      return new Response(
        JSON.stringify({ error: "A patient with this email address is already registered. Please use a different email or search for the existing patient." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user via admin API (does NOT affect caller session)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("User creation failed");

    const userId = authData.user.id;

    // Create profile
    await supabase.from("profiles").upsert({
      user_id: userId,
      full_name: fullName,
      phone: phone || null,
      email,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      address: address || null,
      country: nationality || "Kenya",
    });

    // Generate sequential OPD number
    const { data: opdData, error: opdError } = await supabase.rpc("next_opd_number");
    if (opdError) throw new Error("Failed to generate OPD number: " + opdError.message);
    const patientId = opdData as string;

    // Create patient record
    const { error: patientError } = await supabase.from("patients").insert({
      user_id: userId,
      patient_id: patientId,
      patient_type: patientType || "outsider",
      national_id: nationalId || null,
      nationality: nationality || null,
      postal_address: postalAddress || null,
      email: email || null,
      payroll_number: payrollNumber || null,
      admission_number: admissionNumber || null,
      visit_reason: visitReason || "outpatient",
      insurance_provider: insuranceProvider || null,
      insurance_number: insuranceNumber || null,
      next_of_kin_name: nextOfKinName || null,
      next_of_kin_relationship: nextOfKinRelationship || null,
      next_of_kin_phone: nextOfKinPhone || null,
    });

    if (patientError) throw patientError;

    // Assign patient role
    await supabase.from("user_roles").upsert(
      { user_id: userId, role: "patient" },
      { onConflict: "user_id,role" }
    );

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: caller.id,
      action: "patient_registered",
      module: "registration",
      details: { patient_id: patientId, registered_email: email },
    });

    return new Response(
      JSON.stringify({ success: true, patientId, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
