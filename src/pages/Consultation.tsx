import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, FileText, Pill, FlaskConical, DollarSign, Save, Send, Loader2, User, Calendar } from "lucide-react";

interface Ticket {
  id: string;
  ticket_number: string;
  patient_id: string;
  department_id: string;
  workflow_stage: string;
  priority: number;
  checked_in_at: string;
  patient: {
    patient_id: string;
    user_id: string;
  };
  profiles: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
  };
  vitals: Array<{
    temperature: number;
    blood_pressure_systolic: number;
    blood_pressure_diastolic: number;
    pulse_rate: number;
    respiratory_rate: number;
    oxygen_saturation: number;
    weight: number;
    height: number;
    recorded_at: string;
  }>;
  patients: {
    allergies: string[];
    chronic_conditions: string[];
  };
}

interface LabTest {
  id: string;
  test_name: string;
  price: number;
}

interface Medication {
  id: string;
  drug_name: string;
  generic_name: string;
  unit_price: number;
  quantity: number;
}

export default function Consultation() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  
  // SOAP Notes
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  
  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<Array<{
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    instructions: string;
  }>>([]);
  
  // Lab Orders
  const [selectedLabTests, setSelectedLabTests] = useState<string[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchMyQueue();
    fetchLabTests();
    fetchMedications();
  }, []);

  const fetchMyQueue = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("tickets")
      .select(`
        *,
        patient:patients!inner (
          patient_id,
          user_id,
          allergies,
          chronic_conditions
        ),
        profiles:patients!inner (
          profiles:user_id (
            full_name,
            date_of_birth,
            gender,
            phone
          )
        ),
        vitals:vitals (
          temperature,
          blood_pressure_systolic,
          blood_pressure_diastolic,
          pulse_rate,
          respiratory_rate,
          oxygen_saturation,
          weight,
          height,
          recorded_at
        )
      `)
      .eq("assigned_to", user.id)
      .in("workflow_stage", ["waiting_for_doctor", "with_doctor"])
      .order("priority", { ascending: false })
      .order("checked_in_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const transformedData = (data as any[]).map(ticket => ({
        ...ticket,
        profiles: ticket.profiles?.[0]?.profiles,
        patients: ticket.patient[0]
      }));
      setTickets(transformedData);
    }
    setLoading(false);
  };

  const fetchLabTests = async () => {
    const { data } = await supabase
      .from("lab_tests_catalog")
      .select("id, test_name, price")
      .order("test_name");
    setLabTests((data as LabTest[]) || []);
  };

  const fetchMedications = async () => {
    const { data } = await supabase
      .from("pharmacy_inventory")
      .select("id, drug_name, generic_name, unit_price, quantity")
      .gt("quantity", 0)
      .order("drug_name");
    setMedications((data as Medication[]) || []);
  };

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    // Move to "with_doctor" stage
    supabase
      .from("tickets")
      .update({ workflow_stage: "with_doctor" })
      .eq("id", ticket.id)
      .then(() => fetchMyQueue());
  };

  const addPrescription = () => {
    setPrescriptions([
      ...prescriptions,
      { medication: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" }
    ]);
  };

  const updatePrescription = (index: number, field: string, value: any) => {
    const updated = [...prescriptions];
    updated[index] = { ...updated[index], [field]: value };
    setPrescriptions(updated);
  };

  const removePrescription = (index: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  const handleSaveEncounter = async () => {
    if (!selectedTicket) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Create encounter
    const { data: encounter, error: encounterError } = await supabase
      .from("encounters")
      .insert({
        patient_id: selectedTicket.patient_id,
        doctor_id: user.id,
        department_id: selectedTicket.department_id,
        ticket_id: selectedTicket.id,
        subjective,
        objective,
        assessment,
        plan
      })
      .select()
      .single();

    if (encounterError) {
      toast({ title: "Error saving encounter", description: encounterError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Save prescriptions
    if (prescriptions.length > 0) {
      const prescriptionData = prescriptions
        .filter(p => p.medication)
        .map(p => ({
          patient_id: selectedTicket.patient_id,
          encounter_id: encounter.id,
          doctor_id: user.id,
          medication_name: p.medication,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          instructions: p.instructions
        }));

      const { error: prescError } = await supabase
        .from("prescriptions")
        .insert(prescriptionData);

      if (prescError) {
        toast({ title: "Error saving prescriptions", description: prescError.message, variant: "destructive" });
      }
    }

    // Save lab orders
    if (selectedLabTests.length > 0) {
      const labOrderData = selectedLabTests.map(testId => ({
        patient_id: selectedTicket.patient_id,
        encounter_id: encounter.id,
        doctor_id: user.id,
        test_id: testId,
        status: "pending"
      }));

      const { error: labError } = await supabase
        .from("lab_orders")
        .insert(labOrderData);

      if (labError) {
        toast({ title: "Error saving lab orders", description: labError.message, variant: "destructive" });
      }
    }

    // Determine next workflow stage
    let nextStage = "waiting_for_billing";
    if (prescriptions.length > 0) {
      nextStage = "at_pharmacy";
    } else if (selectedLabTests.length > 0) {
      nextStage = "at_lab";
    }

    // Update ticket workflow
    await supabase
      .from("tickets")
      .update({ workflow_stage: nextStage })
      .eq("id", selectedTicket.id);

    // Note: Invoice will be auto-generated when ticket reaches billing

    toast({ title: "Success", description: "Consultation completed successfully" });
    
    // Reset form
    setSelectedTicket(null);
    setSubjective("");
    setObjective("");
    setAssessment("");
    setPlan("");
    setPrescriptions([]);
    setSelectedLabTests([]);
    setSaving(false);
    fetchMyQueue();
  };

  const latestVitals = selectedTicket?.vitals?.[0];

  return (
    <div className="container mx-auto py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Queue */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>My Queue</CardTitle>
            <CardDescription>{tickets.length} patients waiting</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No patients in queue</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <Card
                      key={ticket.id}
                      className={`cursor-pointer hover:bg-accent transition-colors ${
                        selectedTicket?.id === ticket.id ? "border-primary" : ""
                      }`}
                      onClick={() => handleSelectTicket(ticket)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold">{ticket.profiles?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{ticket.ticket_number}</p>
                          </div>
                          <Badge variant={ticket.priority === 3 ? "destructive" : ticket.priority === 2 ? "default" : "secondary"}>
                            {ticket.priority === 3 ? "Emergency" : ticket.priority === 2 ? "High" : "Normal"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Checked in: {new Date(ticket.checked_in_at).toLocaleTimeString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Consultation Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consultation</CardTitle>
            <CardDescription>
              {selectedTicket
                ? `${selectedTicket.profiles?.full_name} - ${selectedTicket.ticket_number}`
                : "Select a patient from the queue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedTicket ? (
              <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                <p>Select a patient to begin consultation</p>
              </div>
            ) : (
              <Tabs defaultValue="patient-info" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="patient-info">Patient Info</TabsTrigger>
                  <TabsTrigger value="soap">SOAP Notes</TabsTrigger>
                  <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
                  <TabsTrigger value="lab">Lab Tests</TabsTrigger>
                  <TabsTrigger value="complete">Complete</TabsTrigger>
                </TabsList>

                <TabsContent value="patient-info" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Patient Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium">Name</p>
                          <p className="text-sm text-muted-foreground">{selectedTicket.profiles?.full_name}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Gender</p>
                          <p className="text-sm text-muted-foreground">{selectedTicket.profiles?.gender || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Date of Birth</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedTicket.profiles?.date_of_birth 
                              ? new Date(selectedTicket.profiles.date_of_birth).toLocaleDateString()
                              : "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Phone</p>
                          <p className="text-sm text-muted-foreground">{selectedTicket.profiles?.phone || "N/A"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {latestVitals && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Latest Vitals</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm font-medium">Temperature</p>
                            <p className="text-sm">{latestVitals.temperature}°C</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">BP</p>
                            <p className="text-sm">{latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Pulse</p>
                            <p className="text-sm">{latestVitals.pulse_rate} bpm</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">O2 Sat</p>
                            <p className="text-sm">{latestVitals.oxygen_saturation}%</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Weight</p>
                            <p className="text-sm">{latestVitals.weight} kg</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">Height</p>
                            <p className="text-sm">{latestVitals.height} cm</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Medical History</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">Allergies</p>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {selectedTicket.patients?.allergies?.length > 0 ? (
                            selectedTicket.patients.allergies.map((allergy, i) => (
                              <Badge key={i} variant="destructive">{allergy}</Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No known allergies</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Chronic Conditions</p>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {selectedTicket.patients?.chronic_conditions?.length > 0 ? (
                            selectedTicket.patients.chronic_conditions.map((condition, i) => (
                              <Badge key={i} variant="outline">{condition}</Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No chronic conditions</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="soap" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subjective</Label>
                    <Textarea
                      placeholder="Chief complaint, patient's description of symptoms..."
                      value={subjective}
                      onChange={(e) => setSubjective(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Objective</Label>
                    <Textarea
                      placeholder="Physical examination findings, vital signs observations..."
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assessment</Label>
                    <Textarea
                      placeholder="Diagnosis, differential diagnosis..."
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <Textarea
                      placeholder="Treatment plan, follow-up instructions..."
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      rows={4}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="prescriptions" className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Prescriptions</h3>
                    <Button onClick={addPrescription} size="sm">
                      <Pill className="h-4 w-4 mr-2" />
                      Add Medication
                    </Button>
                  </div>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {prescriptions.map((presc, index) => (
                        <Card key={index}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between">
                              <Label>Medication {index + 1}</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removePrescription(index)}
                              >
                                Remove
                              </Button>
                            </div>
                            <Select
                              value={presc.medication}
                              onValueChange={(value) => updatePrescription(index, "medication", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select medication" />
                              </SelectTrigger>
                              <SelectContent>
                                {medications.map((med) => (
                                  <SelectItem key={med.id} value={med.drug_name}>
                                    {med.drug_name} ({med.generic_name}) - Stock: {med.quantity}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label>Dosage</Label>
                                <Input
                                  value={presc.dosage}
                                  onChange={(e) => updatePrescription(index, "dosage", e.target.value)}
                                  placeholder="e.g., 500mg"
                                />
                              </div>
                              <div>
                                <Label>Frequency</Label>
                                <Input
                                  value={presc.frequency}
                                  onChange={(e) => updatePrescription(index, "frequency", e.target.value)}
                                  placeholder="e.g., Twice daily"
                                />
                              </div>
                              <div>
                                <Label>Duration</Label>
                                <Input
                                  value={presc.duration}
                                  onChange={(e) => updatePrescription(index, "duration", e.target.value)}
                                  placeholder="e.g., 7 days"
                                />
                              </div>
                              <div>
                                <Label>Quantity</Label>
                                <Input
                                  type="number"
                                  value={presc.quantity}
                                  onChange={(e) => updatePrescription(index, "quantity", parseInt(e.target.value))}
                                />
                              </div>
                            </div>
                            <div>
                              <Label>Instructions</Label>
                              <Textarea
                                value={presc.instructions}
                                onChange={(e) => updatePrescription(index, "instructions", e.target.value)}
                                placeholder="Special instructions..."
                                rows={2}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {prescriptions.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                          No prescriptions added yet
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="lab" className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3">Order Lab Tests</h3>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2">
                        {labTests.map((test) => (
                          <Card
                            key={test.id}
                            className={`cursor-pointer hover:bg-accent transition-colors ${
                              selectedLabTests.includes(test.id) ? "border-primary bg-accent" : ""
                            }`}
                            onClick={() => {
                              setSelectedLabTests(prev =>
                                prev.includes(test.id)
                                  ? prev.filter(id => id !== test.id)
                                  : [...prev, test.id]
                              );
                            }}
                          >
                            <CardContent className="p-4">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-medium">{test.test_name}</p>
                                  <p className="text-sm text-muted-foreground">KES {test.price}</p>
                                </div>
                                {selectedLabTests.includes(test.id) && (
                                  <Badge>Selected</Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="complete" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Consultation Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="font-medium">SOAP Notes</p>
                        <p className="text-sm text-muted-foreground">
                          {subjective || objective || assessment || plan
                            ? "Complete"
                            : "Not filled"}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Prescriptions</p>
                        <p className="text-sm text-muted-foreground">
                          {prescriptions.length} medication(s)
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Lab Tests</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedLabTests.length} test(s) ordered
                        </p>
                      </div>
                      <Separator />
                      <Button
                        onClick={handleSaveEncounter}
                        disabled={saving || !subjective}
                        className="w-full"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Complete Consultation
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
