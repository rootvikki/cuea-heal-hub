import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Activity } from "lucide-react";

interface VitalsEntryProps {
  ticketId: string;
  patientId: string;
  onComplete: () => void;
}

export const VitalsEntry = ({
  ticketId,
  patientId,
  onComplete,
}: VitalsEntryProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    temperature: "",
    bpSystolic: "",
    bpDiastolic: "",
    pulseRate: "",
    respiratoryRate: "",
    oxygenSaturation: "",
    weight: "",
    height: "",
  });

  const calculateBMI = (weight: number, height: number) => {
    if (!weight || !height) return null;
    const heightInMeters = height / 100;
    return (weight / (heightInMeters * heightInMeters)).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const weight = parseFloat(formData.weight);
    const height = parseFloat(formData.height);
    const bmi = weight && height ? parseFloat(calculateBMI(weight, height) || "0") : null;

    const { error } = await supabase.from("vitals").insert({
      patient_id: patientId,
      recorded_by: user.id,
      temperature: formData.temperature ? parseFloat(formData.temperature) : null,
      blood_pressure_systolic: formData.bpSystolic
        ? parseInt(formData.bpSystolic)
        : null,
      blood_pressure_diastolic: formData.bpDiastolic
        ? parseInt(formData.bpDiastolic)
        : null,
      pulse_rate: formData.pulseRate ? parseInt(formData.pulseRate) : null,
      respiratory_rate: formData.respiratoryRate
        ? parseInt(formData.respiratoryRate)
        : null,
      oxygen_saturation: formData.oxygenSaturation
        ? parseFloat(formData.oxygenSaturation)
        : null,
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
      // Update ticket status to waiting_for_doctor
      await supabase
        .from("tickets")
        .update({ status: "waiting_for_doctor" })
        .eq("id", ticketId);

      toast({
        title: "Vitals recorded",
        description: "Patient vitals saved and moved to waiting room",
      });
      setOpen(false);
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Activity className="h-4 w-4" />
          Record Vitals
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Patient Vitals</DialogTitle>
          <DialogDescription>
            Enter vital signs and move to waiting room
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperature (°C)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.temperature}
                onChange={(e) =>
                  setFormData({ ...formData, temperature: e.target.value })
                }
                placeholder="36.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Blood Pressure (mmHg)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={formData.bpSystolic}
                  onChange={(e) =>
                    setFormData({ ...formData, bpSystolic: e.target.value })
                  }
                  placeholder="120"
                />
                <span className="self-center">/</span>
                <Input
                  type="number"
                  value={formData.bpDiastolic}
                  onChange={(e) =>
                    setFormData({ ...formData, bpDiastolic: e.target.value })
                  }
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
                onChange={(e) =>
                  setFormData({ ...formData, pulseRate: e.target.value })
                }
                placeholder="72"
              />
            </div>
            <div className="space-y-2">
              <Label>Respiratory Rate (breaths/min)</Label>
              <Input
                type="number"
                value={formData.respiratoryRate}
                onChange={(e) =>
                  setFormData({ ...formData, respiratoryRate: e.target.value })
                }
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
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    oxygenSaturation: e.target.value,
                  })
                }
                placeholder="98"
              />
            </div>
            <div className="space-y-2">
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.weight}
                onChange={(e) =>
                  setFormData({ ...formData, weight: e.target.value })
                }
                placeholder="70"
              />
            </div>
            <div className="space-y-2">
              <Label>Height (cm)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.height}
                onChange={(e) =>
                  setFormData({ ...formData, height: e.target.value })
                }
                placeholder="170"
              />
            </div>
          </div>

          {formData.weight && formData.height && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Calculated BMI:</strong>{" "}
                {calculateBMI(
                  parseFloat(formData.weight),
                  parseFloat(formData.height)
                )}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save & Continue</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
