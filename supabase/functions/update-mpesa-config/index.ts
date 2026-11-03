import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = user.id;

    // Check admin role using service role client
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = roles?.map((r: any) => r.role) || [];
    if (!userRoles.includes("super_admin") && !userRoles.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { consumerKey, consumerSecret, shortcode, passkey, environment, paymentType, tillNumber, storeNumber } = body;
    const clean = (v: unknown) => String(v ?? "").trim();
    const digits = (v: unknown) => clean(v).replace(/\D/g, "");

    // Update settings in system_settings table (blank fields keep the saved value)
    const settings: Record<string, string> = {};
    if (clean(consumerKey)) settings["mpesa_consumer_key"] = clean(consumerKey);
    if (clean(consumerSecret)) settings["mpesa_consumer_secret"] = clean(consumerSecret);
    if (clean(passkey)) settings["mpesa_passkey"] = clean(passkey);
    if (environment !== undefined) settings["mpesa_environment"] = clean(environment) === "production" ? "production" : "sandbox";
    if (paymentType !== undefined) settings["mpesa_type"] = paymentType === "paybill" ? "paybill" : "till";
    if (digits(tillNumber)) settings["mpesa_till_number"] = digits(tillNumber);
    if (digits(storeNumber)) settings["mpesa_store_number"] = digits(storeNumber);
    if (digits(shortcode)) settings["mpesa_shortcode"] = digits(shortcode);

    for (const [key, value] of Object.entries(settings)) {
      const { error } = await serviceClient
        .from("system_settings")
        .upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(`Could not save ${key}: ${error.message}`);
    }
    await serviceClient.from("audit_logs").insert({
      user_id: userId, action: "mpesa_settings_updated", module: "settings",
      details: { fields: Object.keys(settings).filter((k) => !/key|secret|passkey/.test(k)), secrets_changed: Object.keys(settings).some((k) => /key|secret|passkey/.test(k)) },
    });

    return new Response(
      JSON.stringify({ success: true, message: "M-Pesa configuration updated" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
