import { ClearOldTriage } from "@/components/ClearOldTriage";
import { ProceduresToPerform } from "@/components/ConsultationExtras";
import { DirectOrderDialog } from "@/components/DirectOrderDialog";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftStatus } from "@/components/DraftStatus";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StationQueue, StationShell } from "@/components/StationQueue";
import { NursingProcedures, type SelectedProcedure } from "@/components/NursingProcedures";
import { InterimPayment } from "@/components/InterimPayment";
import { Activity, Send, Calendar, Thermometer, HeartPulse, Weight, AlertTriangle, History, FlaskConical, Pill, Stethoscope } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import { TriageArrivalAlerts } from "@/components/TriageArrivalAlerts";
import { TriageAIRecommendation, type TriageRecommendation } from "@/components/TriageAIRecommendation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SendToDialog } from "@/components/SendToDialog";
import { ReportsButton } from "@/components/StationReports";
import { sendPatientTo } from "@/lib/stations";
import { paymentModeLabel, serviceFee } from "@/lib/pricing";
import { calculateAgeYears } from "@/lib/utils";

// ─── Vital range helpers ─────────────────────────────────────────
const getBPClass = (sys: string, dia: string) => {
  const s = parseInt(sys), d = parseInt(dia);
  if (!s || !d) return "";
  if (s >= 180 || d >= 120) return "border-destructive ring-1 ring-destructive/30 bg-destructive/5";
  if (s >= 140 || d >= 90) return "border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5";
  if (s >= 90 && s <= 130 && d >= 60 && d <= 85) return "border-[hsl(var(--success))] ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5";
  return "";
};

const getTempClass = (val: string) => {
  const t = parseFloat(val);
  if (!t) return "";
  if (t >= 39) return "border-destructive ring-1 ring-destructive/30 bg-destructive/5";
  if (t >= 37.5 || t < 36) return "border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5";
  return "border-[hsl(var(--success))] ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5";
};

const getPulseClass = (val: string) => {
  const p = parseInt(val);
  if (!p) return "";
  if (p > 120 || p < 50) return "border-destructive ring-1 ring-destructive/30 bg-destructive/5";
  if (p > 100 || p < 60) return "border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5";
  return "border-[hsl(var(--success))] ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5";
};

const getSpo2Class = (val: string) => {
  const s = parseFloat(val);
  if (!s) return "";
  if (s < 90) return "border-destructive ring-1 ring-destructive/30 bg-destructive/5";
  if (s < 95) return "border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5";
  return "border-[hsl(var(--success))] ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5";
};

const getRRClass = (val: string) => {
  const r = parseInt(val);
  if (!r) return "";
  if (r > 25 || r < 10) return "border-destructive ring-1 ring-destructive/30 bg-destructive/5";
  if (r > 20 || r < 12) return "border-[hsl(var(--warning))] ring-1 ring-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5";
  return "border-[hsl(var(--success))] ring-1 ring-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5";
};

/** Blood pressure parts: digits only, 2–3 digits each. */
const BP_LIMITS = { sys: { min: 50, max: 300 }, dia: { min: 30, max: 200 } };
const bpDigits = (v: string) => v.replace(/\D/g, "").slice(0, 3);
const bpError = (sys: string, dia: string) => {
  if (!sys && !dia) return null;
  if (sys && sys.length < 2) return "Systolic needs 2–3 digits";
  if (dia && dia.length < 2) return "Diastolic needs 2–3 digits";
  if (sys && (Number(sys) < BP_LIMITS.sys.min || Number(sys) > BP_LIMITS.sys.max)) return `Systolic must be ${BP_LIMITS.sys.min}–${BP_LIMITS.sys.max}`;
  if (dia && (Number(dia) < BP_LIMITS.dia.min || Number(dia) > BP_LIMITS.dia.max)) return `Diastolic must be ${BP_LIMITS.dia.min}–${BP_LIMITS.dia.max}`;
  if (sys && dia && Number(dia) >= Number(sys)) return "Diastolic should be lower than systolic";
  if (!sys || !dia) return "Enter both numbers";
  return null;
};

