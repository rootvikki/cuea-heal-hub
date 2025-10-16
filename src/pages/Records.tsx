import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus } from "lucide-react";

const Records = () => {
  const { toast } = useToast();
  const [encounters, setEncounters] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "",
    departmentId: "",
    chiefComplaint: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });

  useEffect(() => {
    fetchEncounters();
    fetchPatients();
    fetchDepartments();
  }, []);

  const fetchEncounters = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("encounters")
      .select("*")
      .order("encounter_date", { ascending: false })
      .limit(20);

    if (data) {
      const encountersWithDetails = await Promise.all(
        data.map(async (enc) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", enc.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient?.user_id)
            .single();

          const { data: dept } = await supabase
            .from("departments")
            .select("name")
            .eq("id", enc.department_id)
            .single();

          return {
            ...enc,
            patient: { ...patient, profile },
            department: dept,
          };
        })
      );
      setEncounters(encountersWithDetails);
    }
    setLoading(false);
  };

  const fetchPatients = async () => {
    const { data } = await supabase.from("patients").select("id, patient_id, user_id");
    if (data) {
      const patientsWithProfiles = await Promise.all(
        data.map(async (patient) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient.user_id)
            .single();
          return { ...patient, profile };
        })
      );
      setPatients(patientsWithProfiles);
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("*");
    setDepartments(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get staff record for current user
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!staff) {
      toast({
        title: "Error",
        description: "You must be registered as a doctor to create encounters",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.from("encounters").insert({
      patient_id: formData.patientId,
      department_id: formData.departmentId,
      doctor_id: staff.id,
      chief_complaint: formData.chiefComplaint,
      subjective: formData.subjective,
      objective: formData.objective,
      assessment: formData.assessment,
      plan: formData.plan,
    });

    if (error) {
      toast({
        title: "Error creating encounter",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Encounter created",
        description: "Clinical record saved successfully",
      });
      setDialogOpen(false);
      setFormData({
        patientId: "",
        departmentId: "",
        chiefComplaint: "",
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
      });
      fetchEncounters();
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Medical Records (EMR)</h1>
          <p className="text-muted-foreground mt-1">
            Electronic health records and clinical notes
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Encounter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Clinical Encounter (SOAP Notes)</DialogTitle>
              <DialogDescription>Record patient consultation details</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select
                    value={formData.patientId}
                    onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.patient_id} - {patient.profile?.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Chief Complaint</Label>
                <Input
                  value={formData.chiefComplaint}
                  onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                  placeholder="What brings the patient in today?"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Subjective (S)</Label>
                <Textarea
                  value={formData.subjective}
                  onChange={(e) => setFormData({ ...formData, subjective: e.target.value })}
                  placeholder="Patient's symptoms, history, concerns..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Objective (O)</Label>
                <Textarea
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                  placeholder="Physical exam findings, test results..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Assessment (A)</Label>
                <Textarea
                  value={formData.assessment}
                  onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                  placeholder="Diagnosis, clinical impression..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Plan (P)</Label>
                <Textarea
                  value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                  placeholder="Treatment plan, prescriptions, follow-up..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Encounter</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Encounters
          </CardTitle>
          <CardDescription>Latest clinical consultations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading records...</p>
          ) : encounters.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No encounters recorded yet</p>
          ) : (
            <div className="space-y-4">
              {encounters.map((enc) => (
                <div key={enc.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {enc.patient?.profile?.full_name} ({enc.patient?.patient_id})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {enc.department?.name} •{" "}
                        {new Date(enc.encounter_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><strong>Chief Complaint:</strong> {enc.chief_complaint}</p>
                    {enc.subjective && <p><strong>S:</strong> {enc.subjective}</p>}
                    {enc.objective && <p><strong>O:</strong> {enc.objective}</p>}
                    {enc.assessment && <p><strong>A:</strong> {enc.assessment}</p>}
                    {enc.plan && <p><strong>P:</strong> {enc.plan}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Records;
