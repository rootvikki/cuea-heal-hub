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
import { Save, Loader2, Pill } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Ticket {
  id: string;
  ticket_number: string;
  patient_id: string;
  department_id: string;
  workflow_stage: string;
  priority: number;
  checked_in_at: string;
  patient: Array<{
    patient_id: string;
    user_id: string;
    allergies?: string[];
    chronic_conditions?: string[];
  }>;
  profiles: Array<{
    profiles: {
      full_name: string;
      date_of_birth?: string;
      gender?: string;
      phone?: string;
    };
  }>;
  vitals?: Array<{
    temperature?: number;
    blood_pressure_systolic?: number;
    blood_pressure_diastolic?: number;
    pulse_rate?: number;
    oxygen_saturation?: number;
    weight?: number;
    height?: number;
  }>;
}

export default function Consultation() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
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
        patient:patients!inner (patient_id, user_id, allergies, chronic_conditions),
        profiles:patients!inner (profiles:user_id (full_name, date_of_birth, gender, phone)),
        vitals:vitals (temperature, blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, oxygen_saturation, weight, height)
      `)
      .eq("assigned_to", user.id)
      .in("workflow_stage", ["waiting_for_doctor", "with_doctor"])
      .order("priority", { ascending: false });

    if (!error && data) {
      setTickets(data);
    }
    setLoading(false);
  };

  const fetchLabTests = async () => {
    const { data } = await supabase.from("lab_tests_catalog").select("*").order("test_name");
    setLabTests(data || []);
  };

  const fetchMedications = async () => {
    const { data } = await supabase.from("pharmacy_inventory").select("*").gt("quantity", 0);
    setMedications(data || []);
  };

  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    supabase.from("tickets").update({ workflow_stage: "with_doctor" }).eq("id", ticket.id).then(() => fetchMyQueue());
  };

  const handleSaveEncounter = async () => {
    if (!selectedTicket || !subjective) {
      toast({ title: "Error", description: "Please fill in subjective notes", variant: "destructive" });
      return;
    }
    
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: encounter, error } = await supabase
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

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Save prescriptions
    if (prescriptions.length > 0) {
      await supabase.from("prescriptions").insert(
        prescriptions.filter(p => p.medication).map(p => ({
          patient_id: selectedTicket.patient_id,
          encounter_id: encounter.id,
          doctor_id: user.id,
          medication_name: p.medication,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          instructions: p.instructions
        }))
      );
    }

    // Save lab orders
    if (selectedLabTests.length > 0) {
      await supabase.from("lab_orders").insert(
        selectedLabTests.map(testId => ({
          patient_id: selectedTicket.patient_id,
          encounter_id: encounter.id,
          doctor_id: user.id,
          test_id: testId,
          status: "pending"
        }))
      );
    }

    const nextStage = prescriptions.length > 0 ? "at_pharmacy" : selectedLabTests.length > 0 ? "at_lab" : "waiting_for_billing";
    await supabase.from("tickets").update({ workflow_stage: nextStage }).eq("id", selectedTicket.id);

    toast({ title: "Success", description: "Consultation completed successfully" });
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

  const profile = selectedTicket?.profiles?.[0]?.profiles;
  const patient = selectedTicket?.patient?.[0];
  const vitals = selectedTicket?.vitals?.[0];

  return (
    <div className="container mx-auto py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>My Queue</CardTitle>
            <CardDescription>{tickets.length} patients waiting</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : tickets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No patients in queue</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <Card
                      key={ticket.id}
                      className={`cursor-pointer hover:bg-accent ${selectedTicket?.id === ticket.id ? "border-primary" : ""}`}
                      onClick={() => handleSelectTicket(ticket)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between mb-2">
                          <div>
                            <p className="font-semibold">{ticket.profiles?.[0]?.profiles?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{ticket.ticket_number}</p>
                          </div>
                          <Badge variant={ticket.priority === 3 ? "destructive" : "default"}>
                            {ticket.priority === 3 ? "Emergency" : ticket.priority === 2 ? "High" : "Normal"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consultation</CardTitle>
            <CardDescription>
              {selectedTicket ? `${profile?.full_name} - ${selectedTicket.ticket_number}` : "Select a patient"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedTicket ? (
              <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                <p>Select a patient to begin consultation</p>
              </div>
            ) : (
              <Tabs defaultValue="info">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="info">Patient Info</TabsTrigger>
                  <TabsTrigger value="soap">SOAP Notes</TabsTrigger>
                  <TabsTrigger value="orders">Prescriptions</TabsTrigger>
                  <TabsTrigger value="complete">Complete</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle className="text-lg">Patient Details</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div><p className="text-sm font-medium">Name</p><p className="text-sm text-muted-foreground">{profile?.full_name}</p></div>
                        <div><p className="text-sm font-medium">Gender</p><p className="text-sm text-muted-foreground">{profile?.gender || "N/A"}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                  {vitals && (
                    <Card>
                      <CardHeader><CardTitle className="text-lg">Latest Vitals</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                          {vitals.temperature && <div><p className="text-sm font-medium">Temp</p><p>{vitals.temperature}°C</p></div>}
                          {vitals.blood_pressure_systolic && <div><p className="text-sm font-medium">BP</p><p>{vitals.blood_pressure_systolic}/{vitals.blood_pressure_diastolic}</p></div>}
                          {vitals.pulse_rate && <div><p className="text-sm font-medium">Pulse</p><p>{vitals.pulse_rate} bpm</p></div>}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="soap" className="space-y-4">
                  <div><Label>Subjective *</Label><Textarea value={subjective} onChange={(e) => setSubjective(e.target.value)} rows={3} /></div>
                  <div><Label>Objective</Label><Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} /></div>
                  <div><Label>Assessment</Label><Textarea value={assessment} onChange={(e) => setAssessment(e.target.value)} rows={3} /></div>
                  <div><Label>Plan</Label><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} /></div>
                </TabsContent>

                <TabsContent value="orders" className="space-y-4">
                  <div className="flex justify-between"><h3 className="font-semibold">Prescriptions</h3>
                    <Button onClick={() => setPrescriptions([...prescriptions, { medication: "", dosage: "", frequency: "", duration: "", quantity: 1, instructions: "" }])} size="sm"><Pill className="h-4 w-4 mr-2" />Add</Button>
                  </div>
                  {prescriptions.map((p, i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-2">
                        <Select value={p.medication} onValueChange={(v) => {const u = [...prescriptions]; u[i].medication = v; setPrescriptions(u);}}>
                          <SelectTrigger><SelectValue placeholder="Select medication" /></SelectTrigger>
                          <SelectContent>{medications.map(m => <SelectItem key={m.id} value={m.drug_name}>{m.drug_name}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Dosage" value={p.dosage} onChange={(e) => {const u = [...prescriptions]; u[i].dosage = e.target.value; setPrescriptions(u);}} />
                          <Input placeholder="Frequency" value={p.frequency} onChange={(e) => {const u = [...prescriptions]; u[i].frequency = e.target.value; setPrescriptions(u);}} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="complete">
                  {!subjective && <Alert variant="destructive"><AlertDescription>Subjective notes required</AlertDescription></Alert>}
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <div><p className="font-medium">SOAP Notes</p><p className="text-sm text-muted-foreground">{subjective ? "✓ Complete" : "✗ Incomplete"}</p></div>
                      <div><p className="font-medium">Prescriptions</p><p className="text-sm text-muted-foreground">{prescriptions.length} item(s)</p></div>
                      <Separator />
                      <Button onClick={handleSaveEncounter} disabled={saving || !subjective} className="w-full">
                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Complete Consultation</>}
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
