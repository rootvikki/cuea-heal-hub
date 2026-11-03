import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidPhone, normalizePhone } from "@/lib/validation";
import { PAYMENT_MODES, allowedPaymentModes, defaultPaymentMode, paymentModeLabel, type PaymentMode } from "@/lib/pricing";
import { openVisitIds, setVisitPaymentMode } from "@/lib/billing";
import { useFormDraft } from "@/hooks/useFormDraft";
import { DraftStatus } from "@/components/DraftStatus";
import { useUser } from "@/contexts/UserContext";

const normGender = (g?: string | null) => { const x = (g || "").trim().toLowerCase(); return x === "male" || x === "m" ? "Male" : x === "female" || x === "f" ? "Female" : ""; };

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
  const { user, hasAnyRole } = useUser();
  // Nobody edits their own personal details (the database refuses it too); administrators keep control
  const ownRecord = !!user && patient?.user_id === user.id && !hasAnyRole(["admin", "super_admin"]);

  // Always edit the full saved record — the caller may only have a few fields,
  // and saving a partial copy would wipe the rest (nationality, next of kin…).
  const [fresh, setFresh] = useState<{ patient: any; profile: any } | null>(null);
  const [initialF, setInitialF] = useState<Record<string, string> | undefined>(undefined);
  useEffect(() => {
    if (!open || !patient?.id) { setFresh(null); return; }
    let cancelled = false;
    (async () => {
      const [{ data: pt }, { data: pr }] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patient.id).maybeSingle(),
        supabase.from("profiles").select("full_name, gender, date_of_birth, phone, address, email").eq("user_id", patient.user_id).maybeSingle(),
      ]);
      if (!cancelled) setFresh({ patient: { ...patient, ...(pt || {}) }, profile: { ...profile, ...(pr || {}) } });
    })();
    return () => { cancelled = true; };
    // Only reload when a different patient is opened — parents re-render (queue refreshes) and pass new objects
  }, [open, patient?.id, patient?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !fresh) return;
    const { patient, profile } = fresh;
    const initial: Record<string, string> = {
      full_name: profile?.full_name || "",
      gender: normGender(profile?.gender),
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
      insurance_provider: patient?.insurance_provider || "",
      insurance_number: patient?.insurance_number || "",
      preferred_payment_mode: allowedPaymentModes(patient?.patient_type).includes(patient?.preferred_payment_mode as any) ? patient.preferred_payment_mode : defaultPaymentMode(patient || {}),
    };
    setF(initial);
    setInitialF(initial);
  }, [open, fresh]);

  // Autosave edits per patient until saved
  const draft = useFormDraft(patient?.id ? `biodata:${patient.id}` : null, f, setF, { enabled: open && !!fresh, reset: initialF });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const nn = (v: string) => (v.trim() === "" ? null : v.trim());

  const save = async () => {
    if (!f.full_name.trim()) return toast.error("Name is required");
    if (!f.gender) return toast.error("Select the patient's gender");
    if (!allowedPaymentModes(f.patient_type).includes(f.preferred_payment_mode as any)) return toast.error("Choose a payment mode allowed for this patient type");
    if (f.preferred_payment_mode === "insurance" && (!f.insurance_provider.trim() || !f.insurance_number.trim())) return toast.error("Insurance needs the provider and member number");
    if (f.phone && !isValidPhone(f.phone)) return toast.error("Phone number is not valid");
    if (f.next_of_kin_phone && !isValidPhone(f.next_of_kin_phone)) return toast.error("Next of kin phone is not valid");
    setSaving(true);
    const { error: pe } = await supabase
      .from("profiles")
      .update({
        full_name: f.full_name.trim(),
        gender: nn(f.gender),
        date_of_birth: nn(f.date_of_birth),
        phone: f.phone ? normalizePhone(f.phone) : null,
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
        next_of_kin_phone: f.next_of_kin_phone ? normalizePhone(f.next_of_kin_phone) : null,
        insurance_provider: nn(f.insurance_provider),
        insurance_number: nn(f.insurance_number),
        preferred_payment_mode: f.preferred_payment_mode,
      } as any)
      .eq("id", patient.id);
    setSaving(false);
    if (pe || te) return toast.error(`Could not save: ${(pe || te)?.message}`);
    // The payment mode reception picks follows any visit that is still open, through to billing
    const oldMode = fresh?.patient?.preferred_payment_mode;
    if (f.preferred_payment_mode !== oldMode) {
      try {
        const ids = await openVisitIds(patient.id);
        if (ids.length) {
          await setVisitPaymentMode(ids, f.preferred_payment_mode as PaymentMode, f.patient_type);
          toast.info(`Current visit now billed as ${paymentModeLabel(f.preferred_payment_mode)}`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
    await logAuditEvent({ action: "PATIENT_BIODATA_EDITED", module: "reception", details: { patient_id: patient.id, changes: f } });
    draft.clear();
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
          <DraftStatus draft={draft} />
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {field("full_name", "Full name")}
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={f.gender || ""} onValueChange={(v) => setF((p) => ({ ...p, gender: v }))}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("date_of_birth", "Date of birth", "date")}
          <div className="space-y-1.5">
            <Label>Patient type</Label>
            <Select value={f.patient_type} onValueChange={(v) => setF((p) => ({ ...p, patient_type: v, preferred_payment_mode: allowedPaymentModes(v).includes(p.preferred_payment_mode as any) ? p.preferred_payment_mode : allowedPaymentModes(v)[0] }))}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cuea_staff">CUEA Staff</SelectItem>
                <SelectItem value="cuea_student">CUEA Student</SelectItem>
                <SelectItem value="outsider">Outsider</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("payroll_number", "Payroll no. (staff)")}
          {field("admission_number", "School admission no.")}
          {field("national_id", "National ID")}
          {field("nationality", "Nationality")}
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <PhoneInput value={f.phone || ""} onChange={(v) => setF((p) => ({ ...p, phone: v }))} />
          </div>
          {field("email", "Email", "email")}
          {field("address", "Address")}
          {field("next_of_kin_name", "Next of kin")}
          {field("next_of_kin_relationship", "Relationship")}
          <div className="space-y-1.5">
            <Label>Next of kin phone</Label>
            <PhoneInput value={f.next_of_kin_phone || ""} onChange={(v) => setF((p) => ({ ...p, next_of_kin_phone: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Usual payment mode</Label>
            <Select value={f.preferred_payment_mode} onValueChange={(v) => setF((p) => ({ ...p, preferred_payment_mode: v }))}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_MODES.filter((m) => allowedPaymentModes(f.patient_type).includes(m.value)).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("insurance_provider", "Insurance provider")}
          {field("insurance_number", "Insurance member no.")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {ownRecord && <p className="text-sm text-destructive mr-auto">This is your own record — ask another staff member or the administrator to change it.</p>}
          <Button onClick={save} disabled={saving || !fresh || ownRecord}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
