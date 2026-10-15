import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: any;
  profile: any;
  onSaved: () => void;
}

export function EditBiodataDialog({ open, onOpenChange, patient, profile, onSaved }: Props) {
  const [f, setF] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      full_name: profile?.full_name || "",
      gender: profile?.gender || "",
      date_of_birth: profile?.date_of_birth || "",
      phone: profile?.phone || "",
      address: profile?.address || "",
      email: patient?.email || profile?.email || "",
      national_id: patient?.national_id || "",
      nationality: patient?.nationality || "",
      patient_type: patient?.patient_type || "outsider",
      payroll_number: patient?.payroll_number || "",
      admission_number: patient?.admission_number || "",
      next_of_kin_name: patient?.next_of_kin_name || "",
      next_of_kin_relationship: patient?.next_of_kin_relationship || "",
      next_of_kin_phone: patient?.next_of_kin_phone || "",
    });
  }, [open, patient, profile]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const nn = (v: string) => (v.trim() === "" ? null : v.trim());

  const save = async () => {
    if (!f.full_name.trim()) return toast.error("Name is required");
    setSaving(true);
    const { error: pe } = await supabase
      .from("profiles")
      .update({
        full_name: f.full_name.trim(),
        gender: nn(f.gender),
        date_of_birth: nn(f.date_of_birth),
        phone: nn(f.phone),
        address: nn(f.address),
      })
      .eq("user_id", patient.user_id);
    const { error: te } = await supabase
      .from("patients")
      .update({
        email: nn(f.email),
        national_id: nn(f.national_id),
        nationality: nn(f.nationality),
        patient_type: f.patient_type as any,
        payroll_number: nn(f.payroll_number),
        admission_number: nn(f.admission_number),
        next_of_kin_name: nn(f.next_of_kin_name),
        next_of_kin_relationship: nn(f.next_of_kin_relationship),
        next_of_kin_phone: nn(f.next_of_kin_phone),
      })
      .eq("id", patient.id);
    setSaving(false);
    if (pe || te) return toast.error(`Could not save: ${(pe || te)?.message}`);
    await logAuditEvent({ action: "PATIENT_BIODATA_EDITED", module: "reception", details: { patient_id: patient.id, changes: f } });
    toast.success("Patient biodata updated");
    onOpenChange(false);
    onSaved();
  };

  const field = (k: string, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input className="h-12" type={type} value={f[k] || ""} onChange={set(k)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit patient biodata — {patient?.patient_id}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {field("full_name", "Full name")}
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={f.gender || ""} onValueChange={(v) => setF((p) => ({ ...p, gender: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("date_of_birth", "Date of birth", "date")}
          <div className="space-y-1.5">
            <Label>Patient type</Label>
            <Select value={f.patient_type} onValueChange={(v) => setF((p) => ({ ...p, patient_type: v }))}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cuea_staff">CUEA Staff</SelectItem>
                <SelectItem value="cuea_student">CUEA Student</SelectItem>
                <SelectItem value="outsider">Outsider</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("payroll_number", "Member no. (staff)")}
          {field("admission_number", "School admission no.")}
          {field("national_id", "National ID")}
          {field("nationality", "Nationality")}
          {field("phone", "Phone")}
          {field("email", "Email", "email")}
          {field("address", "Address")}
          {field("next_of_kin_name", "Next of kin")}
          {field("next_of_kin_relationship", "Relationship")}
          {field("next_of_kin_phone", "Next of kin phone")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
