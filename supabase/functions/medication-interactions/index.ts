import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "npm:ai";
import { z } from "npm:zod";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayResponseHeaders, getLovableAiGatewayRunId } from "../_shared/ai-gateway.ts";

const requestSchema = z.object({
  patientId: z.string().trim().min(1),
  age: z.number().nullable(),
  sex: z.string().nullable(),
  allergies: z.string().nullable(),
  currentMedications: z.array(z.object({
    name: z.string(),
    dosage: z.string().nullable(),
    frequency: z.string().nullable(),
    duration: z.string().nullable(),
  })).min(1),
  pastMedications: z.array(z.object({
    name: z.string(),
    dosage: z.string().nullable(),
    dispensedAt: z.string().nullable(),
  })),
  notes: z.string().nullable(),
});

const reviewSchema = z.object({
  overallRisk: z.string(),
  summary: z.string(),
  interactions: z.array(z.object({
    medications: z.array(z.string()),
    severity: z.string(),
    explanation: z.string(),
    recommendation: z.string(),
  })),
  allergyConcerns: z.array(z.string()),
  duplicateTherapy: z.array(z.string()),
  monitoringAdvice: z.array(z.string()),
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
    if (!supabaseUrl || !anonKey || !serviceKey || !lovableApiKey) throw new Error("Medication review is not configured");

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return jsonResponse({ success: false, error: "Your session is no longer valid" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = new Set(["pharmacist", "doctor", "clinical_officer", "admin", "super_admin"]);
    if (!(roles ?? []).some(({ role }) => allowed.has(role))) {
      return jsonResponse({ success: false, error: "Only pharmacy and clinical staff can request a medication review" }, 403);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ success: false, error: "Add at least one current medication before requesting a review" }, 400);

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
      output: Output.object({ schema: reviewSchema }),
      system: "You support qualified pharmacists at a university infirmary. Review the medication list for drug-drug interactions, duplicate therapy, allergy conflicts and monitoring needs. Use severity values of exactly 'minor', 'moderate' or 'major', and overallRisk of exactly 'low', 'moderate' or 'high'. Explain each interaction in plain clinical language under 60 words. Never diagnose, never change a prescription, and state clearly when evidence is uncertain. The pharmacist makes the final decision.",
      prompt: `Review this anonymized medication record and list potential interactions:\n${JSON.stringify(parsed.data)}`,
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

    const review = await result.output;
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "AI_MEDICATION_REVIEW_REQUESTED",
      module: "pharmacy",
      details: {
        patient_id: parsed.data.patientId,
        medication_count: parsed.data.currentMedications.length,
        interaction_count: review.interactions.length,
        overall_risk: review.overallRisk,
      },
    });

    const runId = await runIdFetch.waitForRunId();
    return jsonResponse({ success: true, review }, 200, runId ? { "X-Lovable-AIG-Run-ID": runId } : undefined);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return new Response(null, { status: 499, headers: corsHeaders });
    console.error("Medication interaction review failed", error);
    const message = NoObjectGeneratedError.isInstance(error)
      ? "The assistant could not produce a safe structured review. Continue with your own pharmacy assessment."
      : error instanceof Error ? error.message : "Medication review failed";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
