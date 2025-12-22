import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { Activity, Plus } from "lucide-react";

const Vitals = () => {
  const { toast } = useToast();
  const { getActiveTicket, onVitalsRecorded } = useQueueTransition();
  const [vitals, setVitals] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "",
    temperature: "",
    bpSystolic: "",
    bpDiastolic: "",
    pulseRate: "",
    respiratoryRate: "",
    oxygenSaturation: "",
    weight: "",
    height: "",
  });

  useEffect(() => {
    fetchVitals();
    fetchPatients();
  }, []);

  const fetchVitals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vitals")
      .select("*")
      .order("recorded_at", { ascending: false })
      .limit(20);

    if (data) {
      const vitalsWithPatients = await Promise.all(
        data.map(async (vital) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", vital.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient?.user_id)
            .single();

          return { ...vital, patient: { ...patient, profile } };
        })
      );
      setVitals(vitalsWithPatients);
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

  const calculateBMI = (weight: number, height: number) => {
    if (!weight || !height) return null;
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .single();

    const weight = parseFloat(formData.weight);
    const height = parseFloat(formData.height);
    const bmi = weight && height ? parseFloat(calculateBMI(weight, height) || "0") : null;

    const { error } = await supabase.from("vitals").insert({
      patient_id: formData.patientId,
      recorded_by: staff?.id,
      temperature: formData.temperature ? parseFloat(formData.temperature) : null,
      blood_pressure_systolic: formData.bpSystolic ? parseInt(formData.bpSystolic) : null,
      blood_pressure_diastolic: formData.bpDiastolic ? parseInt(formData.bpDiastolic) : null,
      pulse_rate: formData.pulseRate ? parseInt(formData.pulseRate) : null,
      respiratory_rate: formData.respiratoryRate ? parseInt(formData.respiratoryRate) : null,
      oxygen_saturation: formData.oxygenSaturation ? parseFloat(formData.oxygenSaturation) : null,
      weight,
      height,
      bmi,
    });

    if (error) {
      toast({
        title: "Error recording vitals",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Vitals recorded",
        description: "Patient vitals saved successfully",
      });

      // Auto-transition: Move patient to waiting for doctor
      const ticket = await getActiveTicket(formData.patientId);
      if (ticket && (ticket.status === "checked_in" || ticket.status === "triage")) {
        await onVitalsRecorded({ ticketId: ticket.id });
      }

      setDialogOpen(false);
      setFormData({
        patientId: "",
        temperature: "",
        bpSystolic: "",
        bpDiastolic: "",
        pulseRate: "",
        respiratoryRate: "",
        oxygenSaturation: "",
        weight: "",
        height: "",
      });
      fetchVitals();
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Patient Vitals</h1>
          <p className="text-muted-foreground mt-1">
            Record and track patient vital signs
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Record Vitals
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record Patient Vitals</DialogTitle>
              <DialogDescription>Enter vital signs measurements</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Temperature (°C)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                    placeholder="36.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Blood Pressure (mmHg)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={formData.bpSystolic}
                      onChange={(e) => setFormData({ ...formData, bpSystolic: e.target.value })}
                      placeholder="120"
                    />
                    <span className="self-center">/</span>
                    <Input
                      type="number"
                      value={formData.bpDiastolic}
                      onChange={(e) => setFormData({ ...formData, bpDiastolic: e.target.value })}
                      placeholder="80"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pulse Rate (bpm)</Label>
                  <Input
                    type="number"
                    value={formData.pulseRate}
                    onChange={(e) => setFormData({ ...formData, pulseRate: e.target.value })}
                    placeholder="72"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Respiratory Rate (breaths/min)</Label>
                  <Input
                    type="number"
                    value={formData.respiratoryRate}
                    onChange={(e) => setFormData({ ...formData, respiratoryRate: e.target.value })}
                    placeholder="16"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>O₂ Saturation (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.oxygenSaturation}
                    onChange={(e) => setFormData({ ...formData, oxygenSaturation: e.target.value })}
                    placeholder="98"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    placeholder="70"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Height (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                    placeholder="170"
                  />
                </div>
              </div>

              {formData.weight && formData.height && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Calculated BMI:</strong>{" "}
                    {calculateBMI(parseFloat(formData.weight), parseFloat(formData.height))}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Vitals</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Vitals
          </CardTitle>
          <CardDescription>Latest vital signs recorded</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading vitals...</p>
          ) : vitals.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No vitals recorded yet</p>
          ) : (
            <div className="space-y-3">
              {vitals.map((vital) => (
                <div key={vital.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">
                        {vital.patient?.profile?.full_name} ({vital.patient?.patient_id})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(vital.recorded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {vital.temperature && (
                      <div>
                        <p className="text-muted-foreground">Temp</p>
                        <p className="font-medium">{vital.temperature}°C</p>
                      </div>
                    )}
                    {vital.blood_pressure_systolic && (
                      <div>
                        <p className="text-muted-foreground">BP</p>
                        <p className="font-medium">
                          {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic}
                        </p>
                      </div>
                    )}
                    {vital.pulse_rate && (
                      <div>
                        <p className="text-muted-foreground">Pulse</p>
                        <p className="font-medium">{vital.pulse_rate} bpm</p>
                      </div>
                    )}
                    {vital.oxygen_saturation && (
                      <div>
                        <p className="text-muted-foreground">SpO₂</p>
                        <p className="font-medium">{vital.oxygen_saturation}%</p>
                      </div>
                    )}
                    {vital.weight && (
                      <div>
                        <p className="text-muted-foreground">Weight</p>
                        <p className="font-medium">{vital.weight} kg</p>
                      </div>
                    )}
                    {vital.height && (
                      <div>
                        <p className="text-muted-foreground">Height</p>
                        <p className="font-medium">{vital.height} cm</p>
                      </div>
                    )}
                    {vital.bmi && (
                      <div>
                        <p className="text-muted-foreground">BMI</p>
                        <p className="font-medium">{vital.bmi}</p>
                      </div>
                    )}
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

export default Vitals;
