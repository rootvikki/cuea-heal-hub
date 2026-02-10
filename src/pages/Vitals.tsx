import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { StationQueue } from "@/components/StationQueue";
import { NursingProcedures, type SelectedProcedure } from "@/components/NursingProcedures";
import { InterimPayment } from "@/components/InterimPayment";
import { Activity, Send, Calendar } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";

const Vitals = () => {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    weight: "", height: "", bpSystolic: "", bpDiastolic: "",
    pulseRate: "", temperature: "", spo2: "",
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

  const handleSaveAndAdvance = async () => {
    if (!selectedTicket) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user?.id).single();

      const w = parseFloat(form.weight) || null;
      const h = parseFloat(form.height) || null;
      const computedBmi = w && h ? parseFloat((w / (h * h)).toFixed(2)) : null;

      // Save vitals
      const { error: vitErr } = await supabase.from("vitals").insert({
        patient_id: selectedTicket.patient_id,
        recorded_by: staff?.id,
        weight: w,
        height: h ? h * 100 : null, // store in cm
        bmi: computedBmi,
        blood_pressure_systolic: form.bpSystolic ? parseInt(form.bpSystolic) : null,
        blood_pressure_diastolic: form.bpDiastolic ? parseInt(form.bpDiastolic) : null,
        pulse_rate: form.pulseRate ? parseInt(form.pulseRate) : null,
        temperature: form.temperature ? parseFloat(form.temperature) : null,
        oxygen_saturation: form.spo2 ? parseFloat(form.spo2) : null,
        allergies_noted: form.allergies || null,
        presenting_complaint: form.presentingComplaint || null,
      });
      if (vitErr) throw vitErr;

      // Save nursing procedures
      for (const proc of procedures) {
        await supabase.from("nursing_procedures").insert({
          patient_id: selectedTicket.patient_id,
          ticket_id: selectedTicket.id,
          nurse_id: user?.id || "",
          procedure_type: proc.type,
          notes: proc.notes,
          price: proc.price,
        });
        // Add service charge
        await supabase.from("service_charges").insert({
          patient_id: selectedTicket.patient_id,
          ticket_id: selectedTicket.id,
          service_type: "nursing_procedure",
          description: proc.label,
          amount: proc.price,
          billing_stage: "triage",
        });
      }

      // Advance ticket to waiting_for_doctor
      await supabase.from("tickets").update({ workflow_stage: "waiting_for_doctor" }).eq("id", selectedTicket.id);

      toast({ title: "Vitals saved", description: "Patient sent to doctor queue" });
      logAuditEvent({ action: "vitals_recorded", module: "triage", details: { patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, procedures: procedures.length } });
      setSelectedTicket(null);
      setForm({ weight: "", height: "", bpSystolic: "", bpDiastolic: "", pulseRate: "", temperature: "", spo2: "", allergies: "", presentingComplaint: "", nursingNotes: "", nextVisit: "" });
      setProcedures([]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const u = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["checked_in", "triage"]}
        nextStage="waiting_for_doctor"
        title="Triage Queue"
        onSelectPatient={setSelectedTicket}
        selectedTicketId={selectedTicket?.id}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7" /> Nursing / Triage Station
          </h1>
          <p className="text-muted-foreground mt-1">Record vitals, procedures and advance patients</p>
        </div>

        {!selectedTicket ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Select a patient from the queue to begin triage</CardContent></Card>
        ) : (
          <>
            {/* Patient Info Bar */}
            <Card>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-6 text-sm">
                  <div><span className="text-muted-foreground">Ticket:</span> <strong>{selectedTicket.ticket_number}</strong></div>
                  <div><span className="text-muted-foreground">Patient:</span> <strong>{selectedTicket.patient?.profile?.full_name}</strong></div>
                  <div><span className="text-muted-foreground">OPD No:</span> <strong>{selectedTicket.patient?.patient_id}</strong></div>
                </div>
                <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />
              </CardContent>
            </Card>

            {/* Triage Form */}
            <Card>
              <CardHeader><CardTitle>Triage Vitals</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label>Weight (kg)</Label>
                    <Input type="number" step="0.1" value={form.weight} onChange={(e) => u("weight", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Height (m)</Label>
                    <Input type="number" step="0.01" value={form.height} onChange={(e) => u("height", e.target.value)} placeholder="e.g. 1.70" />
                  </div>
                  <div className="space-y-1">
                    <Label>BMI</Label>
                    <Input readOnly value={bmi || ""} className="bg-muted font-semibold" />
                  </div>
                  <div className="space-y-1">
                    <Label>Blood Pressure</Label>
                    <div className="flex gap-1 items-center">
                      <Input type="number" placeholder="120" value={form.bpSystolic} onChange={(e) => u("bpSystolic", e.target.value)} />
                      <span>/</span>
                      <Input type="number" placeholder="80" value={form.bpDiastolic} onChange={(e) => u("bpDiastolic", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Pulse Rate (bpm)</Label>
                    <Input type="number" value={form.pulseRate} onChange={(e) => u("pulseRate", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Temperature (°C)</Label>
                    <Input type="number" step="0.1" value={form.temperature} onChange={(e) => u("temperature", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>SPO₂ (%)</Label>
                    <Input type="number" step="0.1" value={form.spo2} onChange={(e) => u("spo2", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Allergies</Label>
                  <Input value={form.allergies} onChange={(e) => u("allergies", e.target.value)} placeholder="Known allergies..." />
                </div>
                <div className="space-y-1">
                  <Label>Presenting Complaint</Label>
                  <Textarea rows={3} value={form.presentingComplaint} onChange={(e) => u("presentingComplaint", e.target.value)} />
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
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1">
                  <Label>Nursing Notes</Label>
                  <Textarea rows={3} value={form.nursingNotes} onChange={(e) => u("nursingNotes", e.target.value)} />
                </div>
                <div className="space-y-1 max-w-xs">
                  <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Next Visit (TCA)</Label>
                  <Input type="date" value={form.nextVisit} onChange={(e) => u("nextVisit", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Previous Vitals */}
            {previousVitals.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Previous Vitals</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {previousVitals.map((v) => (
                      <div key={v.id} className="text-xs grid grid-cols-4 md:grid-cols-7 gap-2 p-2 border rounded">
                        <span>{new Date(v.recorded_at).toLocaleDateString()}</span>
                        <span>T: {v.temperature || "-"}°C</span>
                        <span>BP: {v.blood_pressure_systolic || "-"}/{v.blood_pressure_diastolic || "-"}</span>
                        <span>P: {v.pulse_rate || "-"}</span>
                        <span>SpO₂: {v.oxygen_saturation || "-"}%</span>
                        <span>W: {v.weight || "-"}kg</span>
                        <span>BMI: {v.bmi || "-"}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Save & Advance */}
            <div className="flex justify-end">
              <Button size="lg" onClick={handleSaveAndAdvance} disabled={saving} className="gap-2">
                <Send className="h-4 w-4" />
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
