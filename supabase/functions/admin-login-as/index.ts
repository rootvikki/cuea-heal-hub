import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Lets a super admin / admin sign in as another user in a separate tab.
 * Returns a one-time sign-in token (no email is sent). Admins may not sign in
 * as other admins or super admins; only a super admin can. Every use is audited.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "Please sign in again." }, 401);
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error: "Please sign in again." }, 401);

    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const roles = (callerRoles || []).map((r: { role: string }) => r.role);
    const isSuper = roles.includes("super_admin");
    if (!isSuper && !roles.includes("admin")) return json({ error: "Only administrators can use Log in as." }, 403);

    const { userId } = await req.json().catch(() => ({}));
    if (!userId || typeof userId !== "string") return json({ error: "No user chosen." }, 400);
    if (userId === caller.id) return json({ error: "You are already signed in as yourself." }, 400);

    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const tRoles = (targetRoles || []).map((r: { role: string }) => r.role);
    if (!isSuper && (tRoles.includes("super_admin") || tRoles.includes("admin"))) {
      return json({ error: "Only a super admin can log in as another administrator." }, 403);
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !target?.user) return json({ error: "That user no longer exists." }, 404);
    if (!target.user.email) return json({ error: "This user has no email address, so they cannot be signed in." }, 400);

    const { data: profile } = await admin.from("profiles").select("full_name, status").eq("user_id", userId).maybeSingle();
    if (profile?.status === "suspended") return json({ error: "This user is suspended. Unsuspend them first." }, 400);

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) return json({ error: `Could not start the session: ${linkError?.message ?? "no token"}` }, 500);

    await admin.from("audit_logs").insert({
      user_id: caller.id,
      action: "LOGIN_AS_USER",
      module: "user_management",
      details: { target_user_id: userId, target_name: profile?.full_name ?? null, target_email: target.user.email, target_roles: tRoles },
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    return json({ tokenHash, name: profile?.full_name ?? target.user.email });
  } catch (e) {
    console.error("admin-login-as failed", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
