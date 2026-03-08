import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FileText, Printer } from "lucide-react";

interface ReferralFormProps {
  patientId: string;
  patientName: string;
  patientAge: string;
  patientGender: string;
  encounterId?: string;
  doctorName: string;
  /** Controlled mode: pass open + onOpenChange to control externally */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ReferralForm({ patientId, patientName, patientAge, patientGender, encounterId, doctorName, open: controlledOpen, onOpenChange }: ReferralFormProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [reasons, setReasons] = useState("");
  const [treatmentGiven, setTreatmentGiven] = useState("");
  const [saving, setSaving] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    if (!isControlled) setInternalOpen(val);
  };

  // Reset form when opening
  useEffect(() => {
    if (open) { setReasons(""); setTreatmentGiven(""); }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("referrals").insert({
        patient_id: patientId,
        encounter_id: encounterId || null,
        referred_by: user?.id || "",
        reasons_for_referral: reasons,
        treatment_given: treatmentGiven,
        doctor_name: doctorName,
      });
      if (error) throw error;
      toast({ title: "Referral saved" });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Referral Form</title>
      <style>body{font-family:serif;padding:40px;max-width:700px;margin:auto}
      h1{text-align:center;font-size:18px}h2{font-size:14px;text-align:center;margin-bottom:30px}
      .field{margin-bottom:15px}.label{font-weight:bold}
      .line{border-bottom:1px solid #000;min-height:20px;margin-top:5px;padding:4px 0}
      .footer{margin-top:40px;font-size:10px;text-align:right}</style></head>
      <body>
        <h1>CATHOLIC UNIVERSITY OF EASTERN AFRICA</h1>
        <h2>REFERRAL FORM</h2>
        <div class="field"><span class="label">Name of Patient:</span> <span class="line">${patientName}</span></div>
        <div style="display:flex;gap:40px">
          <div class="field"><span class="label">Age:</span> ${patientAge}</div>
          <div class="field"><span class="label">Sex:</span> ${patientGender}</div>
          <div class="field"><span class="label">Date:</span> ${new Date().toLocaleDateString()}</div>
        </div>
        <div class="field"><span class="label">Reasons for Referral:</span><div class="line">${reasons}</div></div>
        <div class="field"><span class="label">Treatment Given:</span><div class="line">${treatmentGiven}</div></div>
        <div class="field"><span class="label">Name of Doctor:</span> ${doctorName}</div>
        <div class="field"><span class="label">Signature:</span> ___________________</div>
        <div class="footer">CUEA/DVC ADM/INF/01/fm01</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const dialogContent = (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Referral Form — CUEA Infirmary</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><Label>Patient</Label><Input readOnly value={patientName} className="bg-muted" /></div>
          <div><Label>Age</Label><Input readOnly value={patientAge} className="bg-muted" /></div>
          <div><Label>Gender</Label><Input readOnly value={patientGender} className="bg-muted" /></div>
        </div>
        <div className="space-y-2">
          <Label>Reasons for Referral *</Label>
          <Textarea rows={4} value={reasons} onChange={(e) => setReasons(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Treatment Given</Label>
          <Textarea rows={3} value={treatmentGiven} onChange={(e) => setTreatmentGiven(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Doctor</Label>
          <Input readOnly value={doctorName} className="bg-muted" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handlePrint} disabled={!reasons}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button onClick={handleSave} disabled={!reasons || saving}>
            {saving ? "Saving..." : "Save Referral"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );

  // Controlled mode: no trigger needed
  if (isControlled) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  // Uncontrolled mode: render with trigger button
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <FileText className="h-4 w-4" /> Referral
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