const AUTO_NEXT_KEY = "cuea-triage-auto-next";
const emptyForm = {
  weight: "", height: "", bpSystolic: "", bpDiastolic: "",
  pulseRate: "", temperature: "", respiratoryRate: "", spo2: "",
  allergies: "", presentingComplaint: "", nursingNotes: "", nextVisit: "",
};

const EMPTY_DRAFT = { form: emptyForm, procedures: [] as SelectedProcedure[], urgencyPriority: "1" };

const Vitals = () => {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [directMode, setDirectMode] = useState<"lab" | "pharmacy" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [urgencyPriority, setUrgencyPriority] = useState("1");
  const [aiRecommendation, setAiRecommendation] = useState<TriageRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [savedForTicket, setSavedForTicket] = useState<string | null>(null);
  const [autoNext, setAutoNext] = useState(() => { try { return localStorage.getItem(AUTO_NEXT_KEY) !== "off"; } catch { return true; } });
  const diaRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(emptyForm);
  const [prefilled, setPrefilled] = useState<{ height?: string; allergies?: string; date?: string }>({});
  const [procedures, setProcedures] = useState<SelectedProcedure[]>([]);
  const [previousVitals, setPreviousVitals] = useState<any[]>([]);

  useEffect(() => { setQueueCollapsed(!!selectedTicket); }, [selectedTicket]);

  const bmi = useMemo(() => {
    const w = parseFloat(form.weight);
    const hCm = parseFloat(form.height);
    if (!w || !hCm) return null;
    const hM = hCm / 100;
    return (w / (hM * hM)).toFixed(2);
  }, [form.weight, form.height]);

  const bpProblem = bpError(form.bpSystolic, form.bpDiastolic);

  // Returning patients: load full history and carry forward height & allergies
  useEffect(() => {
    if (!selectedTicket?.patient_id) return;
    setForm(emptyForm); setProcedures([]); setUrgencyPriority(String(selectedTicket.priority || 1)); setAiRecommendation(null); setPrefilled({});
    (async () => {
      const { data } = await supabase.from("vitals").select("*").eq("patient_id", selectedTicket.patient_id)
        .order("recorded_at", { ascending: false }).limit(10);
      const rows = data || [];
      setPreviousVitals(rows);
      const lastHeight = rows.find((v) => v.height)?.height;
      const lastAllergies = selectedTicket.patient?.allergies?.length ? selectedTicket.patient.allergies.join(", ") : rows.find((v) => v.allergies_noted)?.allergies_noted;
      const lastDate = rows.find((v) => v.height)?.recorded_at;
      // Keep anything already typed (or restored from a draft); only fill empty fields
      setForm((f) => ({ ...f, height: f.height || (lastHeight ? String(lastHeight) : ""), allergies: f.allergies || lastAllergies || "" }));
      setPrefilled({ height: lastHeight ? String(lastHeight) : undefined, allergies: lastAllergies || undefined, date: lastDate || undefined });
    })();
  }, [selectedTicket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave the triage form per patient — declared after the reset above so a saved draft wins
  const draftValue = useMemo(() => ({ form, procedures, urgencyPriority }), [form, procedures, urgencyPriority]);
  const restoreDraft = useCallback((v: typeof draftValue) => {
    setForm({ ...emptyForm, ...(v.form || {}) });
    setProcedures(v.procedures || []);
    if (v.urgencyPriority) setUrgencyPriority(v.urgencyPriority);
  }, []);
  const draft = useFormDraft(selectedTicket?.id ? `triage:${selectedTicket.id}` : null, draftValue, restoreDraft, {
    reset: EMPTY_DRAFT,
    isEmpty: (v) => v.procedures.length === 0 && Object.entries(v.form).every(([k, x]) => k === "height" || k === "allergies" || !x),
  });

  const numberOrNull = (value: string) => value ? Number(value) : null;

  const requestAiReview = async () => {
    if (form.presentingComplaint.trim().length < 3) {
      return toast({ title: "Presenting complaint required", description: "Record symptoms before requesting an AI review.", variant: "destructive" });
    }
    setAiLoading(true);
    try {
      const dateOfBirth = selectedTicket?.patient?.profile?.date_of_birth;
      const age = dateOfBirth ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / 31557600000) : null;
      const { data, error } = await supabase.functions.invoke("triage-recommendation", { body: {
        presentingComplaint: form.presentingComplaint, allergies: form.allergies || null, age,
        sex: selectedTicket?.patient?.profile?.gender ?? null,
        vitals: { temperature: numberOrNull(form.temperature), bloodPressureSystolic: numberOrNull(form.bpSystolic), bloodPressureDiastolic: numberOrNull(form.bpDiastolic), pulseRate: numberOrNull(form.pulseRate), respiratoryRate: numberOrNull(form.respiratoryRate), oxygenSaturation: numberOrNull(form.spo2), weight: numberOrNull(form.weight), heightCentimetres: numberOrNull(form.height), bmi: bmi ? Number(bmi) : null },
        previousVitals: previousVitals.map((v) => ({ recordedAt: v.recorded_at, temperature: v.temperature, bloodPressureSystolic: v.blood_pressure_systolic, bloodPressureDiastolic: v.blood_pressure_diastolic, pulseRate: v.pulse_rate, respiratoryRate: v.respiratory_rate, oxygenSaturation: v.oxygen_saturation })),
      }});
      if (error) {
        let message = error.message;
        try { const body = await error.context?.json(); message = body?.error || message; } catch { /* use client message */ }
        throw new Error(message);
      }
      if (!data?.success) throw new Error(data?.error || "AI review failed");
      setAiRecommendation(data.recommendation);
      toast({ title: "AI review ready", description: "Review the suggestion, then choose the final clinical urgency." });
    } catch (error: any) {
      toast({ title: "AI review unavailable", description: error.message, variant: "destructive" });
    } finally { setAiLoading(false); }
  };

  const hasAnyVitals = Object.entries(form).some(([k, v]) => v && !(k === "height" && v === prefilled.height) && !(k === "allergies" && v === prefilled.allergies));

  /** Saves vitals, procedures and the triage fee once per visit (safe to call again). */
  const saveVitals = async () => {
    if (!selectedTicket || savedForTicket === selectedTicket.id) return;
    if (bpProblem) throw new Error(`Blood pressure: ${bpProblem}`);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user?.id).maybeSingle();

    const w = parseFloat(form.weight) || null;
    const hCm = parseFloat(form.height) || null;
    const hM = hCm ? hCm / 100 : null;
    const computedBmi = w && hM ? parseFloat((w / (hM * hM)).toFixed(2)) : null;

    const { error: vitErr } = await supabase.from("vitals").insert({
      patient_id: selectedTicket.patient_id, recorded_by: staff?.id,
      weight: w, height: hCm, bmi: computedBmi,
      blood_pressure_systolic: form.bpSystolic ? parseInt(form.bpSystolic) : null,
      blood_pressure_diastolic: form.bpDiastolic ? parseInt(form.bpDiastolic) : null,
      pulse_rate: form.pulseRate ? parseInt(form.pulseRate) : null,
      temperature: form.temperature ? parseFloat(form.temperature) : null,
      respiratory_rate: form.respiratoryRate ? parseInt(form.respiratoryRate) : null,
      oxygen_saturation: form.spo2 ? parseFloat(form.spo2) : null,
      allergies_noted: form.allergies || null, presenting_complaint: form.presentingComplaint || null,
      urgency_priority: Number(urgencyPriority),
      ai_urgency_priority: aiRecommendation?.urgencyPriority ?? null,
      ai_rationale: aiRecommendation?.rationale ?? null,
      ai_red_flags: aiRecommendation?.redFlags ?? null,
      ai_recommended_checks: aiRecommendation?.recommendedChecks ?? null,
      ai_reviewed_at: aiRecommendation ? new Date().toISOString() : null,
    });
    if (vitErr) throw vitErr;

    if (form.nursingNotes.trim()) {
      await supabase.from("nursing_procedures").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
        nurse_id: user?.id || "", procedure_type: "nursing_notes", notes: form.nursingNotes, price: 0,
      });
    }

    const { count: feeCount } = await supabase.from("service_charges").select("id", { count: "exact", head: true }).eq("ticket_id", selectedTicket.id).eq("service_type", "triage");
    if (!feeCount) {
      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
        service_type: "triage", description: "Triage / Vitals Assessment Fee", amount: serviceFee("triage", selectedTicket.payment_mode), billing_stage: "triage",
      });
    }

    for (const proc of procedures) {
      await supabase.from("nursing_procedures").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
        nurse_id: user?.id || "", procedure_type: proc.type, notes: proc.notes, price: proc.price,
      });
      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
        service_type: "nursing_procedure", description: proc.label, amount: proc.price, billing_stage: "triage",
      });
    }
    await supabase.from("tickets").update({ priority: Number(urgencyPriority) }).eq("id", selectedTicket.id);
    logAuditEvent({ action: "vitals_recorded", module: "triage", details: { patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, procedures: procedures.length } });
    setSavedForTicket(selectedTicket.id);
  };

  /** Claims and opens the next waiting patient so the nurse never has to hunt for them. */
  const openNextPatient = async (skipId?: string) => {
    const { data } = await supabase.from("tickets")
      .select("*, patients!inner(id, patient_id, user_id, patient_type, allergies, blood_type, chronic_conditions, insurance_provider, insurance_number, national_id, payroll_number, admission_number, profiles!inner(full_name, phone, date_of_birth, gender))")
      .in("workflow_stage", ["checked_in", "triage"]).is("assigned_to", null)
      .gte("created_at", new Date(Date.now() - 18 * 3600 * 1000).toISOString())
      .order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(2);
    const next = (data || []).find((t: any) => t.id !== skipId);
    if (!next) { setSelectedTicket(null); return; }
    const { error } = await supabase.rpc("manage_triage_claim", { _ticket_id: next.id, _action: "claim" });
    if (error) { setSelectedTicket(null); return; }
    const p: any = (next as any).patients;
    setSelectedTicket({ ...next, status: "triage_in_progress", workflow_stage: "triage_in_progress", patient: { ...p, profile: p?.profiles } });
    toast({ title: "Next patient", description: p?.profiles?.full_name || next.ticket_number });
  };

  const finishPatient = async (sentTo: string) => {
    const done = selectedTicket?.id;
    toast({ title: "Saved", description: `Patient sent to ${sentTo}` });
    draft.clear();
    setForm(emptyForm); setProcedures([]); setUrgencyPriority("1"); setAiRecommendation(null);
    if (autoNext) await openNextPatient(done); else setSelectedTicket(null);
  };

  const handleSaveAndAdvance = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      await saveVitals();
      await sendPatientTo({ ticketId: selectedTicket.id, patientName: selectedTicket.patient?.profile?.full_name, to: "doctor", from: "Triage", extra: { priority: Number(urgencyPriority) } });
      await finishPatient("the doctor");
    } catch (err: any) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDirect = async (mode: "lab" | "pharmacy") => {
    try {
      if (hasAnyVitals) await saveVitals();
      setDirectMode(mode);
    } catch (err: any) {
      toast({ title: "Could not save vitals", description: err.message, variant: "destructive" });
    }
  };

  const u = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const summaryItems = useMemo(() => {
    const items: { label: string; value: string; status?: "normal" | "warning" | "critical" }[] = [];
    if (form.bpSystolic && form.bpDiastolic && !bpProblem) {
      const s = parseInt(form.bpSystolic), d = parseInt(form.bpDiastolic);
      const st = (s >= 180 || d >= 120) ? "critical" : (s >= 140 || d >= 90) ? "warning" : "normal";
      items.push({ label: "BP", value: `${form.bpSystolic}/${form.bpDiastolic} mmHg`, status: st });
    }
    if (form.pulseRate) {
      const p = parseInt(form.pulseRate);
      items.push({ label: "Pulse", value: `${form.pulseRate} bpm`, status: (p > 120 || p < 50) ? "critical" : (p > 100 || p < 60) ? "warning" : "normal" });
    }
    if (form.temperature) {
      const t = parseFloat(form.temperature);
      items.push({ label: "Temp", value: `${form.temperature} °C`, status: t >= 39 ? "critical" : (t >= 37.5 || t < 36) ? "warning" : "normal" });
    }
    if (form.spo2) {
      const s = parseFloat(form.spo2);
      items.push({ label: "SpO₂", value: `${form.spo2}%`, status: s < 90 ? "critical" : s < 95 ? "warning" : "normal" });
    }
    if (form.respiratoryRate) {
      const r = parseInt(form.respiratoryRate);
      items.push({ label: "RR", value: `${form.respiratoryRate}/min`, status: (r > 25 || r < 10) ? "critical" : (r > 20 || r < 12) ? "warning" : "normal" });
    }
    if (form.weight) items.push({ label: "Weight", value: `${form.weight} kg` });
    if (form.height) items.push({ label: "Height", value: `${form.height} cm` });
    if (bmi) {
      const b = parseFloat(bmi);
      items.push({ label: "BMI", value: bmi, status: (b < 18.5 || b >= 30) ? "warning" : "normal" });
    }
    return items;
  }, [form, bmi, bpProblem]);

  const patientName = selectedTicket?.patient?.profile?.full_name;
  const age = calculateAgeYears(selectedTicket?.patient?.profile?.date_of_birth);

  return (
    <StationShell
      queue={
        <StationQueue
          stationStages={["checked_in", "triage", "triage_in_progress"]}
          nextStage="waiting_for_doctor"
          title="Triage Queue"
          onSelectPatient={setSelectedTicket}
          selectedTicketId={selectedTicket?.id}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
          triageClaimMode
        />
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> Nursing / Triage
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Take vitals, then send the patient on — the next patient opens automatically</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm rounded-md border px-3 h-10">
            <Switch checked={autoNext} onCheckedChange={(v) => { setAutoNext(v); try { localStorage.setItem(AUTO_NEXT_KEY, v ? "on" : "off"); } catch { /* ignore */ } }} />
            Auto-open next
          </label>
          <ReportsButton kind="triage" />
          <ClearOldTriage />
          <TriageArrivalAlerts />
        </div>
      </div>

      <ProceduresToPerform />

      {!selectedTicket ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground space-y-3">
          <p>Select a patient from the queue, or</p>
          <Button onClick={() => openNextPatient()}><Send className="h-4 w-4 mr-2" /> Serve next patient</Button>
        </CardContent></Card>
      ) : (
        <>
          {/* Patient bar */}
          <Card className="border-primary/30">
            <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <div className="text-base font-bold">{patientName || <span className="text-destructive italic">Name missing</span>}</div>
                <div><span className="text-muted-foreground">Ticket</span> <strong>{selectedTicket.ticket_number}</strong></div>
                <div><span className="text-muted-foreground">OPD</span> <strong>{selectedTicket.patient?.patient_id}</strong></div>
                <div><span className="text-muted-foreground">Age</span> <strong>{age ?? "—"}</strong></div>
                <div className="capitalize"><span className="text-muted-foreground">Sex</span> <strong>{selectedTicket.patient?.profile?.gender || "—"}</strong></div>
                <Badge variant="outline">{paymentModeLabel(selectedTicket.payment_mode)}</Badge>
                {previousVitals.length > 0 ? <Badge variant="soft">Returning · {previousVitals.length} previous</Badge> : <Badge variant="soft">First visit</Badge>}
              </div>
              <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />
            </CardContent>
          </Card>

          {/* Previous vitals — full history for returning patients */}
          {previousVitals.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Previous vitals</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs min-w-[820px]">
                    <thead>
                      <tr>{["Date", "BP", "Pulse", "Temp °C", "RR", "SpO₂ %", "Weight kg", "Height cm", "BMI", "Urgency", "Complaint"].map((h) => (
                        <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {previousVitals.map((v) => (
                        <tr key={v.id}>
                          <td className="border px-2 py-1.5 whitespace-nowrap">{v.recorded_at ? new Date(v.recorded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                          <td className="border px-2 py-1.5">{v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic ?? "—"}` : "—"}</td>
                          <td className="border px-2 py-1.5">{v.pulse_rate ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.temperature ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.respiratory_rate ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.oxygen_saturation ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.weight ?? "—"}</td>
                          <td className="border px-2 py-1.5 font-medium">{v.height ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.bmi ?? "—"}</td>
                          <td className="border px-2 py-1.5">{v.urgency_priority === 3 ? "Emergency" : v.urgency_priority === 2 ? "High" : "Normal"}</td>
                          <td className="border px-2 py-1.5 max-w-[260px] truncate" title={v.presenting_complaint || ""}>{v.presenting_complaint || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />

          {/* Triage form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Thermometer className="h-5 w-5 text-primary" /> Today's vitals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-7">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Weight className="h-4 w-4" /> Body measurements & blood pressure</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Weight (kg)</Label>
                    <Input type="number" inputMode="decimal" step="0.1" value={form.weight} onChange={(e) => u("weight", e.target.value)} className="h-12 text-base" placeholder="e.g. 72.5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Height (cm)</Label>
                    <Input type="number" inputMode="decimal" step="0.1" value={form.height} onChange={(e) => u("height", e.target.value)} placeholder="e.g. 170" className="h-12 text-base" />
                    <p className="text-xs text-muted-foreground">
                      {prefilled.height && form.height === prefilled.height
                        ? `From last visit${prefilled.date ? ` (${new Date(prefilled.date).toLocaleDateString("en-GB")})` : ""} — change if different`
                        : "Centimetres"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">BMI (automatic)</Label>
                    <Input readOnly value={bmi || ""} className="bg-muted font-bold h-12 text-base" placeholder="From height & weight" aria-label="Automatically calculated BMI" />
                    {bmi && (
                      <Badge className={`text-xs ${parseFloat(bmi) < 18.5 ? "bg-warning text-warning-foreground" : parseFloat(bmi) < 25 ? "bg-success text-success-foreground" : parseFloat(bmi) < 30 ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground"}`}>
                        {parseFloat(bmi) < 18.5 ? "Underweight" : parseFloat(bmi) < 25 ? "Normal" : parseFloat(bmi) < 30 ? "Overweight" : "Obese"}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Blood pressure (mmHg)</Label>
                    <div className="flex gap-1.5 items-center">
                      <Input
                        inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label="Systolic" placeholder="120"
                        value={form.bpSystolic}
                        onChange={(e) => {
                          const v = bpDigits(e.target.value);
                          u("bpSystolic", v);
                          if (v.length === 3) diaRef.current?.focus();
                        }}
                        className={`h-12 text-base text-center ${!bpProblem ? getBPClass(form.bpSystolic, form.bpDiastolic) : ""} ${bpProblem && form.bpSystolic ? "border-destructive" : ""}`}
                      />
                      <span className="text-muted-foreground font-bold text-lg">/</span>
                      <Input
                        ref={diaRef}
                        inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label="Diastolic" placeholder="80"
                        value={form.bpDiastolic}
                        onChange={(e) => u("bpDiastolic", bpDigits(e.target.value))}
                        className={`h-12 text-base text-center ${!bpProblem ? getBPClass(form.bpSystolic, form.bpDiastolic) : ""} ${bpProblem && form.bpDiastolic ? "border-destructive" : ""}`}
                      />
                    </div>
                    <p className={`text-xs ${bpProblem ? "text-destructive font-medium" : "text-muted-foreground"}`}>{bpProblem || "Systolic / diastolic, 2–3 digits each"}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><HeartPulse className="h-4 w-4" /> Heart & breathing</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Pulse (bpm)</Label>
                    <Input inputMode="numeric" maxLength={3} value={form.pulseRate} onChange={(e) => u("pulseRate", bpDigits(e.target.value))} className={`h-12 text-base ${getPulseClass(form.pulseRate)}`} placeholder="60–100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Temperature (°C)</Label>
                    <Input type="number" inputMode="decimal" step="0.1" value={form.temperature} onChange={(e) => u("temperature", e.target.value)} className={`h-12 text-base ${getTempClass(form.temperature)}`} placeholder="36.0–37.5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Resp. rate (/min)</Label>
                    <Input inputMode="numeric" maxLength={2} value={form.respiratoryRate} onChange={(e) => u("respiratoryRate", e.target.value.replace(/\D/g, "").slice(0, 2))} className={`h-12 text-base ${getRRClass(form.respiratoryRate)}`} placeholder="12–20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">SpO₂ (%)</Label>
                    <Input type="number" inputMode="decimal" step="0.1" max={100} value={form.spo2} onChange={(e) => u("spo2", e.target.value)} className={`h-12 text-base ${getSpo2Class(form.spo2)}`} placeholder="95–100" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Allergies</Label>
                  <Input value={form.allergies} onChange={(e) => u("allergies", e.target.value)} placeholder="Type NKDA if none known" className="h-12 text-base" />
                  {prefilled.allergies && form.allergies === prefilled.allergies && <p className="text-xs text-muted-foreground">From the patient's record</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Urgency (final, by clinician) *</Label>
                  <Select value={urgencyPriority} onValueChange={setUrgencyPriority}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">Normal</SelectItem><SelectItem value="2">High</SelectItem><SelectItem value="3">Emergency</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Presenting complaint *</Label>
                <Textarea rows={4} value={form.presentingComplaint} onChange={(e) => u("presentingComplaint", e.target.value)}
                  placeholder="Main complaint and symptoms — onset, duration, severity…" className="text-base leading-relaxed" />
              </div>
            </CardContent>
          </Card>

          <TriageAIRecommendation recommendation={aiRecommendation} loading={aiLoading} disabled={!form.presentingComplaint.trim()} onReview={requestAiReview} />

          <Card>
            <CardContent className="pt-6 space-y-5">
              <NursingProcedures procedures={procedures} onChange={setProcedures} />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label className="text-sm font-semibold">Nursing notes</Label>
                  <Textarea rows={3} value={form.nursingNotes} onChange={(e) => u("nursingNotes", e.target.value)} placeholder="Observations, care given, education…" className="text-base" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold"><Calendar className="h-4 w-4" /> Next visit (TCA)</Label>
                  <Input type="date" value={form.nextVisit} onChange={(e) => u("nextVisit", e.target.value)} className="h-12 text-base" />
                </div>
              </div>
            </CardContent>
          </Card>

          {summaryItems.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {summaryItems.map((item) => (
                    <div key={item.label} className={`p-2.5 rounded-lg border text-center ${item.status === "critical" ? "border-destructive bg-destructive/10" : item.status === "warning" ? "border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10" : "border-border bg-background"}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</p>
                      <p className={`text-sm font-bold mt-0.5 ${item.status === "critical" ? "text-destructive" : item.status === "warning" ? "text-[hsl(var(--warning))]" : ""}`}>{item.value}</p>
                      {item.status === "critical" && <AlertTriangle className="h-3 w-3 text-destructive mx-auto mt-1" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sticky action bar */}
          <div className="sticky bottom-0 z-20 -mx-3 sm:-mx-1 border-t bg-background/95 backdrop-blur px-3 sm:px-1 py-2 sm:py-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <DraftStatus draft={draft} className="col-span-3 sm:mr-auto" />
            <Button variant="outline" className="h-11 sm:h-12 px-2 text-xs sm:text-sm" onClick={() => openDirect("lab")}><FlaskConical className="h-4 w-4 mr-1" /> Lab</Button>
            <Button variant="outline" className="h-11 sm:h-12 px-2 text-xs sm:text-sm" onClick={() => openDirect("pharmacy")}><Pill className="h-4 w-4 mr-1" /> Prescription</Button>
            <Button variant="outline" className="h-11 sm:h-12 px-2 text-xs sm:text-sm" onClick={() => setSendOpen(true)} disabled={saving || !!bpProblem}><Send className="h-4 w-4 mr-1" /> Send to…</Button>
            <Button onClick={handleSaveAndAdvance} disabled={saving || !!bpProblem} className="col-span-3 gap-2 h-12 px-6 text-base">
              <Stethoscope className="h-5 w-5" /> {saving ? "Saving..." : "Save & send to Doctor"}
            </Button>
          </div>

          <DirectOrderDialog
            open={!!directMode}
            onOpenChange={(o) => !o && setDirectMode(null)}
            mode={directMode ?? "lab"}
            source="triage"
            ticket={{ id: selectedTicket.id, patient_id: selectedTicket.patient_id, department_id: selectedTicket.department_id, patientName }}
            onDone={() => finishPatient(directMode === "lab" ? "the laboratory" : "the pharmacy")}
          />
          <SendToDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            ticket={{ id: selectedTicket.id, patientName }}
            from="Triage"
            exclude={["triage"]}
            recommended="doctor"
            beforeSend={async () => { if (hasAnyVitals) await saveVitals(); }}
            onSent={(to) => finishPatient(to === "checkout" ? "check-out" : to)}
          />
        </>
      )}
    </StationShell>
  );
};

export default Vitals;
