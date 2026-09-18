import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { StationQueue } from "@/components/StationQueue";
import { NursingProcedures, type SelectedProcedure } from "@/components/NursingProcedures";
import { InterimPayment } from "@/components/InterimPayment";
import { Activity, Send, Calendar, Thermometer, HeartPulse, Weight, Ruler, AlertTriangle, CheckCircle2 } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline, deriveVisitPath } from "@/components/WorkflowTimeline";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import { TriageArrivalAlerts } from "@/components/TriageArrivalAlerts";
import { TriageAIRecommendation, type TriageRecommendation } from "@/components/TriageAIRecommendation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const Vitals = () => {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [urgencyPriority, setUrgencyPriority] = useState("1");
  const [aiRecommendation, setAiRecommendation] = useState<TriageRecommendation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);

  const [form, setForm] = useState({
    weight: "", height: "", bpSystolic: "", bpDiastolic: "",
    pulseRate: "", temperature: "", respiratoryRate: "", spo2: "",
    allergies: "", presentingComplaint: "", nursingNotes: "", nextVisit: "",
  });
  const [procedures, setProcedures] = useState<SelectedProcedure[]>([]);
  const [previousVitals, setPreviousVitals] = useState<any[]>([]);

  const bmi = useMemo(() => {
    const w = parseFloat(form.weight);
    const h = parseFloat(form.height);
    if (!w || !h) return null;
    return (w / (h * h)).toFixed(2);
  }, [form.weight, form.height]);

  useEffect(() => {
    if (selectedTicket?.patient_id) fetchPreviousVitals(selectedTicket.patient_id);
  }, [selectedTicket]);

  const fetchPreviousVitals = async (patientId: string) => {
    const { data } = await supabase.from("vitals").select("*").eq("patient_id", patientId)
      .order("recorded_at", { ascending: false }).limit(5);
    setPreviousVitals(data || []);
  };

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
        vitals: { temperature: numberOrNull(form.temperature), bloodPressureSystolic: numberOrNull(form.bpSystolic), bloodPressureDiastolic: numberOrNull(form.bpDiastolic), pulseRate: numberOrNull(form.pulseRate), respiratoryRate: numberOrNull(form.respiratoryRate), oxygenSaturation: numberOrNull(form.spo2), weight: numberOrNull(form.weight), heightMetres: numberOrNull(form.height), bmi: bmi ? Number(bmi) : null },
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

  const handleSaveAndAdvance = async () => {
    if (!selectedTicket) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user?.id).single();

      const w = parseFloat(form.weight) || null;
      const h = parseFloat(form.height) || null;
      const computedBmi = w && h ? parseFloat((w / (h * h)).toFixed(2)) : null;

      const { error: vitErr } = await supabase.from("vitals").insert({
        patient_id: selectedTicket.patient_id, recorded_by: staff?.id,
        weight: w, height: h ? h * 100 : null, bmi: computedBmi,
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
          nurse_id: user?.id || "", procedure_type: "nursing_notes",
          notes: form.nursingNotes, price: 0,
        });
      }

      // Auto-add triage fee service charge
      const TRIAGE_FEE = 200;
      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
        service_type: "triage", description: "Triage / Vitals Assessment Fee", amount: TRIAGE_FEE, billing_stage: "triage",
      });

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

      await supabase.from("tickets").update({ workflow_stage: "waiting_for_doctor", status: "waiting_for_doctor", priority: Number(urgencyPriority), assigned_to: null, claimed_at: null }).eq("id", selectedTicket.id);

      toast({ title: "Vitals saved", description: "Patient sent to doctor queue" });
      logAuditEvent({ action: "vitals_recorded", module: "triage", details: { patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, procedures: procedures.length } });
      setSelectedTicket(null);
      setForm({ weight: "", height: "", bpSystolic: "", bpDiastolic: "", pulseRate: "", temperature: "", respiratoryRate: "", spo2: "", allergies: "", presentingComplaint: "", nursingNotes: "", nextVisit: "" });
      setProcedures([]);
      setUrgencyPriority("1");
      setAiRecommendation(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const u = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  // Summary card data
  const summaryItems = useMemo(() => {
    const items: { label: string; value: string; status?: "normal" | "warning" | "critical" }[] = [];
    if (form.bpSystolic && form.bpDiastolic) {
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
    if (bmi) {
      const b = parseFloat(bmi);
      items.push({ label: "BMI", value: bmi, status: (b < 18.5 || b >= 30) ? "warning" : "normal" });
    }
    return items;
  }, [form, bmi]);

  return (
    <div className="flex h-screen overflow-hidden">
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

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> Nursing / Triage Station
          </h1>
          <p className="text-muted-foreground mt-1">Record vitals, procedures and advance patients</p>
          </div>
          <TriageArrivalAlerts />
        </div>

        {!selectedTicket ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Select a patient from the queue to begin triage</CardContent></Card>
        ) : (
          <>
            {/* Patient Info Bar */}
            <Card className="border-primary/20">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm">
                  <div><span className="text-muted-foreground">Ticket:</span> <strong>{selectedTicket.ticket_number}</strong></div>
                  <div><span className="text-muted-foreground">Patient:</span> <strong>{selectedTicket.patient?.profile?.full_name || <span className="text-destructive italic">Name missing</span>}</strong></div>
                  <div><span className="text-muted-foreground">OPD No:</span> <strong>{selectedTicket.patient?.patient_id}</strong></div>
                </div>
                <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />
              </CardContent>
            </Card>

            {/* Workflow Timeline */}
            <WorkflowTimeline
              currentStage={selectedTicket.workflow_stage || selectedTicket.status}
              visitPath={deriveVisitPath(selectedTicket.workflow_stage || selectedTicket.status, {})}
            />

            <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />

            <TriageAIRecommendation recommendation={aiRecommendation} loading={aiLoading} disabled={!form.presentingComplaint.trim()} onReview={requestAiReview} />

            <Card>
              <CardHeader><CardTitle className="text-base">Final Clinical Urgency</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Label>The final priority is selected by the attending clinician *</Label>
                <Select value={urgencyPriority} onValueChange={setUrgencyPriority}>
                  <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Normal</SelectItem><SelectItem value="2">High</SelectItem><SelectItem value="3">Emergency</SelectItem></SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Triage Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Thermometer className="h-5 w-5 text-primary" /> Triage Vitals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Row 1: Anthropometric */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Weight className="h-4 w-4" /> Anthropometric
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Weight (kg)</Label>
                      <Input type="number" step="0.1" value={form.weight} onChange={(e) => u("weight", e.target.value)} className="h-12 text-base" placeholder="e.g. 72.5" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Height (m)</Label>
                      <Input type="number" step="0.01" value={form.height} onChange={(e) => u("height", e.target.value)} placeholder="e.g. 1.70" className="h-12 text-base" />
                      <p className="text-xs text-muted-foreground">Enter in meters</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">BMI (automatic)</Label>
                      <Input readOnly value={bmi || ""} className="bg-muted font-bold h-12 text-base" placeholder="Calculated from height and weight" aria-label="Automatically calculated BMI" />
                      {bmi && (
                        <Badge className={`text-xs ${
                          parseFloat(bmi) < 18.5 ? "bg-warning text-warning-foreground" :
                          parseFloat(bmi) < 25 ? "bg-success text-success-foreground" :
                          parseFloat(bmi) < 30 ? "bg-warning text-warning-foreground" :
                          "bg-destructive text-destructive-foreground"
                        }`}>
                          {parseFloat(bmi) < 18.5 ? "Underweight" :
                           parseFloat(bmi) < 25 ? "Normal" :
                           parseFloat(bmi) < 30 ? "Overweight" : "Obese"}
                        </Badge>
                      )}
                      {!bmi && <p className="text-xs text-muted-foreground">Enter height and weight to calculate BMI</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Blood Pressure</Label>
                      <div className="flex gap-1.5 items-center">
                        <Input type="number" placeholder="120" value={form.bpSystolic} onChange={(e) => u("bpSystolic", e.target.value)} className={`h-12 text-base text-center ${getBPClass(form.bpSystolic, form.bpDiastolic)}`} />
                        <span className="text-muted-foreground font-bold text-lg">/</span>
                        <Input type="number" placeholder="80" value={form.bpDiastolic} onChange={(e) => u("bpDiastolic", e.target.value)} className={`h-12 text-base text-center ${getBPClass(form.bpSystolic, form.bpDiastolic)}`} />
                      </div>
                      <p className="text-xs text-muted-foreground">Systolic / Diastolic mmHg</p>
                    </div>
                  </div>
                </div>

                {/* Row 2: Cardiorespiratory */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <HeartPulse className="h-4 w-4" /> Cardiorespiratory
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Pulse Rate (bpm)</Label>
                      <Input type="number" value={form.pulseRate} onChange={(e) => u("pulseRate", e.target.value)} className={`h-12 text-base ${getPulseClass(form.pulseRate)}`} placeholder="60-100" />
                      <p className="text-xs text-muted-foreground">Normal: 60–100 bpm</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Temperature (°C)</Label>
                      <Input type="number" step="0.1" value={form.temperature} onChange={(e) => u("temperature", e.target.value)} className={`h-12 text-base ${getTempClass(form.temperature)}`} placeholder="36.0-37.5" />
                      <p className="text-xs text-muted-foreground">Normal: 36.0–37.5°C</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Respiratory Rate (/min)</Label>
                      <Input type="number" value={form.respiratoryRate} onChange={(e) => u("respiratoryRate", e.target.value)} className={`h-12 text-base ${getRRClass(form.respiratoryRate)}`} placeholder="12-20" />
                      <p className="text-xs text-muted-foreground">Normal: 12–20/min</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">SPO₂ (%)</Label>
                      <Input type="number" step="0.1" value={form.spo2} onChange={(e) => u("spo2", e.target.value)} className={`h-12 text-base ${getSpo2Class(form.spo2)}`} placeholder="95-100" />
                      <p className="text-xs text-muted-foreground">Normal: ≥ 95%</p>
                    </div>
                  </div>
                </div>

                {/* Clinical */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Ruler className="h-4 w-4" /> Clinical Assessment
                  </p>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Allergies</Label>
                      <Input value={form.allergies} onChange={(e) => u("allergies", e.target.value)} placeholder="Known allergies — type NKDA if none known" className="h-12 text-base" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Presenting Complaint *</Label>
                      <Textarea
                        rows={5}
                        value={form.presentingComplaint}
                        onChange={(e) => u("presentingComplaint", e.target.value)}
                        placeholder="Describe the patient's main complaint and symptoms in detail. Include onset, duration, severity, and any associated symptoms..."
                        className="text-base leading-relaxed"
                      />
                      <p className="text-xs text-muted-foreground">This will be shared with the consulting doctor</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nursing Procedures */}
            <Card>
              <CardContent className="pt-6">
                <NursingProcedures procedures={procedures} onChange={setProcedures} />
              </CardContent>
            </Card>

            {/* Nursing Notes & TCA */}
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nursing Notes</Label>
                  <Textarea
                    rows={4}
                    value={form.nursingNotes}
                    onChange={(e) => u("nursingNotes", e.target.value)}
                    placeholder="Additional observations, care plan notes, patient education delivered..."
                    className="text-base leading-relaxed"
                  />
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold"><Calendar className="h-4 w-4" /> Next Visit (TCA)</Label>
                  <Input type="date" value={form.nextVisit} onChange={(e) => u("nextVisit", e.target.value)} className="h-12 text-base" />
                </div>
              </CardContent>
            </Card>

            {/* Vitals Summary Card */}
            {summaryItems.length > 0 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> Vitals Summary — Review Before Saving
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {summaryItems.map((item) => (
                      <div
                        key={item.label}
                        className={`p-3 rounded-lg border text-center transition-colors ${
                          item.status === "critical" ? "border-destructive bg-destructive/10" :
                          item.status === "warning" ? "border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10" :
                          "border-border bg-background"
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</p>
                        <p className={`text-sm font-bold mt-1 ${
                          item.status === "critical" ? "text-destructive" :
                          item.status === "warning" ? "text-[hsl(var(--warning))]" : "text-foreground"
                        }`}>{item.value}</p>
                        {item.status === "critical" && (
                          <AlertTriangle className="h-3 w-3 text-destructive mx-auto mt-1" />
                        )}
                      </div>
                    ))}
                  </div>
                  {summaryItems.some(i => i.status === "critical") && (
                    <div className="mt-3 flex items-center gap-2 text-destructive text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" /> Critical values detected — please verify readings
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Previous Vitals */}
            {previousVitals.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Previous Vitals</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <div className="space-y-2 min-w-[600px]">
                      {previousVitals.map((v) => (
                        <div key={v.id} className="text-xs grid grid-cols-7 gap-2 p-2.5 border rounded-lg">
                          <span className="font-medium">{new Date(v.recorded_at).toLocaleDateString()}</span>
                          <span>T: {v.temperature || "-"}°C</span>
                          <span>BP: {v.blood_pressure_systolic || "-"}/{v.blood_pressure_diastolic || "-"}</span>
                          <span>P: {v.pulse_rate || "-"}</span>
                          <span>SpO₂: {v.oxygen_saturation || "-"}%</span>
                          <span>W: {v.weight || "-"}kg H: {v.height ? (v.height / 100).toFixed(2) : "-"}m</span>
                          <span>BMI: {v.bmi || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Save & Advance */}
            <div className="flex justify-end pb-6">
              <Button size="lg" onClick={handleSaveAndAdvance} disabled={saving} className="gap-2 h-12 px-8 text-base">
                <Send className="h-5 w-5" />
                {saving ? "Saving..." : "Save & Send to Doctor"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Vitals;
