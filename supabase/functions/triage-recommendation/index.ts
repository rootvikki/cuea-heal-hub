import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayResponseHeaders, getLovableAiGatewayRunId } from "../_shared/ai-gateway.ts";

const requestSchema = z.object({
  presentingComplaint: z.string().trim().min(3),
  allergies: z.string().nullable(),
  age: z.number().nullable(),
  sex: z.string().nullable(),
  vitals: z.object({
    temperature: z.number().nullable(),
    bloodPressureSystolic: z.number().nullable(),
    bloodPressureDiastolic: z.number().nullable(),
    pulseRate: z.number().nullable(),
    respiratoryRate: z.number().nullable(),
    oxygenSaturation: z.number().nullable(),
    weight: z.number().nullable(),
    heightMetres: z.number().nullable(),
    bmi: z.number().nullable(),
  }),
  previousVitals: z.array(z.object({
    recordedAt: z.string().nullable(),
    temperature: z.number().nullable(),
    bloodPressureSystolic: z.number().nullable(),
    bloodPressureDiastolic: z.number().nullable(),
    pulseRate: z.number().nullable(),
    respiratoryRate: z.number().nullable(),
    oxygenSaturation: z.number().nullable(),
  })),
});

const recommendationSchema = z.object({
  urgencyPriority: z.number(),
  rationale: z.string(),
  redFlags: z.array(z.string()),
  recommendedChecks: z.array(z.string()),
});

const jsonResponse = (body: unknown, status = 200, extraHeaders?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: getLovableAiGatewayResponseHeaders(extraHeaders, { ...corsHeaders, "Content-Type": "application/json" }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ success: false, error: "Sign in is required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !lovableApiKey) throw new Error("Triage assistant is not configured");

    const authClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ success: false, error: "Your session is no longer valid" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = new Set(["nurse", "clinical_officer", "doctor", "admin", "super_admin"]);
    if (!(roles ?? []).some(({ role }) => allowed.has(role))) {
      return jsonResponse({ success: false, error: "Only authorized clinical staff can request a triage review" }, 403);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ success: false, error: "Record the presenting complaint and valid vital readings first" }, 400);

    const initialRunId = getLovableAiGatewayRunId(req);
    const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableApiKey,
      headers: { "Lovable-API-Key": lovableApiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      output: Output.object({ schema: recommendationSchema }),
      system: "You support qualified clinical staff at a university infirmary. Review anonymized symptoms and vitals only. Suggest one urgency priority: 1 Normal, 2 High, or 3 Emergency. Be conservative about red flags, never diagnose, never claim certainty, and keep the rationale under 80 words. Return at most five red flags and five immediate checks. Clinical staff make the final decision.",
      prompt: `Provide a structured triage urgency suggestion for this anonymized record:\n${JSON.stringify(parsed.data)}`,
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const recommendation = await result.output;
    const urgencyPriority = Math.min(3, Math.max(1, Math.round(recommendation.urgencyPriority)));
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "AI_TRIAGE_REVIEW_REQUESTED",
      module: "triage",
      details: { suggested_priority: urgencyPriority, red_flag_count: recommendation.redFlags.length },
    });

    const runId = await runIdFetch.waitForRunId();
    return jsonResponse({ success: true, recommendation: { ...recommendation, urgencyPriority } }, 200, runId ? { "X-Lovable-AIG-Run-ID": runId } : undefined);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return new Response(null, { status: 499, headers: corsHeaders });
    console.error("Triage recommendation failed", error);
    const message = NoObjectGeneratedError.isInstance(error)
      ? "The assistant could not produce a safe structured recommendation. Continue with clinical assessment."
      : error instanceof Error ? error.message : "Triage review failed";
    return jsonResponse({ success: false, error: message }, 500);
  }
});