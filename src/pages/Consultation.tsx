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
import { Activity, FileText, Pill, FlaskConical, DollarSign, Save, Send, Loader2, User, Calendar, AlertCircle } from "lucide-react";
import { encounterSchema, prescriptionSchema } from "@/lib/validationSchemas";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    
    // Validate SOAP notes
    try {
      encounterSchema.parse({ subjective, objective, assessment, plan });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.issues[0].message,
          variant: "destructive",
        });
        return;
      }
    }
    
    // Validate prescriptions if any
    if (prescriptions.length > 0) {
      for (const presc of prescriptions) {
        try {
          prescriptionSchema.parse(presc);
        } catch (error) {
          if (error instanceof z.ZodError) {
            toast({
              title: "Prescription Validation Error",
              description: `${presc.medication}: ${error.issues[0].message}`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }
    
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

    toast({ 
      title: "Success", 
      description: "Consultation completed successfully. Patient moved to next stage.",
      duration: 5000
    });
    
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
                  {(!subjective || subjective.length < 10) && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Subjective notes are required (minimum 10 characters)
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Consultation Summary</CardTitle>
                      <CardDescription>Review before completing</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="font-medium">SOAP Notes</p>
                        <p className="text-sm text-muted-foreground">
                          {subjective && subjective.length >= 10
                            ? "✓ Complete"
                            : "✗ Incomplete - Subjective notes required"}
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
                        disabled={saving || !subjective || subjective.length < 10}
                        className="w-full"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving consultation...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Complete Consultation & Move Patient
                          </>
                        )}
                      </Button>
                      {(!subjective || subjective.length < 10) && (
                        <p className="text-sm text-destructive text-center">
                          Please complete subjective notes to proceed
                        </p>
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
