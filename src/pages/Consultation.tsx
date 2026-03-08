import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { ReferralForm } from "@/components/ReferralForm";
import { PatientJourney } from "@/components/PatientJourney";
import { logAuditEvent } from "@/lib/auditLog";
import {
  Stethoscope, User, AlertTriangle, Activity, Pill, TestTube,
  Camera, FileText, Plus, X, Phone, Heart, Radio, ClipboardList,
  Clock, CheckCircle2, CircleDot, Thermometer, Droplets, Wind,
  Scale, Ruler, Shield, Save, ChevronRight, Search, Info,
  History, Brain, Clipboard, Syringe, Eye
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────
interface Patient {
  id: string;
  patient_id: string;
  user_id: string;
  blood_type: string | null;
  allergies: string[] | null;
  chronic_conditions: string[] | null;
  insurance_provider: string | null;
  profile?: {
    full_name: string;
    phone: string;
    date_of_birth: string | null;
    gender: string | null;
  };
}

interface Ticket {
  id: string;
  ticket_number: string;
  patient_id: string;
  status: string;
  priority: number;
  workflow_stage: string;
  created_at: string;
  patient?: Patient;
}

interface Vital {
  id: string;
  temperature: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  presenting_complaint: string | null;
  recorded_at: string;
}

interface LabTest {
  id: string;
  test_name: string;
  test_code: string;
  price: number;
  normal_range: string;
  category: string | null;
}

interface ImagingItem {
  id: string;
  modality: string;
  name: string;
  price: number;
}

interface Prescription {
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
}

interface InventoryItem {
  id: string;
  drug_name: string;
  generic_name: string | null;
  strength_size: string | null;
  quantity: number;
  unit_price: number;
}

// ─── Helper: section wrapper ─────────────────────────────────────
const FormSection = ({ icon: Icon, title, hint, children, required }: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) => (
  <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
    <CardHeader className="pb-3 pt-4 px-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {title}
            {required && <span className="text-destructive text-xs">*Required</span>}
          </CardTitle>
          {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{hint}</p>}
        </div>
      </div>
    </CardHeader>
    <CardContent className="px-5 pb-4 pt-0">{children}</CardContent>
  </Card>
);

// ─── Helper: vitals card ─────────────────────────────────────────
const VitalCard = ({ icon: Icon, label, value, unit, status }: {
  icon: React.ElementType;
  label: string;
  value: string | number | null;
  unit?: string;
  status?: "normal" | "warning" | "critical";
}) => {
  const statusColors = {
    normal: "border-l-green-500 bg-green-50/50",
    warning: "border-l-amber-500 bg-amber-50/50",
    critical: "border-l-red-500 bg-red-50/50",
  };
  const color = status ? statusColors[status] : "border-l-border bg-background";

  return (
    <div className={`p-2.5 rounded-lg border border-l-[3px] ${color} transition-colors`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-base font-bold leading-none">
        {value ?? "—"}{unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </p>
    </div>
  );
};

// ─── Helper: wait time ──────────────────────────────────────────
const getWaitTime = (createdAt: string) => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const getWaitColor = (createdAt: string) => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins > 60) return "text-red-600 bg-red-50";
  if (mins > 30) return "text-amber-600 bg-amber-50";
  return "text-muted-foreground bg-muted";
};

// ─── Vitals status helpers ───────────────────────────────────────
const getBPStatus = (sys: number | null, dia: number | null): "normal" | "warning" | "critical" => {
  if (!sys || !dia) return "normal";
  if (sys >= 180 || dia >= 120) return "critical";
  if (sys >= 140 || dia >= 90) return "warning";
  return "normal";
};

const getTempStatus = (t: number | null): "normal" | "warning" | "critical" => {
  if (!t) return "normal";
  if (t >= 39) return "critical";
  if (t >= 37.5 || t < 36) return "warning";
  return "normal";
};

const getSpO2Status = (s: number | null): "normal" | "warning" | "critical" => {
  if (!s) return "normal";
  if (s < 90) return "critical";
  if (s < 95) return "warning";
  return "normal";
};

const getPulseStatus = (p: number | null): "normal" | "warning" | "critical" => {
  if (!p) return "normal";
  if (p > 120 || p < 50) return "critical";
  if (p > 100 || p < 60) return "warning";
  return "normal";
};

// ─── Main Component ──────────────────────────────────────────────
const Consultation = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [patientVitals, setPatientVitals] = useState<Vital[]>([]);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [imagingItems, setImagingItems] = useState<ImagingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pharmacyInventory, setPharmacyInventory] = useState<InventoryItem[]>([]);
  const [drugSearchTerm, setDrugSearchTerm] = useState("");
  const [savingEncounter, setSavingEncounter] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [labSearchTerm, setLabSearchTerm] = useState("");
  const [imagingSearchTerm, setImagingSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("encounter");

  const [encounter, setEncounter] = useState({
    chiefComplaint: "",
    historyOfPresentIllness: "",
    pastMedicalHistory: "",
    pastSurgicalHistory: "",
    medicineHistory: "",
    socialHistory: "",
    subjective: "",
    objective: "",
    physicalExamGeneral: "",
    physicalExamSystemic: "",
    assessment: "",
    plan: "",
    diagnosis: [] as string[],
    followUpDate: "",
  });

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedLabTests, setSelectedLabTests] = useState<string[]>([]);
  const [selectedImaging, setSelectedImaging] = useState<string[]>([]);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [currentPrescription, setCurrentPrescription] = useState<Prescription>({
    medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "",
  });
  const [diagnosisInput, setDiagnosisInput] = useState("");

  // ─── Completion progress ──────────────────────────────────────
  const completionPct = useMemo(() => {
    const fields = [
      encounter.chiefComplaint,
      encounter.historyOfPresentIllness || encounter.subjective,
      encounter.physicalExamGeneral || encounter.objective,
      encounter.assessment,
      encounter.plan,
      encounter.diagnosis.length > 0 ? "yes" : "",
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [encounter]);

  // ─── Auto-save draft to localStorage ──────────────────────────
  useEffect(() => {
    if (!selectedTicket) return;
    const key = `draft-encounter-${selectedTicket.id}`;
    const timeout = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ encounter, prescriptions, selectedLabTests, selectedImaging }));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [encounter, prescriptions, selectedLabTests, selectedImaging, selectedTicket]);

  // ─── Fetch functions ──────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("tickets")
        .select("*, patients!inner(*, profiles!inner(full_name, phone, date_of_birth, gender))")
        .in("workflow_stage", ["waiting_for_doctor", "in_consult", "triage"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });

      const ticketsWithPatients = (data || []).map((ticket: any) => ({
        ...ticket,
        patient: { ...ticket.patients, profile: ticket.patients?.profiles },
      }));
      setQueue(ticketsWithPatients);
    } catch (error) {
      console.error("Error fetching queue:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchLabTests();
    fetchImagingCatalog();
    fetchPharmacyInventory();

    const channel = supabase
      .channel("consultation-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        if (payload.eventType === "UPDATE" && payload.new) {
          const newTicket = payload.new as any;
          if (newTicket.workflow_stage === "waiting_for_doctor") {
            sonnerToast.info("New patient ready for consultation");
          }
        }
        queryClient.invalidateQueries({ queryKey: ["station-queue", "waiting_for_doctor", "in_consult", "triage"] });
        fetchQueue();
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, fetchQueue]);

  useEffect(() => {
    if (selectedTicket?.patient?.id) {
      fetchPatientVitals(selectedTicket.patient.id);
      fetchPatientHistory(selectedTicket.patient.id);
    }
  }, [selectedTicket]);

  const fetchPatientVitals = async (patientId: string) => {
    const { data } = await supabase.from("vitals").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false }).limit(5);
    setPatientVitals(data || []);
  };

  const fetchPatientHistory = async (patientId: string) => {
    const { data } = await supabase.from("encounters").select("*").eq("patient_id", patientId).order("encounter_date", { ascending: false }).limit(10);
    setPatientHistory(data || []);
  };

  const fetchLabTests = async () => {
    const { data } = await supabase.from("lab_tests_catalog").select("*").order("test_name");
    setLabTests(data || []);
  };

  const fetchImagingCatalog = async () => {
    const { data } = await supabase.from("imaging_catalog").select("*").eq("active", true).order("modality");
    setImagingItems(data || []);
  };

  const fetchPharmacyInventory = async () => {
    const { data } = await supabase
      .from("pharmacy_inventory")
      .select("id, drug_name, generic_name, strength_size, quantity, unit_price")
      .gt("quantity", 0)
      .order("drug_name");
    setPharmacyInventory(data || []);
  };

  // ─── Actions ──────────────────────────────────────────────────
  const selectPatient = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    // Try to restore draft
    const key = `draft-encounter-${ticket.id}`;
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setEncounter(parsed.encounter);
        setPrescriptions(parsed.prescriptions || []);
        setSelectedLabTests(parsed.selectedLabTests || []);
        setSelectedImaging(parsed.selectedImaging || []);
        sonnerToast.info("Draft restored", { description: "Your previous notes were recovered." });
        return;
      } catch { /* ignore parse errors */ }
    }
    setEncounter({
      chiefComplaint: "", historyOfPresentIllness: "", pastMedicalHistory: "", pastSurgicalHistory: "",
      medicineHistory: "", socialHistory: "", subjective: "", objective: "",
      physicalExamGeneral: "", physicalExamSystemic: "", assessment: "", plan: "",
      diagnosis: [], followUpDate: "",
    });
    setPrescriptions([]);
    setSelectedLabTests([]);
    setSelectedImaging([]);
    setActiveTab("encounter");
  };

  const startConsultation = async (ticket: Ticket) => {
    await supabase.from("tickets").update({ workflow_stage: "in_consult", status: "in_consult" }).eq("id", ticket.id);
    fetchQueue();
  };

  const addDiagnosis = () => {
    if (diagnosisInput.trim() && !encounter.diagnosis.includes(diagnosisInput.trim())) {
      setEncounter({ ...encounter, diagnosis: [...encounter.diagnosis, diagnosisInput.trim()] });
      setDiagnosisInput("");
    }
  };

  const removeDiagnosis = (index: number) => {
    setEncounter({ ...encounter, diagnosis: encounter.diagnosis.filter((_, i) => i !== index) });
  };

  const addPrescription = () => {
    if (currentPrescription.medication_name && currentPrescription.dosage) {
      setPrescriptions([...prescriptions, currentPrescription]);
      setCurrentPrescription({ medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" });
      setDrugSearchTerm("");
      setShowPrescriptionDialog(false);
      sonnerToast.success("Prescription added");
    }
  };

  const removePrescription = (index: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  const saveEncounter = async () => {
    if (!selectedTicket?.patient?.id) return;
    setSavingEncounter(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user.id).single();
      const { data: dept } = await supabase.from("departments").select("id").eq("name", "General Medicine").single();

      const fullSubjective = [
        encounter.subjective,
        encounter.historyOfPresentIllness && `HPI: ${encounter.historyOfPresentIllness}`,
        encounter.pastMedicalHistory && `PMH: ${encounter.pastMedicalHistory}`,
        encounter.pastSurgicalHistory && `PSH: ${encounter.pastSurgicalHistory}`,
        encounter.medicineHistory && `Medications: ${encounter.medicineHistory}`,
        encounter.socialHistory && `Social: ${encounter.socialHistory}`,
      ].filter(Boolean).join("\n\n");

      const fullObjective = [
        encounter.objective,
        encounter.physicalExamGeneral && `General Exam: ${encounter.physicalExamGeneral}`,
        encounter.physicalExamSystemic && `Systemic Exam: ${encounter.physicalExamSystemic}`,
      ].filter(Boolean).join("\n\n");

      const { data: encounterData, error: encounterError } = await supabase
        .from("encounters")
        .insert({
          patient_id: selectedTicket.patient.id,
          ticket_id: selectedTicket.id,
          doctor_id: staff?.id ?? (() => { throw new Error("No staff record found for current user. Please contact admin."); })(),
          department_id: dept?.id ?? (() => { throw new Error("Department 'General Medicine' not found. Please contact admin."); })(),
          chief_complaint: encounter.chiefComplaint,
          subjective: fullSubjective,
          objective: fullObjective,
          assessment: encounter.assessment,
          plan: encounter.plan,
          diagnosis: encounter.diagnosis,
          follow_up_date: encounter.followUpDate || null,
        })
        .select()
        .single();

      if (encounterError) throw encounterError;

      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient.id,
        encounter_id: encounterData.id,
        ticket_id: selectedTicket.id,
        service_type: "consultation",
        description: "Doctor Consultation",
        amount: 500,
        billing_stage: "consultation",
      });

      if (prescriptions.length > 0) {
        const prescriptionRecords = prescriptions.map((p) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          doctor_id: staff!.id,
          medication_name: p.medication_name,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          instructions: p.instructions,
        }));
        await supabase.from("prescriptions").insert(prescriptionRecords);
      }

      if (selectedLabTests.length > 0) {
        const labOrders = selectedLabTests.map((testId) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          doctor_id: staff!.id,
          test_id: testId,
          status: "pending",
        }));
        await supabase.from("lab_orders").insert(labOrders);

        for (const testId of selectedLabTests) {
          const test = labTests.find(t => t.id === testId);
          if (test) {
            await supabase.from("service_charges").insert({
              patient_id: selectedTicket.patient!.id,
              encounter_id: encounterData.id,
              ticket_id: selectedTicket.id,
              service_type: "laboratory",
              description: `Lab: ${test.test_name}`,
              amount: test.price,
              billing_stage: "laboratory",
            });
          }
        }
      }

      if (selectedImaging.length > 0) {
        const imagingOrders = selectedImaging.map((imagingId) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          imaging_id: imagingId,
          ordered_by: staff!.id,
          status: "pending",
          clinical_indication: encounter.chiefComplaint,
        }));
        await supabase.from("imaging_orders").insert(imagingOrders);

        for (const imagingId of selectedImaging) {
          const item = imagingItems.find(i => i.id === imagingId);
          if (item) {
            await supabase.from("service_charges").insert({
              patient_id: selectedTicket.patient!.id,
              encounter_id: encounterData.id,
              ticket_id: selectedTicket.id,
              service_type: "imaging",
              description: `Imaging: ${item.name}`,
              amount: item.price,
              billing_stage: "imaging",
            });
          }
        }
      }

      type WorkflowStage = "at_billing" | "at_imaging" | "at_lab" | "at_pharmacy" | "checked_in" | "checked_out" | "in_consult" | "order_placed_imaging" | "order_placed_lab" | "triage" | "waiting_for_doctor";
      let nextStage: WorkflowStage = "at_billing";
      if (selectedLabTests.length > 0) nextStage = "at_lab";
      else if (selectedImaging.length > 0) nextStage = "at_imaging";
      else if (prescriptions.length > 0) nextStage = "at_pharmacy";

      await supabase.from("tickets").update({ workflow_stage: nextStage, status: nextStage }).eq("id", selectedTicket.id);

      // Clear draft
      localStorage.removeItem(`draft-encounter-${selectedTicket.id}`);

      toast({ title: "✅ Consultation Saved", description: `Patient moved to ${nextStage.replace(/_/g, " ")}.` });
      logAuditEvent({ action: "consultation_saved", module: "consultation", details: { encounter_id: encounterData.id, patient_id: selectedTicket.patient!.id, next_stage: nextStage, diagnosis: encounter.diagnosis } });
      setSelectedTicket(null);
      fetchQueue();
    } catch (error) {
      console.error("Error saving encounter:", error);
      toast({ title: "Error", description: "Failed to save consultation. Please try again.", variant: "destructive" });
    } finally {
      setSavingEncounter(false);
    }
  };

  const latestVitals = patientVitals[0];

  const calcAge = (dob: string | null) => {
    if (!dob) return "N/A";
    const birthDate = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    if (today.getDate() < birthDate.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    if (years < 1) return `${months} mo`;
    if (months === 0) return `${years} yr`;
    return `${years} yr ${months} mo`;
  };

  const totalOrders = prescriptions.length + selectedLabTests.length + selectedImaging.length;

  // Filtered lab tests
  const filteredLabTests = useMemo(() => {
    if (!labSearchTerm) return labTests;
    const term = labSearchTerm.toLowerCase();
    return labTests.filter(t => t.test_name.toLowerCase().includes(term) || (t.category || "").toLowerCase().includes(term));
  }, [labTests, labSearchTerm]);

  // Filtered imaging
  const filteredImaging = useMemo(() => {
    if (!imagingSearchTerm) return imagingItems;
    const term = imagingSearchTerm.toLowerCase();
    return imagingItems.filter(i => i.name.toLowerCase().includes(term) || i.modality.toLowerCase().includes(term));
  }, [imagingItems, imagingSearchTerm]);

  // ─── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading consultation workstation...</p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* ── Left Panel: Patient Queue ── */}
        <div className="w-80 border-r bg-card flex flex-col shrink-0">
          <div className="p-4 border-b bg-primary/5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                Consultation Queue
              </h2>
              {isLive && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-600/40 bg-green-50 text-[10px] px-2 py-0.5">
                  <Radio className="h-2 w-2 animate-pulse" /> Live
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {queue.filter(t => t.workflow_stage === "waiting_for_doctor").length} waiting · {queue.filter(t => t.workflow_stage === "in_consult").length} in consult
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1.5">
              {queue.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Stethoscope className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No patients in queue</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Patients will appear here after triage</p>
                </div>
              ) : (
                queue.map((ticket) => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  const isInConsult = ticket.workflow_stage === "in_consult";
                  return (
                    <div
                      key={ticket.id}
                      className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? "bg-primary/8 border-primary shadow-sm ring-1 ring-primary/20"
                          : "bg-background hover:bg-muted/60 hover:border-border"
                      }`}
                      onClick={() => selectPatient(ticket)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">
                            {ticket.patient?.profile?.full_name || "Unknown"}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {ticket.ticket_number} · {ticket.patient?.patient_id}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {ticket.priority > 1 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getWaitColor(ticket.created_at)}`}>
                            <Clock className="h-2.5 w-2.5 inline mr-0.5" />{getWaitTime(ticket.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge
                          variant={isInConsult ? "default" : "outline"}
                          className={`text-[10px] ${isInConsult ? "bg-primary" : ""}`}
                        >
                          {isInConsult ? (
                            <><CircleDot className="h-2.5 w-2.5 mr-0.5" /> In Consult</>
                          ) : (
                            ticket.workflow_stage?.replace(/_/g, " ")
                          )}
                        </Badge>
                        {ticket.patient?.allergies && ticket.patient.allergies.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Allergies: {ticket.patient.allergies.join(", ")}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>

                      {isSelected && !isInConsult && (
                        <Button
                          size="sm"
                          className="w-full mt-2.5 h-8 text-xs font-medium"
                          onClick={(e) => { e.stopPropagation(); startConsultation(ticket); }}
                        >
                          <Stethoscope className="h-3.5 w-3.5 mr-1.5" /> Begin Consultation
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="w-20 h-20 mx-auto rounded-full bg-primary/5 flex items-center justify-center">
                  <Stethoscope className="h-10 w-10 text-primary/30" />
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground">Select a Patient</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a patient from the queue to begin documentation
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Patient Header Bar ── */}
              <div className="border-b bg-card shadow-sm">
                <div className="px-5 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h1 className="text-lg font-bold truncate">{selectedTicket.patient?.profile?.full_name}</h1>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="font-medium text-foreground">{selectedTicket.patient?.patient_id}</span>
                          <span className="text-border">|</span>
                          <span>{calcAge(selectedTicket.patient?.profile?.date_of_birth || null)}</span>
                          <span className="text-border">|</span>
                          <span className="capitalize">{selectedTicket.patient?.profile?.gender || "N/A"}</span>
                          {selectedTicket.patient?.blood_type && (
                            <>
                              <span className="text-border">|</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 bg-red-50">
                                <Droplets className="h-2.5 w-2.5 mr-0.5" />{selectedTicket.patient.blood_type}
                              </Badge>
                            </>
                          )}
                          {selectedTicket.patient?.profile?.phone && (
                            <>
                              <span className="text-border">|</span>
                              <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{selectedTicket.patient.profile.phone}</span>
                            </>
                          )}
                          {selectedTicket.patient?.insurance_provider && (
                            <>
                              <span className="text-border">|</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                <Shield className="h-2.5 w-2.5 mr-0.5" />{selectedTicket.patient.insurance_provider}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right mr-2 hidden lg:block">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Notes</span>
                          <Progress value={completionPct} className="w-20 h-1.5" />
                          <span className="text-[10px] font-medium">{completionPct}%</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowReferralForm(true)}>
                        <FileText className="h-3.5 w-3.5 mr-1" /> Referral
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Allergy banner */}
                  {selectedTicket.patient?.allergies && selectedTicket.patient.allergies.length > 0 && (
                    <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-medium text-amber-800">Allergies:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedTicket.patient.allergies.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-amber-100 border-amber-300 text-amber-800">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Workspace ── */}
              <div className="flex-1 overflow-hidden flex">
                {/* Center: Tabs */}
                <div className="flex-1 overflow-auto">
                  <div className="p-5">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                      <TabsList className="bg-muted/60 p-1">
                        <TabsTrigger value="encounter" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                          <Clipboard className="h-3.5 w-3.5" /> Clinical Notes
                        </TabsTrigger>
                        <TabsTrigger value="orders" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                          <Syringe className="h-3.5 w-3.5" /> Orders
                          {totalOrders > 0 && (
                            <Badge className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]">{totalOrders}</Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="journey" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                          <ClipboardList className="h-3.5 w-3.5" /> Journey
                        </TabsTrigger>
                        <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                          <History className="h-3.5 w-3.5" /> History
                        </TabsTrigger>
                      </TabsList>

                      {/* ── Clinical Notes Tab ── */}
                      <TabsContent value="encounter" className="space-y-4 mt-0">
                        <FormSection
                          icon={AlertTriangle}
                          title="Chief Complaint"
                          hint="What is the primary reason for today's visit?"
                          required
                        >
                          <Input
                            value={encounter.chiefComplaint}
                            onChange={(e) => setEncounter({ ...encounter, chiefComplaint: e.target.value })}
                            placeholder='e.g., "Severe headache for 3 days"'
                            className="text-sm"
                          />
                          {latestVitals?.presenting_complaint && (
                            <div className="mt-2 p-2 rounded-md bg-blue-50 border border-blue-200">
                              <p className="text-xs text-blue-700">
                                <Info className="h-3 w-3 inline mr-1" />
                                <strong>From Triage:</strong> {latestVitals.presenting_complaint}
                              </p>
                            </div>
                          )}
                        </FormSection>

                        <FormSection
                          icon={FileText}
                          title="History of Presenting Illness"
                          hint="Onset, duration, character, radiation, associated symptoms, timing, exacerbating/relieving factors, severity (SOCRATES)"
                        >
                          <Textarea
                            value={encounter.historyOfPresentIllness}
                            onChange={(e) => setEncounter({ ...encounter, historyOfPresentIllness: e.target.value })}
                            placeholder="Describe the onset, progression, and character of symptoms..."
                            rows={3}
                            className="text-sm resize-y"
                          />
                        </FormSection>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <FormSection icon={Heart} title="Past Medical History" hint="Previous illnesses, hospitalizations, chronic conditions">
                            <Textarea
                              value={encounter.pastMedicalHistory}
                              onChange={(e) => setEncounter({ ...encounter, pastMedicalHistory: e.target.value })}
                              placeholder="Known chronic diseases, past hospitalizations..."
                              rows={2}
                              className="text-sm resize-y"
                            />
                          </FormSection>
                          <FormSection icon={Syringe} title="Past Surgical History" hint="Previous operations, complications, anaesthesia reactions">
                            <Textarea
                              value={encounter.pastSurgicalHistory}
                              onChange={(e) => setEncounter({ ...encounter, pastSurgicalHistory: e.target.value })}
                              placeholder="Appendectomy (2019), Tonsillectomy..."
                              rows={2}
                              className="text-sm resize-y"
                            />
                          </FormSection>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <FormSection icon={Pill} title="Medication History" hint="Current medications, dosages, adherence, OTC drugs">
                            <Textarea
                              value={encounter.medicineHistory}
                              onChange={(e) => setEncounter({ ...encounter, medicineHistory: e.target.value })}
                              placeholder="Current medications and dosages..."
                              rows={2}
                              className="text-sm resize-y"
                            />
                          </FormSection>
                          <FormSection icon={User} title="Social History" hint="Smoking, alcohol, occupation, living situation, exercise">
                            <Textarea
                              value={encounter.socialHistory}
                              onChange={(e) => setEncounter({ ...encounter, socialHistory: e.target.value })}
                              placeholder="Smoking status, alcohol use, occupation..."
                              rows={2}
                              className="text-sm resize-y"
                            />
                          </FormSection>
                        </div>

                        <div className="flex items-center gap-3 py-2">
                          <Separator className="flex-1" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SOAP Documentation</span>
                          <Separator className="flex-1" />
                        </div>

                        <FormSection icon={Clipboard} title="Subjective (S)" hint="Additional patient-reported information not covered above">
                          <Textarea
                            value={encounter.subjective}
                            onChange={(e) => setEncounter({ ...encounter, subjective: e.target.value })}
                            placeholder="Additional subjective findings, review of systems..."
                            rows={2}
                            className="text-sm resize-y"
                          />
                        </FormSection>

                        <FormSection icon={Eye} title="Objective (O) — Physical Examination" hint="Document your clinical findings from examination">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">General Examination</Label>
                              <Textarea
                                value={encounter.physicalExamGeneral}
                                onChange={(e) => setEncounter({ ...encounter, physicalExamGeneral: e.target.value })}
                                placeholder="General appearance, nutritional status, hydration, pallor, jaundice, cyanosis, lymphadenopathy..."
                                rows={3}
                                className="text-sm resize-y"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">Systemic Examination</Label>
                              <Textarea
                                value={encounter.physicalExamSystemic}
                                onChange={(e) => setEncounter({ ...encounter, physicalExamSystemic: e.target.value })}
                                placeholder="CVS: S1 S2 heard, no murmurs&#10;RS: Equal air entry, clear&#10;GIT: Soft, non-tender&#10;CNS: GCS 15/15"
                                rows={3}
                                className="text-sm resize-y"
                              />
                            </div>
                          </div>
                          <Textarea
                            value={encounter.objective}
                            onChange={(e) => setEncounter({ ...encounter, objective: e.target.value })}
                            placeholder="Additional objective findings, special tests..."
                            rows={2}
                            className="text-sm resize-y mt-3"
                          />
                        </FormSection>

                        <FormSection icon={Brain} title="Assessment (A) / Diagnosis" hint="Clinical impression, working diagnosis, differentials — use ICD codes when possible">
                          <Textarea
                            value={encounter.assessment}
                            onChange={(e) => setEncounter({ ...encounter, assessment: e.target.value })}
                            placeholder="Clinical impression and reasoning..."
                            rows={2}
                            className="text-sm resize-y"
                          />
                          <div className="flex gap-2 mt-3">
                            <Input
                              value={diagnosisInput}
                              onChange={(e) => setDiagnosisInput(e.target.value)}
                              placeholder="Add diagnosis (e.g., J06.9 — Upper respiratory infection)"
                              className="text-sm"
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDiagnosis())}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={addDiagnosis} disabled={!diagnosisInput.trim()}>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add
                            </Button>
                          </div>
                          {encounter.diagnosis.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {encounter.diagnosis.map((d, i) => (
                                <Badge key={i} variant="secondary" className="gap-1 text-xs py-1 px-2">
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  {d}
                                  <X className="h-3 w-3 cursor-pointer hover:text-destructive transition-colors" onClick={() => removeDiagnosis(i)} />
                                </Badge>
                              ))}
                            </div>
                          )}
                        </FormSection>

                        <FormSection icon={ClipboardList} title="Plan (P)" hint="Treatment plan, medications, investigations, follow-up, patient education">
                          <Textarea
                            value={encounter.plan}
                            onChange={(e) => setEncounter({ ...encounter, plan: e.target.value })}
                            placeholder="1. Investigations: CBC, RBS&#10;2. Treatment: Amoxicillin 500mg TDS × 7 days&#10;3. Follow-up in 2 weeks&#10;4. Patient counselled on..."
                            rows={4}
                            className="text-sm resize-y"
                          />
                        </FormSection>

                        <FormSection icon={Clock} title="Follow-up / TCA" hint="When should the patient return?">
                          <Input
                            type="date"
                            value={encounter.followUpDate}
                            onChange={(e) => setEncounter({ ...encounter, followUpDate: e.target.value })}
                            className="text-sm max-w-xs"
                          />
                        </FormSection>
                      </TabsContent>

                      {/* ── Orders Tab ── */}
                      <TabsContent value="orders" className="space-y-5 mt-0">
                        {/* Prescriptions */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-5">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <div className="p-1.5 rounded-md bg-green-100 text-green-700"><Pill className="h-4 w-4" /></div>
                                Prescriptions
                                {prescriptions.length > 0 && <Badge variant="secondary" className="text-[10px]">{prescriptions.length}</Badge>}
                              </CardTitle>
                              <Button size="sm" onClick={() => setShowPrescriptionDialog(true)} className="h-8 text-xs">
                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Medication
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="px-5 pb-4">
                            {prescriptions.length === 0 ? (
                              <div className="text-center py-6 text-muted-foreground">
                                <Pill className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs">No medications prescribed yet</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {prescriptions.map((p, i) => (
                                  <div key={i} className="flex items-center justify-between p-3 bg-green-50/50 border border-green-100 rounded-lg">
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm">{p.medication_name}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {p.dosage} · {p.frequency} · {p.duration} · Qty: {p.quantity}
                                      </p>
                                      {p.instructions && <p className="text-xs text-muted-foreground italic mt-0.5">{p.instructions}</p>}
                                    </div>
                                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => removePrescription(i)}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Lab Tests */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-blue-100 text-blue-700"><TestTube className="h-4 w-4" /></div>
                              Laboratory Investigations
                              {selectedLabTests.length > 0 && <Badge variant="secondary" className="text-[10px]">{selectedLabTests.length}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-4 space-y-3">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                value={labSearchTerm}
                                onChange={(e) => setLabSearchTerm(e.target.value)}
                                placeholder="Search lab tests..."
                                className="pl-8 h-8 text-xs"
                              />
                            </div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-56 overflow-auto">
                              {filteredLabTests.map((test) => {
                                const selected = selectedLabTests.includes(test.id);
                                return (
                                  <div
                                    key={test.id}
                                    className={`p-2.5 border rounded-lg cursor-pointer transition-all text-sm ${
                                      selected
                                        ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200"
                                        : "hover:bg-muted/60 hover:border-border"
                                    }`}
                                    onClick={() => {
                                      if (selected) setSelectedLabTests(selectedLabTests.filter(t => t !== test.id));
                                      else setSelectedLabTests([...selectedLabTests, test.id]);
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <p className="font-medium text-xs leading-tight">{test.test_name}</p>
                                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1">KES {test.price}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Imaging */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-5">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-purple-100 text-purple-700"><Camera className="h-4 w-4" /></div>
                              Imaging Investigations
                              {selectedImaging.length > 0 && <Badge variant="secondary" className="text-[10px]">{selectedImaging.length}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-4 space-y-3">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                value={imagingSearchTerm}
                                onChange={(e) => setImagingSearchTerm(e.target.value)}
                                placeholder="Search imaging..."
                                className="pl-8 h-8 text-xs"
                              />
                            </div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-56 overflow-auto">
                              {filteredImaging.map((item) => {
                                const selected = selectedImaging.includes(item.id);
                                return (
                                  <div
                                    key={item.id}
                                    className={`p-2.5 border rounded-lg cursor-pointer transition-all text-sm ${
                                      selected
                                        ? "bg-purple-50 border-purple-300 ring-1 ring-purple-200"
                                        : "hover:bg-muted/60 hover:border-border"
                                    }`}
                                    onClick={() => {
                                      if (selected) setSelectedImaging(selectedImaging.filter(i => i !== item.id));
                                      else setSelectedImaging([...selectedImaging, item.id]);
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <p className="font-medium text-xs leading-tight">{item.name}</p>
                                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 shrink-0" />}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1">{item.modality} · KES {item.price}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* ── Journey Tab ── */}
                      <TabsContent value="journey" className="mt-0">
                        <PatientJourney patientId={selectedTicket.patient!.id} ticketId={selectedTicket.id} />
                      </TabsContent>

                      {/* ── History Tab ── */}
                      <TabsContent value="history" className="mt-0">
                        <Card className="border-border/60">
                          <CardHeader className="px-5 pt-4 pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <History className="h-4 w-4 text-muted-foreground" /> Previous Encounters
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-5 pb-4">
                            {patientHistory.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs">No previous encounters on record</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {patientHistory.map((enc) => (
                                  <div key={enc.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-xs font-semibold">{new Date(enc.encounter_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                      {enc.diagnosis && enc.diagnosis.length > 0 && (
                                        <Badge variant="outline" className="text-[10px]">{enc.diagnosis[0]}</Badge>
                                      )}
                                    </div>
                                    {enc.chief_complaint && <p className="text-xs text-muted-foreground">{enc.chief_complaint}</p>}
                                    {enc.plan && <p className="text-xs mt-1"><strong>Plan:</strong> {enc.plan}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>

                {/* ── Right Panel: Vitals & Quick Info ── */}
                <div className="w-72 border-l bg-muted/10 overflow-auto shrink-0 hidden xl:block">
                  <div className="p-4 space-y-5">
                    {/* Vitals */}
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
                        <Activity className="h-3.5 w-3.5" /> Latest Vitals
                      </h3>
                      {latestVitals ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <VitalCard
                              icon={Activity}
                              label="Blood Pressure"
                              value={latestVitals.blood_pressure_systolic ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` : null}
                              unit="mmHg"
                              status={getBPStatus(latestVitals.blood_pressure_systolic, latestVitals.blood_pressure_diastolic)}
                            />
                            <VitalCard
                              icon={Heart}
                              label="Pulse"
                              value={latestVitals.pulse_rate}
                              unit="bpm"
                              status={getPulseStatus(latestVitals.pulse_rate)}
                            />
                            <VitalCard
                              icon={Thermometer}
                              label="Temperature"
                              value={latestVitals.temperature}
                              unit="°C"
                              status={getTempStatus(latestVitals.temperature)}
                            />
                            <VitalCard
                              icon={Droplets}
                              label="SpO₂"
                              value={latestVitals.oxygen_saturation}
                              unit="%"
                              status={getSpO2Status(latestVitals.oxygen_saturation)}
                            />
                            <VitalCard icon={Wind} label="Resp Rate" value={latestVitals.respiratory_rate} unit="/min" />
                            <VitalCard icon={Scale} label="Weight" value={latestVitals.weight} unit="kg" />
                          </div>
                          {latestVitals.height && latestVitals.bmi && (
                            <div className="grid grid-cols-2 gap-2">
                              <VitalCard icon={Ruler} label="Height" value={latestVitals.height} unit="cm" />
                              <VitalCard icon={Scale} label="BMI" value={latestVitals.bmi} />
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground text-center mt-1">
                            Recorded {new Date(latestVitals.recorded_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <Activity className="h-6 w-6 mx-auto mb-1 opacity-20" />
                          <p className="text-xs">No vitals recorded</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Chronic Conditions */}
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Heart className="h-3.5 w-3.5" /> Chronic Conditions
                      </h3>
                      {selectedTicket.patient?.chronic_conditions && selectedTicket.patient.chronic_conditions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTicket.patient.chronic_conditions.map((c, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-red-50 border-red-200 text-red-700">{c}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">None recorded</p>
                      )}
                    </div>

                    <Separator />

                    {/* Quick Summary */}
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-2">Order Summary</h3>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Prescriptions</span>
                          <span className="font-medium">{prescriptions.length}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Lab Tests</span>
                          <span className="font-medium">{selectedLabTests.length}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Imaging</span>
                          <span className="font-medium">{selectedImaging.length}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-xs font-semibold">
                          <span>Total Orders</span>
                          <span>{totalOrders}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Footer: Save Bar ── */}
              <div className="border-t bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.04)] px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Pill className="h-3 w-3" />{prescriptions.length} Rx</span>
                  <span className="flex items-center gap-1"><TestTube className="h-3 w-3" />{selectedLabTests.length} Labs</span>
                  <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{selectedImaging.length} Imaging</span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-[10px] text-muted-foreground/60">Auto-saved as draft</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedTicket(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={saveEncounter}
                    disabled={!encounter.chiefComplaint || savingEncounter}
                    className="min-w-[140px]"
                  >
                    {savingEncounter ? (
                      <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-2" /> Saving...</>
                    ) : (
                      <><Save className="h-3.5 w-3.5 mr-1.5" /> Complete & Save</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Prescription Dialog ── */}
        <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-green-100 text-green-700"><Pill className="h-4 w-4" /></div>
                Add Prescription
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Medication Name <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={drugSearchTerm}
                    onChange={(e) => {
                      setDrugSearchTerm(e.target.value);
                      if (!e.target.value) setCurrentPrescription({ ...currentPrescription, medication_name: "" });
                    }}
                    placeholder="Search pharmacy inventory..."
                    className="pl-8 text-sm"
                  />
                </div>
                {drugSearchTerm && !currentPrescription.medication_name && (
                  <div className="border rounded-lg max-h-40 overflow-auto shadow-sm">
                    {pharmacyInventory
                      .filter(item =>
                        item.drug_name.toLowerCase().includes(drugSearchTerm.toLowerCase()) ||
                        (item.generic_name || "").toLowerCase().includes(drugSearchTerm.toLowerCase())
                      )
                      .slice(0, 10)
                      .map(item => (
                        <div
                          key={item.id}
                          className="p-2.5 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm transition-colors"
                          onClick={() => {
                            const fullName = item.strength_size ? `${item.drug_name} ${item.strength_size}` : item.drug_name;
                            setCurrentPrescription({ ...currentPrescription, medication_name: fullName });
                            setDrugSearchTerm(fullName);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-xs">{item.drug_name}</span>
                            <Badge variant={item.quantity <= 10 ? "destructive" : "outline"} className="text-[10px]">
                              Stock: {item.quantity}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {item.generic_name && <span>{item.generic_name} · </span>}
                            {item.strength_size && <span>{item.strength_size} · </span>}
                            KES {item.unit_price}
                          </div>
                        </div>
                      ))}
                    {pharmacyInventory.filter(item =>
                      item.drug_name.toLowerCase().includes(drugSearchTerm.toLowerCase()) ||
                      (item.generic_name || "").toLowerCase().includes(drugSearchTerm.toLowerCase())
                    ).length === 0 && (
                      <p className="p-3 text-xs text-muted-foreground text-center">No matching drugs in inventory</p>
                    )}
                  </div>
                )}
                {currentPrescription.medication_name && (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {currentPrescription.medication_name}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Dosage <span className="text-destructive">*</span></Label>
                  <Input value={currentPrescription.dosage} onChange={(e) => setCurrentPrescription({ ...currentPrescription, dosage: e.target.value })} placeholder="e.g., 1 tablet" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Frequency</Label>
                  <Select value={currentPrescription.frequency} onValueChange={(value) => setCurrentPrescription({ ...currentPrescription, frequency: value })}>
                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                    <SelectContent>
                      {["Once daily", "Twice daily", "Three times daily", "Four times daily", "Every 4 hours", "Every 6 hours", "Every 8 hours", "As needed", "At bedtime", "STAT"].map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Duration</Label>
                  <Input value={currentPrescription.duration} onChange={(e) => setCurrentPrescription({ ...currentPrescription, duration: e.target.value })} placeholder="e.g., 7 days" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Quantity</Label>
                  <Input type="number" value={currentPrescription.quantity} onChange={(e) => setCurrentPrescription({ ...currentPrescription, quantity: parseInt(e.target.value) || 1 })} min="1" className="text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Special Instructions</Label>
                <Textarea value={currentPrescription.instructions} onChange={(e) => setCurrentPrescription({ ...currentPrescription, instructions: e.target.value })} placeholder="e.g., Take with food, avoid dairy products" rows={2} className="text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowPrescriptionDialog(false)}>Cancel</Button>
                <Button size="sm" onClick={addPrescription} disabled={!currentPrescription.medication_name || !currentPrescription.dosage}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Prescription
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Referral Form */}
        {selectedTicket?.patient && (
          <ReferralForm
            patientId={selectedTicket.patient.id}
            patientName={selectedTicket.patient.profile?.full_name || ""}
            patientAge={calcAge(selectedTicket.patient.profile?.date_of_birth || null)}
            patientGender={selectedTicket.patient.profile?.gender || ""}
            doctorName=""
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default Consultation;
