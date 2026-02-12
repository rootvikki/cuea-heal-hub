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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is super_admin or admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !caller) throw new Error("Unauthorized");

    // Check caller roles
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const roles = (callerRoles || []).map((r: any) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("admin")) {
      throw new Error("Insufficient privileges. Only super_admin or admin can perform this action.");
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!action || !userId) throw new Error("Missing action or userId");

    let result: any = { success: true };

    switch (action) {
      case "update_profile": {
        const { fullName, phone, email, dateOfBirth, gender, address } = body;
        const updates: Record<string, any> = {};
        if (fullName !== undefined) updates.full_name = fullName;
        if (phone !== undefined) updates.phone = phone;
        if (email !== undefined) updates.email = email;
        if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth;
        if (gender !== undefined) updates.gender = gender;
        if (address !== undefined) updates.address = address;

        const { error } = await supabaseAdmin
          .from("profiles")
          .update(updates)
          .eq("user_id", userId);

        if (error) throw new Error(`Profile update failed: ${error.message}`);

        // Also update auth email if changed
        if (email) {
          await supabaseAdmin.auth.admin.updateUserById(userId, { email });
        }

        result.message = "Profile updated successfully";
        break;
      }

      case "change_password": {
        const { newPassword } = body;
        if (!newPassword || newPassword.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) throw new Error(`Password change failed: ${error.message}`);
        result.message = "Password changed successfully";
        break;
      }

      case "suspend": {
        // Ban the user via auth and update profile status
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: "876000h", // ~100 years
        });
        if (banError) throw new Error(`Suspend failed: ${banError.message}`);

        await supabaseAdmin
          .from("profiles")
          .update({ status: "suspended" })
          .eq("user_id", userId);

        result.message = "User suspended successfully";
        break;
      }

      case "unsuspend": {
        const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          ban_duration: "none",
        });
        if (unbanError) throw new Error(`Unsuspend failed: ${unbanError.message}`);

        await supabaseAdmin
          .from("profiles")
          .update({ status: "active" })
          .eq("user_id", userId);

        result.message = "User unsuspended successfully";
        break;
      }

      case "delete": {
        // Prevent deleting yourself
        if (userId === caller.id) {
          throw new Error("You cannot delete your own account");
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw new Error(`Delete failed: ${error.message}`);

        result.message = "User deleted successfully";
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
