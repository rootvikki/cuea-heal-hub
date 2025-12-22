import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { 
  Stethoscope, User, AlertTriangle, Activity, Pill, TestTube, 
  Camera, FileText, Clock, Plus, X, Calendar, Phone, Heart, Radio
} from "lucide-react";

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
  recorded_at: string;
}

interface LabTest {
  id: string;
  test_name: string;
  test_code: string;
  price: number;
  normal_range: string;
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

const Consultation = () => {
  const { toast } = useToast();
  const [queue, setQueue] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [patientVitals, setPatientVitals] = useState<Vital[]>([]);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [imagingItems, setImagingItems] = useState<ImagingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEncounter, setSavingEncounter] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Encounter form state
  const [encounter, setEncounter] = useState({
    chiefComplaint: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    diagnosis: [] as string[],
    followUpDate: "",
  });

  // Orders state
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedLabTests, setSelectedLabTests] = useState<string[]>([]);
  const [selectedImaging, setSelectedImaging] = useState<string[]>([]);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [currentPrescription, setCurrentPrescription] = useState<Prescription>({
    medication_name: "",
    dosage: "",
    frequency: "",
    duration: "",
    quantity: 1,
    instructions: "",
  });

  // Diagnosis input
  const [diagnosisInput, setDiagnosisInput] = useState("");

  useEffect(() => {
    fetchQueue();
    fetchLabTests();
    fetchImagingCatalog();

    // Subscribe to realtime queue updates
    const channel = supabase
      .channel("consultation-queue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        (payload) => {
          console.log("Consultation queue update:", payload);
          
          if (payload.eventType === "UPDATE" && payload.new) {
            const newTicket = payload.new as any;
            if (newTicket.workflow_stage === "waiting_for_doctor") {
              sonnerToast.info("New patient ready for consultation");
            }
          }
          
          fetchQueue();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedTicket?.patient?.id) {
      fetchPatientVitals(selectedTicket.patient.id);
      fetchPatientHistory(selectedTicket.patient.id);
    }
  }, [selectedTicket]);

  const fetchQueue = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get tickets that are ready for doctor consultation
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .in("workflow_stage", ["waiting_for_doctor", "in_consult", "triage"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch patient details for each ticket
      const ticketsWithPatients = await Promise.all(
        (data || []).map(async (ticket) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("*")
            .eq("id", ticket.patient_id)
            .single();

          let profile = null;
          if (patient) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, phone, date_of_birth, gender")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          return {
            ...ticket,
            patient: patient ? { ...patient, profile } : null,
          };
        })
      );

      setQueue(ticketsWithPatients);
    } catch (error) {
      console.error("Error fetching queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientVitals = async (patientId: string) => {
    const { data } = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false })
      .limit(5);

    setPatientVitals(data || []);
  };

  const fetchPatientHistory = async (patientId: string) => {
    const { data } = await supabase
      .from("encounters")
      .select("*")
      .eq("patient_id", patientId)
      .order("encounter_date", { ascending: false })
      .limit(10);

    setPatientHistory(data || []);
  };

  const fetchLabTests = async () => {
    const { data } = await supabase
      .from("lab_tests_catalog")
      .select("*")
      .order("test_name");
    setLabTests(data || []);
  };

  const fetchImagingCatalog = async () => {
    const { data } = await supabase
      .from("imaging_catalog")
      .select("*")
      .eq("active", true)
      .order("modality");
    setImagingItems(data || []);
  };

  const startConsultation = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    
    // Update ticket status to in_consult
    await supabase
      .from("tickets")
      .update({ workflow_stage: "in_consult" as const })
      .eq("id", ticket.id);

    // Reset forms
    setEncounter({
      chiefComplaint: "",
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      diagnosis: [],
      followUpDate: "",
    });
    setPrescriptions([]);
    setSelectedLabTests([]);
    setSelectedImaging([]);

    fetchQueue();
  };

  const addDiagnosis = () => {
    if (diagnosisInput.trim() && !encounter.diagnosis.includes(diagnosisInput.trim())) {
      setEncounter({
        ...encounter,
        diagnosis: [...encounter.diagnosis, diagnosisInput.trim()],
      });
      setDiagnosisInput("");
    }
  };

  const removeDiagnosis = (index: number) => {
    setEncounter({
      ...encounter,
      diagnosis: encounter.diagnosis.filter((_, i) => i !== index),
    });
  };

  const addPrescription = () => {
    if (currentPrescription.medication_name && currentPrescription.dosage) {
      setPrescriptions([...prescriptions, currentPrescription]);
      setCurrentPrescription({
        medication_name: "",
        dosage: "",
        frequency: "",
        duration: "",
        quantity: 1,
        instructions: "",
      });
      setShowPrescriptionDialog(false);
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

      // Get department from ticket or use General
      const { data: dept } = await supabase
        .from("departments")
        .select("id")
        .eq("name", "General")
        .single();

      // Create encounter
      const { data: encounterData, error: encounterError } = await supabase
        .from("encounters")
        .insert({
          patient_id: selectedTicket.patient.id,
          ticket_id: selectedTicket.id,
          doctor_id: user.id,
          department_id: dept?.id,
          chief_complaint: encounter.chiefComplaint,
          subjective: encounter.subjective,
          objective: encounter.objective,
          assessment: encounter.assessment,
          plan: encounter.plan,
          diagnosis: encounter.diagnosis,
          follow_up_date: encounter.followUpDate || null,
        })
        .select()
        .single();

      if (encounterError) throw encounterError;

      // Create prescriptions
      if (prescriptions.length > 0) {
        const prescriptionRecords = prescriptions.map((p) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          doctor_id: user.id,
          medication_name: p.medication_name,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          instructions: p.instructions,
        }));

        const { error: prescError } = await supabase
          .from("prescriptions")
          .insert(prescriptionRecords);

        if (prescError) console.error("Error creating prescriptions:", prescError);
      }

      // Create lab orders
      if (selectedLabTests.length > 0) {
        const labOrders = selectedLabTests.map((testId) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          doctor_id: user.id,
          test_id: testId,
          status: "pending",
        }));

        const { error: labError } = await supabase
          .from("lab_orders")
          .insert(labOrders);

        if (labError) console.error("Error creating lab orders:", labError);
      }

      // Create imaging orders
      if (selectedImaging.length > 0) {
        const imagingOrders = selectedImaging.map((imagingId) => ({
          encounter_id: encounterData.id,
          patient_id: selectedTicket.patient!.id,
          imaging_id: imagingId,
          ordered_by: user.id,
          status: "pending",
          clinical_indication: encounter.chiefComplaint,
        }));

        const { error: imagingError } = await supabase
          .from("imaging_orders")
          .insert(imagingOrders);

        if (imagingError) console.error("Error creating imaging orders:", imagingError);
      }

      // Determine next workflow stage based on orders
      type WorkflowStage = "at_billing" | "at_imaging" | "at_lab" | "at_pharmacy" | "checked_in" | "checked_out" | "in_consult" | "order_placed_imaging" | "order_placed_lab" | "triage" | "waiting_for_doctor";
      
      let nextStage: WorkflowStage = "at_billing";
      if (selectedLabTests.length > 0) {
        nextStage = "at_lab";
      } else if (selectedImaging.length > 0) {
        nextStage = "at_imaging";
      } else if (prescriptions.length > 0) {
        nextStage = "at_pharmacy";
      }

      // Update ticket status
      await supabase
        .from("tickets")
        .update({ workflow_stage: nextStage })
        .eq("id", selectedTicket.id);

      toast({
        title: "Consultation Saved",
        description: `Encounter recorded. Patient moved to ${nextStage.replace("_", " ")}.`,
      });

      setSelectedTicket(null);
      fetchQueue();
    } catch (error) {
      console.error("Error saving encounter:", error);
      toast({
        title: "Error",
        description: "Failed to save consultation",
        variant: "destructive",
      });
    } finally {
      setSavingEncounter(false);
    }
  };

  const latestVitals = patientVitals[0];

  const calculateAge = (dob: string | null) => {
    if (!dob) return "N/A";
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} years`;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Panel - Patient Queue */}
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              My Queue
            </h2>
            {isLive && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600 text-xs">
                <Radio className="h-2 w-2 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{queue.length} patients waiting</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {queue.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No patients in queue</p>
            ) : (
              queue.map((ticket) => (
                <div
                  key={ticket.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTicket?.id === ticket.id
                      ? "bg-primary/10 border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                  onClick={() => startConsultation(ticket)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">
                        {ticket.patient?.profile?.full_name || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.ticket_number} • {ticket.patient?.patient_id}
                      </p>
                    </div>
                    <Badge
                      variant={ticket.priority > 1 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {ticket.priority > 1 ? "Urgent" : "Normal"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {ticket.workflow_stage.replace(/_/g, " ")}
                    </Badge>
                    {ticket.patient?.allergies && ticket.patient.allergies.length > 0 && (
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTicket ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Stethoscope className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select a patient to begin consultation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Patient Header */}
            <div className="p-4 border-b bg-background">
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">
                      {selectedTicket.patient?.profile?.full_name}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{selectedTicket.patient?.patient_id}</span>
                      <span>•</span>
                      <span>{calculateAge(selectedTicket.patient?.profile?.date_of_birth || null)}</span>
                      <span>•</span>
                      <span className="capitalize">{selectedTicket.patient?.profile?.gender || "N/A"}</span>
                      {selectedTicket.patient?.blood_type && (
                        <>
                          <span>•</span>
                          <span className="font-medium text-red-600">
                            Blood: {selectedTicket.patient.blood_type}
                          </span>
                        </>
                      )}
                    </div>
                    {selectedTicket.patient?.profile?.phone && (
                      <div className="flex items-center gap-1 text-sm mt-1">
                        <Phone className="h-3 w-3" />
                        {selectedTicket.patient.profile.phone}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>

              {/* Allergies Warning */}
              {selectedTicket.patient?.allergies && selectedTicket.patient.allergies.length > 0 && (
                <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Allergies:</span>
                    <span>{selectedTicket.patient.allergies.join(", ")}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Main Workspace */}
            <div className="flex-1 overflow-hidden flex">
              {/* Left - SOAP Notes & Orders */}
              <div className="flex-1 overflow-auto p-4">
                <Tabs defaultValue="encounter" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="encounter">SOAP Notes</TabsTrigger>
                    <TabsTrigger value="orders">
                      Orders ({prescriptions.length + selectedLabTests.length + selectedImaging.length})
                    </TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="encounter" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Chief Complaint *</Label>
                      <Input
                        value={encounter.chiefComplaint}
                        onChange={(e) => setEncounter({ ...encounter, chiefComplaint: e.target.value })}
                        placeholder="What brings the patient in today?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Subjective (S)</Label>
                      <Textarea
                        value={encounter.subjective}
                        onChange={(e) => setEncounter({ ...encounter, subjective: e.target.value })}
                        placeholder="Patient's symptoms, history, concerns..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Objective (O)</Label>
                      <Textarea
                        value={encounter.objective}
                        onChange={(e) => setEncounter({ ...encounter, objective: e.target.value })}
                        placeholder="Physical exam findings, observations..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Assessment (A) / Diagnosis</Label>
                      <Textarea
                        value={encounter.assessment}
                        onChange={(e) => setEncounter({ ...encounter, assessment: e.target.value })}
                        placeholder="Clinical impression, differential diagnosis..."
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Input
                          value={diagnosisInput}
                          onChange={(e) => setDiagnosisInput(e.target.value)}
                          placeholder="Add diagnosis (e.g., J06.9 - Upper respiratory infection)"
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDiagnosis())}
                        />
                        <Button type="button" variant="outline" onClick={addDiagnosis}>
                          Add
                        </Button>
                      </div>
                      {encounter.diagnosis.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {encounter.diagnosis.map((d, i) => (
                            <Badge key={i} variant="secondary" className="gap-1">
                              {d}
                              <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => removeDiagnosis(i)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Plan (P)</Label>
                      <Textarea
                        value={encounter.plan}
                        onChange={(e) => setEncounter({ ...encounter, plan: e.target.value })}
                        placeholder="Treatment plan, medications, follow-up..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Follow-up Date</Label>
                      <Input
                        type="date"
                        value={encounter.followUpDate}
                        onChange={(e) => setEncounter({ ...encounter, followUpDate: e.target.value })}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="orders" className="space-y-4">
                    {/* Prescriptions */}
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Pill className="h-4 w-4" />
                            Prescriptions ({prescriptions.length})
                          </CardTitle>
                          <Button size="sm" onClick={() => setShowPrescriptionDialog(true)}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {prescriptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No prescriptions added</p>
                        ) : (
                          <div className="space-y-2">
                            {prescriptions.map((p, i) => (
                              <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                                <div>
                                  <p className="font-medium text-sm">{p.medication_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {p.dosage} • {p.frequency} • {p.duration} • Qty: {p.quantity}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removePrescription(i)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Lab Tests */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TestTube className="h-4 w-4" />
                          Lab Tests ({selectedLabTests.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                          {labTests.map((test) => (
                            <div
                              key={test.id}
                              className={`p-2 border rounded cursor-pointer transition-colors text-sm ${
                                selectedLabTests.includes(test.id)
                                  ? "bg-primary/10 border-primary"
                                  : "hover:bg-muted"
                              }`}
                              onClick={() => {
                                if (selectedLabTests.includes(test.id)) {
                                  setSelectedLabTests(selectedLabTests.filter((t) => t !== test.id));
                                } else {
                                  setSelectedLabTests([...selectedLabTests, test.id]);
                                }
                              }}
                            >
                              <p className="font-medium">{test.test_name}</p>
                              <p className="text-xs text-muted-foreground">KES {test.price}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Imaging */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Imaging ({selectedImaging.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                          {imagingItems.map((item) => (
                            <div
                              key={item.id}
                              className={`p-2 border rounded cursor-pointer transition-colors text-sm ${
                                selectedImaging.includes(item.id)
                                  ? "bg-primary/10 border-primary"
                                  : "hover:bg-muted"
                              }`}
                              onClick={() => {
                                if (selectedImaging.includes(item.id)) {
                                  setSelectedImaging(selectedImaging.filter((i) => i !== item.id));
                                } else {
                                  setSelectedImaging([...selectedImaging, item.id]);
                                }
                              }}
                            >
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.modality} • KES {item.price}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="history">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Previous Encounters</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {patientHistory.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No previous encounters</p>
                        ) : (
                          <div className="space-y-3">
                            {patientHistory.map((enc) => (
                              <div key={enc.id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium">
                                    {new Date(enc.encounter_date).toLocaleDateString()}
                                  </span>
                                  {enc.diagnosis && enc.diagnosis.length > 0 && (
                                    <Badge variant="outline">{enc.diagnosis[0]}</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{enc.chief_complaint}</p>
                                {enc.plan && (
                                  <p className="text-sm mt-1">
                                    <strong>Plan:</strong> {enc.plan}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right - Vitals & Quick Info */}
              <div className="w-72 border-l bg-muted/20 p-4 overflow-auto">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Latest Vitals
                </h3>
                {latestVitals ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">BP</p>
                        <p className="font-semibold">
                          {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic}
                        </p>
                      </div>
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">Pulse</p>
                        <p className="font-semibold">{latestVitals.pulse_rate} bpm</p>
                      </div>
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">Temp</p>
                        <p className="font-semibold">{latestVitals.temperature}°C</p>
                      </div>
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">SpO2</p>
                        <p className="font-semibold">{latestVitals.oxygen_saturation}%</p>
                      </div>
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">RR</p>
                        <p className="font-semibold">{latestVitals.respiratory_rate}/min</p>
                      </div>
                      <div className="p-2 bg-background rounded border">
                        <p className="text-xs text-muted-foreground">Weight</p>
                        <p className="font-semibold">{latestVitals.weight} kg</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recorded: {new Date(latestVitals.recorded_at).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No vitals recorded</p>
                )}

                <Separator className="my-4" />

                {/* Chronic Conditions */}
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Chronic Conditions
                </h3>
                {selectedTicket.patient?.chronic_conditions &&
                selectedTicket.patient.chronic_conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedTicket.patient.chronic_conditions.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {c}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None recorded</p>
                )}

                <Separator className="my-4" />

                {/* Insurance */}
                <h3 className="font-semibold mb-2">Insurance</h3>
                <p className="text-sm">
                  {selectedTicket.patient?.insurance_provider || "Self-pay / Cash"}
                </p>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t bg-background flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {prescriptions.length} prescriptions, {selectedLabTests.length} lab tests,{" "}
                {selectedImaging.length} imaging orders
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={saveEncounter}
                  disabled={!encounter.chiefComplaint || savingEncounter}
                >
                  {savingEncounter ? "Saving..." : "Complete & Save"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Prescription Dialog */}
      <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Prescription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Medication Name *</Label>
              <Input
                value={currentPrescription.medication_name}
                onChange={(e) =>
                  setCurrentPrescription({ ...currentPrescription, medication_name: e.target.value })
                }
                placeholder="e.g., Amoxicillin 500mg"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dosage *</Label>
                <Input
                  value={currentPrescription.dosage}
                  onChange={(e) =>
                    setCurrentPrescription({ ...currentPrescription, dosage: e.target.value })
                  }
                  placeholder="e.g., 1 tablet"
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={currentPrescription.frequency}
                  onValueChange={(value) =>
                    setCurrentPrescription({ ...currentPrescription, frequency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Once daily">Once daily</SelectItem>
                    <SelectItem value="Twice daily">Twice daily</SelectItem>
                    <SelectItem value="Three times daily">Three times daily</SelectItem>
                    <SelectItem value="Four times daily">Four times daily</SelectItem>
                    <SelectItem value="Every 4 hours">Every 4 hours</SelectItem>
                    <SelectItem value="Every 6 hours">Every 6 hours</SelectItem>
                    <SelectItem value="Every 8 hours">Every 8 hours</SelectItem>
                    <SelectItem value="As needed">As needed (PRN)</SelectItem>
                    <SelectItem value="At bedtime">At bedtime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  value={currentPrescription.duration}
                  onChange={(e) =>
                    setCurrentPrescription({ ...currentPrescription, duration: e.target.value })
                  }
                  placeholder="e.g., 7 days"
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={currentPrescription.quantity}
                  onChange={(e) =>
                    setCurrentPrescription({
                      ...currentPrescription,
                      quantity: parseInt(e.target.value) || 1,
                    })
                  }
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={currentPrescription.instructions}
                onChange={(e) =>
                  setCurrentPrescription({ ...currentPrescription, instructions: e.target.value })
                }
                placeholder="e.g., Take with food, Avoid alcohol"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPrescriptionDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={addPrescription}
                disabled={!currentPrescription.medication_name || !currentPrescription.dosage}
              >
                Add Prescription
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Consultation;
