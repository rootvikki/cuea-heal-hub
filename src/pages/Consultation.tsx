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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { ReferralForm } from "@/components/ReferralForm";
import { InterimPayment } from "@/components/InterimPayment";
import { PatientJourney } from "@/components/PatientJourney";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline, deriveVisitPath } from "@/components/WorkflowTimeline";
import { LabOrderTimeline, labOrderStatusLabel } from "@/components/LabOrderTimeline";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import {
  Stethoscope, User, AlertTriangle, Activity, Pill, TestTube,
  Camera, FileText, Plus, X, Phone, Heart, Radio, ClipboardList,
  Clock, CheckCircle2, CircleDot, Thermometer, Droplets, Wind,
  Scale, Ruler, Shield, Save, ChevronRight, Search, Info,
  History, Brain, Clipboard, Syringe, Eye, ChevronDown,
  ChevronsUpDown, DollarSign, ArrowRight, MapPin, ChevronLeft
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

interface SentLabOrder {
  id: string;
  status: string | null;
  created_at: string | null;
  received_at: string | null;
  sample_collected_at: string | null;
  processing_started_at: string | null;
  completed_at: string | null;
  result_entered_at: string | null;
  test?: { test_name: string } | null;
}



interface Prescription {
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
  route: string;
}

interface InventoryItem {
  id: string;
  drug_name: string;
  generic_name: string | null;
  strength_size: string | null;
  quantity: number;
  unit_price: number;
}

// ─── Helper: vitals mini card ────────────────────────────────────
const VitalCard = ({ icon: Icon, label, value, unit, status }: {
  icon: React.ElementType;
  label: string;
  value: string | number | null;
  unit?: string;
  status?: "normal" | "warning" | "critical";
}) => {
  const cls = status === "critical"
    ? "border-l-destructive bg-destructive/5"
    : status === "warning"
    ? "border-l-[hsl(var(--warning))] bg-[hsl(var(--warning))]/5"
    : "border-l-[hsl(var(--success))] bg-[hsl(var(--success))]/5";

  return (
    <div className={`p-2.5 rounded-lg border border-l-[3px] ${cls} transition-colors`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold leading-none">
        {value ?? "—"}{unit && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </p>
    </div>
  );
};

// ─── Helper: section with accordion ──────────────────────────────
const SectionGroup = ({ value, icon: Icon, title, badge, children }: {
  value: string;
  icon: React.ElementType;
  title: string;
  badge?: number;
  children: React.ReactNode;
}) => (
  <AccordionItem value={value} className="border rounded-xl overflow-hidden bg-card shadow-sm">
    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-colors [&[data-state=open]]:bg-muted/20">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sm">{title}</span>
        {badge !== undefined && badge > 0 && (
          <Badge variant="secondary" className="text-[10px] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{badge} filled
          </Badge>
        )}
      </div>
    </AccordionTrigger>
    <AccordionContent className="px-4 pb-4 pt-2">
      {children}
    </AccordionContent>
  </AccordionItem>
);

// ─── Helper: form field ──────────────────────────────────────────
const Field = ({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <Label className="text-sm font-semibold text-foreground/80">
      {label}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
    {hint && <p className="text-xs text-muted-foreground leading-relaxed -mt-0.5">{hint}</p>}
    {children}
  </div>
);

// ─── Wait time helpers ───────────────────────────────────────────
const getWaitTime = (createdAt: string) => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const getWaitColor = (createdAt: string) => {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins > 60) return "text-destructive bg-destructive/10";
  if (mins > 30) return "text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10";
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
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [labSearchTerm, setLabSearchTerm] = useState("");
  const [imagingSearchTerm, setImagingSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("encounter");
  const [vitalsExpanded, setVitalsExpanded] = useState(false);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [sentLabTestIds, setSentLabTestIds] = useState<string[]>([]);
  const [sentImagingIds, setSentImagingIds] = useState<string[]>([]);
  const [sendingLabOrders, setSendingLabOrders] = useState(false);
  const [sendingImagingOrders, setSendingImagingOrders] = useState(false);
  const [sentLabOrders, setSentLabOrders] = useState<SentLabOrder[]>([]);

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);

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
    medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "", route: "Oral",
  });
  const [diagnosisInput, setDiagnosisInput] = useState("");

  // ─── Completion metrics ───────────────────────────────────────
  const historyFieldCount = useMemo(() => {
    return [encounter.chiefComplaint, encounter.historyOfPresentIllness, encounter.pastMedicalHistory, encounter.pastSurgicalHistory, encounter.medicineHistory, encounter.socialHistory].filter(Boolean).length;
  }, [encounter]);

  const examFieldCount = useMemo(() => {
    return [encounter.subjective, encounter.physicalExamGeneral, encounter.physicalExamSystemic, encounter.objective].filter(Boolean).length;
  }, [encounter]);

  const assessPlanCount = useMemo(() => {
    return [encounter.assessment, encounter.plan, encounter.diagnosis.length > 0 ? "yes" : "", encounter.followUpDate].filter(Boolean).length;
  }, [encounter]);

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

  // ─── Cost estimate ────────────────────────────────────────────
  const costEstimate = useMemo(() => {
    const consultation = 500;
    const labs = selectedLabTests.reduce((sum, id) => {
      const test = labTests.find(t => t.id === id);
      return sum + (test?.price || 0);
    }, 0);
    const imaging = selectedImaging.reduce((sum, id) => {
      const item = imagingItems.find(i => i.id === id);
      return sum + (item?.price || 0);
    }, 0);
    return { consultation, labs, imaging, total: consultation + labs + imaging };
  }, [selectedLabTests, selectedImaging, labTests, imagingItems]);

  // ─── Next workflow stage ──────────────────────────────────────
  const nextStage = useMemo(() => {
    if (selectedLabTests.length > 0) return "Laboratory";
    if (selectedImaging.length > 0) return "Imaging";
    if (prescriptions.length > 0) return "Pharmacy";
    return "Billing";
  }, [selectedLabTests, selectedImaging, prescriptions]);

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
        .in("workflow_stage", ["waiting_for_doctor", "in_consult"])
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
        queryClient.invalidateQueries({ queryKey: ["station-queue", "waiting_for_doctor", "in_consult"] });
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
    setActiveEncounterId(null);
    setSentLabTestIds([]);
    setSentImagingIds([]);
    setSentLabOrders([]);
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
      } catch { /* ignore */ }
    }
    const resetEncounter = {
      chiefComplaint: "", historyOfPresentIllness: "", pastMedicalHistory: "", pastSurgicalHistory: "",
      medicineHistory: "", socialHistory: "", subjective: "", objective: "",
      physicalExamGeneral: "", physicalExamSystemic: "", assessment: "", plan: "",
      diagnosis: [] as string[], followUpDate: "",
    };
    setEncounter(resetEncounter);
    setPrescriptions([]);
    setSelectedLabTests([]);
    setSelectedImaging([]);
    setActiveTab("encounter");
  };

  // ─── Lab orders already sent for this visit (with live status) ─
  const fetchPatientLabOrders = useCallback(async () => {
    if (!activeEncounterId) { setSentLabOrders([]); return; }
    const { data } = await supabase
      .from("lab_orders")
      .select("id, status, created_at, received_at, sample_collected_at, processing_started_at, completed_at, result_entered_at, test:lab_tests_catalog(test_name)")
      .eq("encounter_id", activeEncounterId)
      .order("created_at", { ascending: true });
    setSentLabOrders((data as unknown as SentLabOrder[]) || []);
  }, [activeEncounterId]);

  useEffect(() => { fetchPatientLabOrders(); }, [fetchPatientLabOrders]);

  useEffect(() => {
    if (!activeEncounterId) return;
    const channel = supabase
      .channel(`consult-lab-orders-${activeEncounterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `encounter_id=eq.${activeEncounterId}` }, () => fetchPatientLabOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeEncounterId, fetchPatientLabOrders]);



  // ─── Auto-fill chief complaint from triage ────────────────────
  useEffect(() => {
    if (patientVitals.length > 0 && !encounter.chiefComplaint && selectedTicket) {
      const triageComplaint = patientVitals[0]?.presenting_complaint;
      if (triageComplaint) {
        setEncounter(prev => ({ ...prev, chiefComplaint: triageComplaint }));
        sonnerToast.info("Chief complaint auto-filled from triage");
      }
    }
  }, [patientVitals, selectedTicket]);

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
      setCurrentPrescription({ medication_name: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "", route: "Oral" });
      setDrugSearchTerm("");
      setShowPrescriptionDialog(false);
      sonnerToast.success("Prescription added");
    }
  };

  const removePrescription = (index: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  // ─── Shared helpers: staff record, department, encounter ──────
  const resolveStaffAndDept = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    let { data: staff } = await supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle();
    const { data: dept } = await supabase.from("departments").select("id").eq("name", "General Medicine").maybeSingle();

    // Self-provision a staff record if the clinician account isn't linked yet
    if (!staff?.id) {
      const { data: createdStaff, error: staffError } = await supabase
        .from("staff")
        .insert({
          user_id: user.id,
          staff_id: `STF-${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
          department_id: dept?.id ?? null,
        })
        .select("id")
        .single();
      if (staffError) throw new Error(`Your account is not linked to a staff record and it could not be created: ${staffError.message}`);
      staff = createdStaff;
    }

    if (!staff?.id) throw new Error("No staff record found for current user. Please contact admin.");
    if (!dept?.id) throw new Error("Department 'General Medicine' not found. Please contact admin.");
    return { staffId: staff.id, deptId: dept.id };
  };

  const buildEncounterPayload = () => {
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

    return {
      chief_complaint: encounter.chiefComplaint,
      subjective: fullSubjective,
      objective: fullObjective,
      assessment: encounter.assessment,
      plan: encounter.plan,
      diagnosis: encounter.diagnosis,
      follow_up_date: encounter.followUpDate || null,
    };
  };

  /** Returns the encounter id for the active visit, creating it (and the consultation charge) on first use. */
  const ensureEncounter = async (): Promise<string> => {
    if (activeEncounterId) {
      await supabase.from("encounters").update(buildEncounterPayload()).eq("id", activeEncounterId);
      return activeEncounterId;
    }

    const { staffId, deptId } = await resolveStaffAndDept();
    const { data: encounterData, error: encounterError } = await supabase
      .from("encounters")
      .insert({
        patient_id: selectedTicket!.patient!.id,
        ticket_id: selectedTicket!.id,
        doctor_id: staffId,
        department_id: deptId,
        ...buildEncounterPayload(),
      })
      .select("id")
      .single();

    if (encounterError) throw new Error(`The visit record could not be saved: ${encounterError.message}`);

    await supabase.from("service_charges").insert({
      patient_id: selectedTicket!.patient!.id,
      encounter_id: encounterData.id,
      ticket_id: selectedTicket!.id,
      service_type: "consultation",
      description: "Doctor Consultation",
      amount: 500,
      billing_stage: "consultation",
    });

    setActiveEncounterId(encounterData.id);
    return encounterData.id;
  };

  // ─── Send lab orders to the laboratory ────────────────────────
  const sendLabOrders = async (opts?: { encounterId?: string; moveTicket?: boolean; silent?: boolean }) => {
    if (!selectedTicket?.patient?.id) return;
    const pending = selectedLabTests.filter(id => !sentLabTestIds.includes(id));
    if (pending.length === 0) return;

    const { staffId } = await resolveStaffAndDept();
    const encounterId = opts?.encounterId ?? await ensureEncounter();

    const { error: labError } = await supabase.from("lab_orders").insert(
      pending.map((testId) => ({
        encounter_id: encounterId,
        patient_id: selectedTicket.patient!.id,
        doctor_id: staffId,
        test_id: testId,
        status: "pending",
      }))
    );
    if (labError) throw new Error(`Lab tests could not be sent to the laboratory: ${labError.message}`);

    for (const testId of pending) {
      const test = labTests.find(t => t.id === testId);
      if (test) {
        await supabase.from("service_charges").insert({
          patient_id: selectedTicket.patient!.id,
          encounter_id: encounterId,
          ticket_id: selectedTicket.id,
          service_type: "laboratory",
          description: `Lab: ${test.test_name}`,
          amount: test.price,
          billing_stage: "laboratory",
        });
      }
    }

    if (opts?.moveTicket !== false) {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ workflow_stage: "at_lab", status: "at_lab" })
        .eq("id", selectedTicket.id);
      if (ticketError) throw new Error(`Patient could not be moved to the laboratory: ${ticketError.message}`);
    }

    setSentLabTestIds(prev => [...prev, ...pending]);
    logAuditEvent({ action: "lab_orders_sent", module: "consultation", details: { encounter_id: encounterId, patient_id: selectedTicket.patient.id, count: pending.length } });
    if (!opts?.silent) {
      toast({ title: "Sent to Laboratory", description: `${pending.length} test(s) sent. The patient is now in the laboratory queue.` });
      fetchQueue();
      fetchPatientLabOrders();
    }
  };

  const sendImagingOrders = async (opts?: { encounterId?: string; moveTicket?: boolean; silent?: boolean }) => {
    if (!selectedTicket?.patient?.id) return;
    const pending = selectedImaging.filter(id => !sentImagingIds.includes(id));
    if (pending.length === 0) return;

    const { staffId } = await resolveStaffAndDept();
    const encounterId = opts?.encounterId ?? await ensureEncounter();

    const { error: imgError } = await supabase.from("imaging_orders").insert(
      pending.map((imagingId) => ({
        encounter_id: encounterId,
        patient_id: selectedTicket.patient!.id,
        imaging_id: imagingId,
        ordered_by: staffId,
        status: "pending",
        clinical_indication: encounter.chiefComplaint,
      }))
    );
    if (imgError) throw new Error(`Imaging requests could not be sent: ${imgError.message}`);

    for (const imagingId of pending) {
      const item = imagingItems.find(i => i.id === imagingId);
      if (item) {
        await supabase.from("service_charges").insert({
          patient_id: selectedTicket.patient!.id,
          encounter_id: encounterId,
          ticket_id: selectedTicket.id,
          service_type: "imaging",
          description: `Imaging: ${item.name}`,
          amount: item.price,
          billing_stage: "imaging",
        });
      }
    }

    if (opts?.moveTicket !== false) {
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ workflow_stage: "at_imaging", status: "at_imaging" })
        .eq("id", selectedTicket.id);
      if (ticketError) throw new Error(`Patient could not be moved to imaging: ${ticketError.message}`);
    }

    setSentImagingIds(prev => [...prev, ...pending]);
    logAuditEvent({ action: "imaging_orders_sent", module: "consultation", details: { encounter_id: encounterId, patient_id: selectedTicket.patient.id, count: pending.length } });
    if (!opts?.silent) {
      toast({ title: "Sent to Imaging", description: `${pending.length} request(s) sent to imaging.` });
      fetchQueue();
    }
  };

  const handleSendLabOrders = async () => {
    setSendingLabOrders(true);
    try {
      await sendLabOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send the lab tests. Please try again.";
      toast({ title: "Could not send to laboratory", description: message, variant: "destructive" });
    } finally {
      setSendingLabOrders(false);
    }
  };

  const handleSendImagingOrders = async () => {
    setSendingImagingOrders(true);
    try {
      await sendImagingOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send the imaging requests. Please try again.";
      toast({ title: "Could not send to imaging", description: message, variant: "destructive" });
    } finally {
      setSendingImagingOrders(false);
    }
  };

  const saveEncounter = async () => {
    if (!selectedTicket?.patient?.id) return;
    setSavingEncounter(true);
    try {
      const { staffId } = await resolveStaffAndDept();
      const encounterId = await ensureEncounter();

      if (prescriptions.length > 0) {
        const prescriptionRecords = prescriptions.map((p) => ({
          encounter_id: encounterId,
          patient_id: selectedTicket.patient!.id,
          doctor_id: staffId,
          medication_name: p.medication_name,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          instructions: p.instructions,
        }));
        const { error: rxError } = await supabase.from("prescriptions").insert(prescriptionRecords);
        if (rxError) throw new Error(`Prescriptions could not be saved: ${rxError.message}`);
      }

      // Send anything still unsent (already-sent orders are skipped)
      await sendLabOrders({ encounterId, moveTicket: false, silent: true });
      await sendImagingOrders({ encounterId, moveTicket: false, silent: true });

      type WorkflowStage = "at_billing" | "at_imaging" | "at_lab" | "at_pharmacy" | "checked_in" | "checked_out" | "in_consult" | "order_placed_imaging" | "order_placed_lab" | "triage" | "waiting_for_doctor";
      let nextWfStage: WorkflowStage = "at_billing";
      if (selectedLabTests.length > 0) nextWfStage = "at_lab";
      else if (selectedImaging.length > 0) nextWfStage = "at_imaging";
      else if (prescriptions.length > 0) nextWfStage = "at_pharmacy";

      const { error: ticketError } = await supabase.from("tickets").update({ workflow_stage: nextWfStage, status: nextWfStage }).eq("id", selectedTicket.id);
      if (ticketError) throw new Error(`Patient could not be moved to the next station: ${ticketError.message}`);
      localStorage.removeItem(`draft-encounter-${selectedTicket.id}`);

      toast({ title: "✅ Consultation Saved", description: `Patient moved to ${nextWfStage.replace(/_/g, " ")}.` });
      logAuditEvent({ action: "consultation_saved", module: "consultation", details: { encounter_id: encounterId, patient_id: selectedTicket.patient!.id, next_stage: nextWfStage, diagnosis: encounter.diagnosis } });
      setSelectedTicket(null);
      setShowConfirmSave(false);
      fetchQueue();
    } catch (error) {
      console.error("Error saving encounter:", error);
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || "Failed to save consultation. Please try again.";
      toast({ title: "Could not save consultation", description: message, variant: "destructive" });
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

  const filteredLabTests = useMemo(() => {
    if (!labSearchTerm) return labTests;
    const term = labSearchTerm.toLowerCase();
    return labTests.filter(t => t.test_name.toLowerCase().includes(term) || (t.category || "").toLowerCase().includes(term));
  }, [labTests, labSearchTerm]);

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

  // ─── Vitals strip component (for < XL screens) ───────────────
  const VitalsStrip = () => {
    if (!latestVitals) return null;
    return (
      <Collapsible open={vitalsExpanded} onOpenChange={setVitalsExpanded} className="xl:hidden border-b bg-muted/20">
        <CollapsibleTrigger className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-3 text-xs">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Vitals</span>
            <div className="flex items-center gap-2 text-muted-foreground">
              {latestVitals.blood_pressure_systolic && (
                <span className="bg-background px-1.5 py-0.5 rounded border text-[10px] font-medium">
                  BP {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic}
                </span>
              )}
              {latestVitals.pulse_rate && (
                <span className="bg-background px-1.5 py-0.5 rounded border text-[10px] font-medium">
                  HR {latestVitals.pulse_rate}
                </span>
              )}
              {latestVitals.temperature && (
                <span className="bg-background px-1.5 py-0.5 rounded border text-[10px] font-medium">
                  T {latestVitals.temperature}°C
                </span>
              )}
              {latestVitals.oxygen_saturation && (
                <span className="bg-background px-1.5 py-0.5 rounded border text-[10px] font-medium">
                  SpO₂ {latestVitals.oxygen_saturation}%
                </span>
              )}
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 grid grid-cols-3 md:grid-cols-6 gap-2">
            <VitalCard icon={Activity} label="Blood Pressure"
              value={latestVitals.blood_pressure_systolic ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` : null}
              unit="mmHg" status={getBPStatus(latestVitals.blood_pressure_systolic, latestVitals.blood_pressure_diastolic)} />
            <VitalCard icon={Heart} label="Pulse" value={latestVitals.pulse_rate} unit="bpm" status={getPulseStatus(latestVitals.pulse_rate)} />
            <VitalCard icon={Thermometer} label="Temp" value={latestVitals.temperature} unit="°C" status={getTempStatus(latestVitals.temperature)} />
            <VitalCard icon={Droplets} label="SpO₂" value={latestVitals.oxygen_saturation} unit="%" status={getSpO2Status(latestVitals.oxygen_saturation)} />
            <VitalCard icon={Wind} label="Resp Rate" value={latestVitals.respiratory_rate} unit="/min" />
            <VitalCard icon={Scale} label="Weight" value={latestVitals.weight} unit="kg" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* ── Left Panel: Patient Queue ── */}
        {queueCollapsed ? (
          <div className="w-12 border-r bg-card flex flex-col items-center py-3 gap-3 shrink-0 transition-all duration-200">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQueueCollapsed(false)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
              {queue.length}
            </Badge>
            <div className="flex-1 flex items-center">
              <span className="text-[10px] font-semibold text-muted-foreground tracking-wider" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>
                Consultation
              </span>
            </div>
            {isLive && <Radio className="h-3 w-3 text-[hsl(var(--success))] animate-pulse" />}
          </div>
        ) : (
        <div className="w-72 lg:w-80 border-r bg-card flex flex-col shrink-0 transition-all duration-200">
          <div className="p-4 border-b" style={{ background: "var(--gradient-subtle)" }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQueueCollapsed(true)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <h2 className="font-bold text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Consultation
                </h2>
              </div>
              {isLive && (
                <Badge variant="outline" className="gap-1 text-[hsl(var(--success))] border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[10px] px-2 py-0.5">
                  <Radio className="h-2 w-2 animate-pulse" /> Live
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {queue.filter(t => t.workflow_stage === "waiting_for_doctor").length} waiting · {queue.filter(t => t.workflow_stage === "in_consult").length} active
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {queue.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Stethoscope className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No patients in queue</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">Patients appear here after triage</p>
                </div>
              ) : (
                queue.map((ticket) => {
                  const isSelected = selectedTicket?.id === ticket.id;
                  const isInConsult = ticket.workflow_stage === "in_consult";
                  return (
                    <div
                      key={ticket.id}
                      className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? "bg-primary/5 border-primary/30 shadow-sm ring-1 ring-primary/15"
                          : "bg-background hover:bg-muted/50 border-transparent hover:border-border"
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
                              <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
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
        )}

        {/* ── Main Content Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="w-20 h-20 mx-auto rounded-full bg-primary/5 flex items-center justify-center">
                  <Stethoscope className="h-10 w-10 text-primary/20" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Select a Patient</p>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h1 className="text-base font-bold truncate">{selectedTicket.patient?.profile?.full_name}</h1>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-medium text-foreground">{selectedTicket.patient?.patient_id}</span>
                          <span className="text-border">·</span>
                          <span>{calcAge(selectedTicket.patient?.profile?.date_of_birth || null)}</span>
                          <span className="text-border">·</span>
                          <span className="capitalize">{selectedTicket.patient?.profile?.gender || "N/A"}</span>
                          {selectedTicket.patient?.blood_type && (
                            <>
                              <span className="text-border">·</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/20 bg-destructive/5">
                                <Droplets className="h-2.5 w-2.5 mr-0.5" />{selectedTicket.patient.blood_type}
                              </Badge>
                            </>
                          )}
                          {selectedTicket.patient?.profile?.phone && (
                            <>
                              <span className="text-border">·</span>
                              <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{selectedTicket.patient.profile.phone}</span>
                            </>
                          )}
                          {selectedTicket.patient?.insurance_provider && (
                            <>
                              <span className="text-border">·</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                <Shield className="h-2.5 w-2.5 mr-0.5" />{selectedTicket.patient.insurance_provider}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right mr-2 hidden md:flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Progress</span>
                        <Progress value={completionPct} className="w-20 h-1.5" />
                        <span className="text-[10px] font-bold">{completionPct}%</span>
                      </div>
                      {selectedTicket.patient?.id && (
                        <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient.id} />
                      )}
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowReferralForm(true)}>
                        <FileText className="h-3.5 w-3.5 mr-1" /> Referral
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedTicket(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <WorkflowTimeline
                    currentStage={selectedTicket.workflow_stage || selectedTicket.status}
                    visitPath={deriveVisitPath(selectedTicket.workflow_stage || selectedTicket.status, {
                      hasLabOrders: selectedLabTests.length > 0,
                      hasImagingOrders: selectedImaging.length > 0,
                      hasPrescriptions: prescriptions.length > 0,
                    })}
                  />

                  <PatientSummaryCard patientId={selectedTicket.patient.id} ticketId={selectedTicket.id} />

                  {/* Allergy banner */}
                  {selectedTicket.patient?.allergies && selectedTicket.patient.allergies.length > 0 && (
                    <div className="mt-2 px-3 py-1.5 bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0" />
                      <span className="text-[11px] font-semibold text-[hsl(var(--warning))]">Allergies:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedTicket.patient.allergies.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30 text-foreground">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Vitals Strip (< XL) ── */}
              <VitalsStrip />

              {/* ── Workspace ── */}
              <div className="flex-1 overflow-hidden flex">
                {/* Center: Tabs */}
                <div className="flex-1 overflow-auto">
                  <div className="p-4 lg:p-5">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                      <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
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
                      <TabsContent value="encounter" className="mt-0">
                        <Accordion type="multiple" defaultValue={["history", "examination", "assessment"]} className="space-y-3">
                          {/* Section 1: History */}
                          <SectionGroup value="history" icon={FileText} title="History" badge={historyFieldCount}>
                            <div className="space-y-4">
                              <Field label="Chief Complaint" hint="Primary reason for today's visit" required>
                                <Input
                                  value={encounter.chiefComplaint}
                                  onChange={(e) => setEncounter({ ...encounter, chiefComplaint: e.target.value })}
                                  placeholder='e.g., "Severe headache for 3 days"'
                                  className="h-12 text-base font-medium"
                                />
                                {latestVitals?.presenting_complaint && encounter.chiefComplaint === latestVitals.presenting_complaint && (
                                  <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                                    <Info className="h-3 w-3" /> Auto-filled from triage
                                  </p>
                                )}
                              </Field>

                              <Field label="History of Presenting Illness (HPI)" hint="SOCRATES: Site, Onset, Character, Radiation, Associations, Time course, Exacerbating/relieving, Severity">
                                <Textarea
                                  value={encounter.historyOfPresentIllness}
                                  onChange={(e) => setEncounter({ ...encounter, historyOfPresentIllness: e.target.value })}
                                  placeholder="Describe the onset, progression, and character of symptoms..."
                                  rows={4}
                                  className="text-base resize-y"
                                />
                              </Field>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Field label="Past Medical History" hint="Chronic conditions, hospitalizations">
                                  <Textarea
                                    value={encounter.pastMedicalHistory}
                                    onChange={(e) => setEncounter({ ...encounter, pastMedicalHistory: e.target.value })}
                                    placeholder="Known chronic diseases, past hospitalizations..."
                                    rows={3} className="text-base resize-y"
                                  />
                                </Field>
                                <Field label="Past Surgical History" hint="Previous operations, complications">
                                  <Textarea
                                    value={encounter.pastSurgicalHistory}
                                    onChange={(e) => setEncounter({ ...encounter, pastSurgicalHistory: e.target.value })}
                                    placeholder="Appendectomy (2019), Tonsillectomy..."
                                    rows={3} className="text-base resize-y"
                                  />
                                </Field>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Field label="Medication History" hint="Current medications, dosages, OTC drugs">
                                  <Textarea
                                    value={encounter.medicineHistory}
                                    onChange={(e) => setEncounter({ ...encounter, medicineHistory: e.target.value })}
                                    placeholder="Current medications and dosages..."
                                    rows={3} className="text-base resize-y"
                                  />
                                </Field>
                                <Field label="Social History" hint="Smoking, alcohol, occupation, exercise">
                                  <Textarea
                                    value={encounter.socialHistory}
                                    onChange={(e) => setEncounter({ ...encounter, socialHistory: e.target.value })}
                                    placeholder="Smoking status, alcohol use, occupation..."
                                    rows={3} className="text-base resize-y"
                                  />
                                </Field>
                              </div>
                            </div>
                          </SectionGroup>

                          {/* Section 2: Examination */}
                          <SectionGroup value="examination" icon={Eye} title="Examination" badge={examFieldCount}>
                            <div className="space-y-4">
                              <Field label="Subjective (S)" hint="Additional patient-reported info, review of systems">
                                <Textarea
                                  value={encounter.subjective}
                                  onChange={(e) => setEncounter({ ...encounter, subjective: e.target.value })}
                                  placeholder="Additional subjective findings, review of systems..."
                                  rows={3} className="text-base resize-y"
                                />
                              </Field>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Field label="General Examination" hint="Appearance, nutritional status, hydration, pallor">
                                  <Textarea
                                    value={encounter.physicalExamGeneral}
                                    onChange={(e) => setEncounter({ ...encounter, physicalExamGeneral: e.target.value })}
                                    placeholder="General appearance, nutritional status, hydration, pallor, jaundice, cyanosis..."
                                    rows={4} className="text-base resize-y"
                                  />
                                </Field>
                                <Field label="Systemic Examination" hint="CVS, RS, GIT, CNS findings">
                                  <Textarea
                                    value={encounter.physicalExamSystemic}
                                    onChange={(e) => setEncounter({ ...encounter, physicalExamSystemic: e.target.value })}
                                    placeholder="CVS: S1 S2 heard, no murmurs&#10;RS: Equal air entry, clear&#10;GIT: Soft, non-tender&#10;CNS: GCS 15/15"
                                    rows={4} className="text-base resize-y"
                                  />
                                </Field>
                              </div>

                              <Field label="Additional Objective Findings" hint="Special tests, investigations reviewed">
                                <Textarea
                                  value={encounter.objective}
                                  onChange={(e) => setEncounter({ ...encounter, objective: e.target.value })}
                                  placeholder="Additional objective findings, special tests..."
                                  rows={3} className="text-base resize-y"
                                />
                              </Field>
                            </div>
                          </SectionGroup>

                          {/* Section 3: Assessment & Plan */}
                          <SectionGroup value="assessment" icon={Brain} title="Assessment & Plan" badge={assessPlanCount}>
                            <div className="space-y-4">
                              <Field label="Assessment" hint="Clinical impression, working diagnosis, differentials — use ICD codes when possible">
                                <Textarea
                                  value={encounter.assessment}
                                  onChange={(e) => setEncounter({ ...encounter, assessment: e.target.value })}
                                  placeholder="Clinical impression and reasoning..."
                                  rows={3} className="text-base resize-y"
                                />
                              </Field>

                              <Field label="Diagnosis Tags">
                                <div className="flex gap-2">
                                  <Input
                                    value={diagnosisInput}
                                    onChange={(e) => setDiagnosisInput(e.target.value)}
                                    placeholder="e.g., J06.9 — Upper respiratory infection"
                                    className="h-12 text-base"
                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDiagnosis())}
                                  />
                                  <Button type="button" variant="outline" size="sm" onClick={addDiagnosis} disabled={!diagnosisInput.trim()}>
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                  </Button>
                                </div>
                                {encounter.diagnosis.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {encounter.diagnosis.map((d, i) => (
                                      <Badge key={i} variant="secondary" className="gap-1 text-xs py-1 px-2.5">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                                        {d}
                                        <X className="h-3 w-3 cursor-pointer hover:text-destructive transition-colors ml-1" onClick={() => removeDiagnosis(i)} />
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </Field>

                              <Field label="Plan" hint="Treatment plan, medications, investigations, follow-up, patient education">
                                <Textarea
                                  value={encounter.plan}
                                  onChange={(e) => setEncounter({ ...encounter, plan: e.target.value })}
                                  placeholder="1. Investigations: CBC, RBS&#10;2. Treatment: Amoxicillin 500mg TDS × 7 days&#10;3. Follow-up in 2 weeks"
                                  rows={5} className="text-base resize-y"
                                />
                              </Field>

                              <Field label="Follow-up / TCA" hint="When should the patient return?">
                                <Input
                                  type="date"
                                  value={encounter.followUpDate}
                                  onChange={(e) => setEncounter({ ...encounter, followUpDate: e.target.value })}
                                  className="h-12 text-base max-w-xs"
                                />
                              </Field>
                            </div>
                          </SectionGroup>
                        </Accordion>
                      </TabsContent>

                      {/* ── Orders Tab ── */}
                      <TabsContent value="orders" className="space-y-4 mt-0">
                        {/* Cost Estimate Card */}
                        <Card className="border-primary/20 bg-primary/5">
                          <CardContent className="px-4 py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold">Estimated Cost</span>
                              </div>
                              <span className="text-base font-bold text-primary">KES {costEstimate.total.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                              <span>Consultation: KES {costEstimate.consultation}</span>
                              {costEstimate.labs > 0 && <span>Labs: KES {costEstimate.labs.toLocaleString()}</span>}
                              {costEstimate.imaging > 0 && <span>Imaging: KES {costEstimate.imaging.toLocaleString()}</span>}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Prescriptions */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-4">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"><Pill className="h-4 w-4" /></div>
                                Prescriptions
                                {prescriptions.length > 0 && <Badge variant="secondary" className="text-[10px]">{prescriptions.length}</Badge>}
                              </CardTitle>
                              <Button size="sm" onClick={() => setShowPrescriptionDialog(true)} className="h-7 text-xs">
                                <Plus className="h-3 w-3 mr-1" /> Add Medication
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            {prescriptions.length === 0 ? (
                              <div className="text-center py-6 text-muted-foreground">
                                <Pill className="h-8 w-8 mx-auto mb-2 opacity-15" />
                                <p className="text-xs">No medications prescribed yet</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {prescriptions.map((p, i) => (
                                  <div key={i} className="flex items-center justify-between p-2.5 bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 rounded-lg">
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm">{p.medication_name}</p>
                                      <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {p.route} · {p.dosage} · {p.frequency} · {p.duration} · Qty: {p.quantity}
                                      </p>
                                      {p.instructions && <p className="text-[11px] text-muted-foreground italic mt-0.5">{p.instructions}</p>}
                                    </div>
                                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0 h-7 w-7 p-0" onClick={() => removePrescription(i)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Lab Tests */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700"><TestTube className="h-4 w-4" /></div>
                              Laboratory
                              {selectedLabTests.length > 0 && <Badge variant="secondary" className="text-[10px]">{selectedLabTests.length}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4 space-y-3">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input value={labSearchTerm} onChange={(e) => setLabSearchTerm(e.target.value)} placeholder="Search lab tests..." className="pl-8 h-8 text-xs" />
                            </div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-52 overflow-auto">
                              {filteredLabTests.map((test) => {
                                const selected = selectedLabTests.includes(test.id);
                                const alreadySent = sentLabTestIds.includes(test.id);
                                return (
                                  <div
                                    key={test.id}
                                    className={`p-2 border rounded-lg transition-all text-sm ${alreadySent ? "cursor-default bg-green-50 border-green-300" : "cursor-pointer"} ${
                                      selected && !alreadySent ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200" : !alreadySent ? "hover:bg-muted/50 hover:border-border" : ""
                                    }`}
                                    onClick={() => {
                                      if (alreadySent) return;
                                      if (selected) setSelectedLabTests(selectedLabTests.filter(t => t !== test.id));
                                      else setSelectedLabTests([...selectedLabTests, test.id]);
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <p className="font-medium text-xs leading-tight">{test.test_name}</p>
                                      {(selected || alreadySent) && <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${alreadySent ? "text-green-600" : "text-blue-600"}`} />}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {alreadySent ? "Sent to lab" : `KES ${test.price}`}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Send to Laboratory */}
                            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-xs text-muted-foreground">
                                  {unsentLabTestCount > 0
                                    ? `${unsentLabTestCount} test(s) ready to send · KES ${unsentLabTestTotal}`
                                    : "Select tests above, then send them to the laboratory."}
                                </p>
                                <Button
                                  size="sm"
                                  className="h-10 px-4"
                                  disabled={unsentLabTestCount === 0 || sendingLabOrders}
                                  onClick={handleSendLabOrders}
                                >
                                  <TestTube className="h-4 w-4 mr-1.5" />
                                  {sendingLabOrders
                                    ? "Sending..."
                                    : `Send ${unsentLabTestCount > 0 ? `${unsentLabTestCount} test(s) ` : ""}to Laboratory`}
                                </Button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Sending moves the patient to the laboratory queue. You can keep writing your notes afterwards.
                              </p>
                            </div>

                            {/* Status of orders already sent */}
                            {sentLabOrders.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Lab order progress
                                </p>
                                {sentLabOrders.map((order) => (
                                  <div key={order.id} className="rounded-lg border p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-medium">{order.test?.test_name || "Lab test"}</p>
                                      <Badge variant="secondary" className="text-[10px]">{labOrderStatusLabel(order.status)}</Badge>
                                    </div>
                                    <LabOrderTimeline order={order} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Imaging */}
                        <Card className="border-border/60">
                          <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700"><Camera className="h-4 w-4" /></div>
                              Imaging
                              {selectedImaging.length > 0 && <Badge variant="secondary" className="text-[10px]">{selectedImaging.length}</Badge>}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4 space-y-3">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input value={imagingSearchTerm} onChange={(e) => setImagingSearchTerm(e.target.value)} placeholder="Search imaging..." className="pl-8 h-8 text-xs" />
                            </div>
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-52 overflow-auto">
                              {filteredImaging.map((item) => {
                                const selected = selectedImaging.includes(item.id);
                                return (
                                  <div
                                    key={item.id}
                                    className={`p-2 border rounded-lg cursor-pointer transition-all text-sm ${
                                      selected ? "bg-purple-50 border-purple-300 ring-1 ring-purple-200" : "hover:bg-muted/50 hover:border-border"
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
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.modality} · KES {item.price}</p>
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
                          <CardHeader className="px-4 pt-4 pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <History className="h-4 w-4 text-muted-foreground" /> Previous Encounters
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            {patientHistory.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <FileText className="h-8 w-8 mx-auto mb-2 opacity-15" />
                                <p className="text-xs">No previous encounters on record</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {patientHistory.map((enc) => (
                                  <div key={enc.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between mb-1">
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

                {/* ── Right Panel: Vitals (XL only) ── */}
                <div className="w-64 border-l bg-muted/10 overflow-auto shrink-0 hidden xl:block">
                  <div className="p-3 space-y-4">
                    <div>
                      <h3 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2.5">
                        <Activity className="h-3 w-3" /> Latest Vitals
                      </h3>
                      {latestVitals ? (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <VitalCard icon={Activity} label="BP"
                              value={latestVitals.blood_pressure_systolic ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` : null}
                              unit="mmHg" status={getBPStatus(latestVitals.blood_pressure_systolic, latestVitals.blood_pressure_diastolic)} />
                            <VitalCard icon={Heart} label="Pulse" value={latestVitals.pulse_rate} unit="bpm" status={getPulseStatus(latestVitals.pulse_rate)} />
                            <VitalCard icon={Thermometer} label="Temp" value={latestVitals.temperature} unit="°C" status={getTempStatus(latestVitals.temperature)} />
                            <VitalCard icon={Droplets} label="SpO₂" value={latestVitals.oxygen_saturation} unit="%" status={getSpO2Status(latestVitals.oxygen_saturation)} />
                            <VitalCard icon={Wind} label="RR" value={latestVitals.respiratory_rate} unit="/min" />
                            <VitalCard icon={Scale} label="Weight" value={latestVitals.weight} unit="kg" />
                          </div>
                          {latestVitals.height && latestVitals.bmi && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <VitalCard icon={Ruler} label="Height" value={latestVitals.height} unit="cm" />
                              <VitalCard icon={Scale} label="BMI" value={latestVitals.bmi} />
                            </div>
                          )}
                          <p className="text-[9px] text-muted-foreground text-center mt-1">
                            {new Date(latestVitals.recorded_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <Activity className="h-6 w-6 mx-auto mb-1 opacity-15" />
                          <p className="text-[11px]">No vitals recorded</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                        <Heart className="h-3 w-3" /> Chronic Conditions
                      </h3>
                      {selectedTicket.patient?.chronic_conditions && selectedTicket.patient.chronic_conditions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedTicket.patient.chronic_conditions.map((c, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-destructive/5 border-destructive/20 text-destructive">{c}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">None recorded</p>
                      )}
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Order Summary</h3>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Prescriptions</span>
                          <span className="font-semibold">{prescriptions.length}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Lab Tests</span>
                          <span className="font-semibold">{selectedLabTests.length}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Imaging</span>
                          <span className="font-semibold">{selectedImaging.length}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-[11px] font-bold">
                          <span>Est. Cost</span>
                          <span className="text-primary">KES {costEstimate.total.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Footer: Save Bar ── */}
              <div className="border-t bg-card shadow-[0_-1px_4px_rgba(0,0,0,0.03)] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Pill className="h-3 w-3" />{prescriptions.length} Rx</span>
                  <span className="flex items-center gap-1"><TestTube className="h-3 w-3" />{selectedLabTests.length} Labs</span>
                  <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{selectedImaging.length} Img</span>
                  <Separator orientation="vertical" className="h-3" />
                  <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                    <Save className="h-2.5 w-2.5" /> Draft auto-saved
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedTicket(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs min-w-[140px]"
                    onClick={() => setShowConfirmSave(true)}
                    disabled={!encounter.chiefComplaint || savingEncounter}
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" /> Complete & Save
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Save Confirmation Dialog ── */}
        <AlertDialog open={showConfirmSave} onOpenChange={setShowConfirmSave}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Confirm Consultation
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>Review the summary before saving:</p>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Patient</span>
                      <span className="font-medium">{selectedTicket?.patient?.profile?.full_name}</span>
                    </div>
                    {encounter.diagnosis.length > 0 && (
                      <div className="flex justify-between text-xs items-start">
                        <span className="text-muted-foreground">Diagnosis</span>
                        <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                          {encounter.diagnosis.map((d, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{d}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Prescriptions</span>
                      <span className="font-medium">{prescriptions.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Lab Orders</span>
                      <span className="font-medium">{selectedLabTests.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Imaging Orders</span>
                      <span className="font-medium">{selectedImaging.length}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Est. Total</span>
                      <span className="font-bold text-primary">KES {costEstimate.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">Next Station</span>
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <ArrowRight className="h-2.5 w-2.5" /> {nextStage}
                      </Badge>
                    </div>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs">Go Back</AlertDialogCancel>
              <AlertDialogAction onClick={saveEncounter} disabled={savingEncounter} className="text-xs">
                {savingEncounter ? (
                  <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-foreground mr-2" /> Saving...</>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm & Send</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Prescription Dialog ── */}
        <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <div className="p-1.5 rounded-lg bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"><Pill className="h-4 w-4" /></div>
                Add Prescription
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Medication Name" required>
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={drugSearchTerm}
                    onChange={(e) => {
                      setDrugSearchTerm(e.target.value);
                      setCurrentPrescription({ ...currentPrescription, medication_name: e.target.value });
                    }}
                    placeholder="Search pharmacy inventory..."
                    className="pl-10 h-12 text-base"
                  />
                </div>
                {(() => {
                  const searchLower = drugSearchTerm.toLowerCase();
                  const matchedItems = drugSearchTerm
                    ? pharmacyInventory.filter(item =>
                        item.drug_name.toLowerCase().includes(searchLower) ||
                        (item.generic_name || "").toLowerCase().includes(searchLower)
                      )
                    : [];
                  const selectedFullName = currentPrescription.medication_name;
                  const isExactMatch = selectedFullName && matchedItems.some(item => {
                    const fn = item.strength_size ? `${item.drug_name} ${item.strength_size}` : item.drug_name;
                    return fn === selectedFullName;
                  });
                  const showDropdown = drugSearchTerm.length >= 1 && !isExactMatch;

                  return showDropdown ? (
                    <div className="border rounded-lg max-h-40 overflow-auto shadow-sm bg-popover">
                      {matchedItems.length > 0 ? matchedItems.slice(0, 10).map(item => {
                        const fullName = item.strength_size ? `${item.drug_name} ${item.strength_size}` : item.drug_name;
                        return (
                          <div
                            key={item.id}
                            className="p-2.5 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm transition-colors"
                            onClick={() => {
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
                        );
                      }) : (
                        <p className="p-3 text-xs text-muted-foreground text-center">No matching drugs in inventory</p>
                      )}
                    </div>
                  ) : null;
                })()}
                {currentPrescription.medication_name && (
                  <p className="text-[11px] text-[hsl(var(--success))] flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {currentPrescription.medication_name}</p>
                )}
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Route">
                  <Select value={currentPrescription.route} onValueChange={(v) => setCurrentPrescription({ ...currentPrescription, route: v })}>
                    <SelectTrigger className="text-sm h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Oral", "IV", "IM", "SC", "Topical", "Rectal", "Sublingual", "Inhaled", "Nasal", "Ophthalmic", "Otic"].map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Dosage" required>
                  <Input value={currentPrescription.dosage} onChange={(e) => setCurrentPrescription({ ...currentPrescription, dosage: e.target.value })} placeholder="e.g., 1 tablet" className="text-sm h-11" />
                </Field>
                <Field label="Frequency">
                  <Select value={currentPrescription.frequency} onValueChange={(v) => setCurrentPrescription({ ...currentPrescription, frequency: v })}>
                    <SelectTrigger className="text-sm h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["Once daily", "Twice daily", "Three times daily", "Four times daily", "Every 4 hours", "Every 6 hours", "Every 8 hours", "As needed", "At bedtime", "STAT"].map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration" hint="Click for quick fill">
                  <Input value={currentPrescription.duration} onChange={(e) => setCurrentPrescription({ ...currentPrescription, duration: e.target.value })} placeholder="e.g., 7 days" className="text-sm h-11" />
                  <div className="flex gap-1 mt-1.5">
                    {["3 days", "5 days", "7 days", "14 days", "30 days"].map(d => (
                      <Button
                        key={d}
                        type="button"
                        variant={currentPrescription.duration === d ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs px-2.5"
                        onClick={() => setCurrentPrescription({ ...currentPrescription, duration: d })}
                      >
                        {d.replace(" days", "d")}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field label="Quantity">
                  <Input type="number" value={currentPrescription.quantity} onChange={(e) => setCurrentPrescription({ ...currentPrescription, quantity: parseInt(e.target.value) || 1 })} min="1" className="text-sm h-11" />
                </Field>
              </div>

              <Field label="Special Instructions">
                <Textarea value={currentPrescription.instructions} onChange={(e) => setCurrentPrescription({ ...currentPrescription, instructions: e.target.value })} placeholder="e.g., Take with food, avoid dairy" rows={3} className="text-base" />
              </Field>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowPrescriptionDialog(false)}>Cancel</Button>
                <Button size="sm" className="text-xs" onClick={addPrescription} disabled={!currentPrescription.medication_name || !currentPrescription.dosage}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Prescription
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Referral Form (controlled) */}
        {selectedTicket?.patient && (
          <ReferralForm
            open={showReferralForm}
            onOpenChange={setShowReferralForm}
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
