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

    // Create or resolve auth user (duplicate emails should not break registration flow)
    let userId: string;
    let existingPatientRecord: { id: string; patient_id: string } | null = null;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });

    if (authError) {
      const duplicateEmail = /already been registered|already registered|email address/i.test(authError.message || "");
      if (!duplicateEmail) throw authError;

      let page = 1;
      const perPage = 1000;
      let foundUser: { id: string; email?: string | null } | null = null;

      while (!foundUser) {
        const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
        if (listError) throw listError;

        const users = usersPage?.users || [];
        foundUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;

        if (users.length < perPage) break;
        page += 1;
      }

      if (!foundUser) {
        return new Response(
          JSON.stringify({ error: "A user with this email already exists but could not be resolved." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = foundUser.id;

      const { data: existingPatient } = await supabase
        .from("patients")
        .select("id, patient_id")
        .eq("user_id", userId)
        .maybeSingle();

      existingPatientRecord = existingPatient || null;
    } else {
      if (!authData.user) throw new Error("User creation failed");
      userId = authData.user.id;
    }

    // Create/update profile — use onConflict to ensure upsert works on user_id
    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        full_name: fullName,
        phone: phone || null,
        email,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        address: address || null,
        country: nationality || "Kenya",
      },
      { onConflict: "user_id" }
    );

    // Existing auth account + existing patient record => return success instead of error
    if (existingPatientRecord) {
      await supabase.from("user_roles").upsert(
        { user_id: userId, role: "patient" },
        { onConflict: "user_id,role" }
      );

      await supabase.from("audit_logs").insert({
        user_id: caller.id,
        action: "patient_registration_reused",
        module: "registration",
        details: { patient_id: existingPatientRecord.patient_id, registered_email: email },
      });

      // Fetch visit_reason for routing
      const { data: existingFull } = await supabase
        .from("patients")
        .select("visit_reason")
        .eq("id", existingPatientRecord.id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          patientId: existingPatientRecord.patient_id,
          patientRecordId: existingPatientRecord.id,
          visitReason: existingFull?.visit_reason || "outpatient",
          userId,
          existing: true,
          message: "Patient already existed. Existing record loaded.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate sequential OPD number
    const { data: opdData, error: opdError } = await supabase.rpc("next_opd_number");
    if (opdError) throw new Error("Failed to generate OPD number: " + opdError.message);
    const patientId = opdData as string;

    // Create patient record
    const { data: patientRecord, error: patientError } = await supabase.from("patients").insert({
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
    }).select("id").single();

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
      JSON.stringify({ success: true, patientId, userId, patientRecordId: patientRecord.id, visitReason: visitReason || "outpatient" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
