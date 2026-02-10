import { useState, useMemo } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2 } from "lucide-react";

export const PatientRegistrationDialog = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    dateOfBirth: "",
    gender: "",
    nationalId: "",
    nationality: "Kenyan",
    postalAddress: "",
    address: "",
    patientType: "" as "" | "cuea_staff" | "cuea_student" | "outsider",
    payrollNumber: "",
    admissionNumber: "",
    visitReason: "outpatient" as "outpatient" | "dental",
    insuranceProvider: "",
    insuranceNumber: "",
    nextOfKinName: "",
    nextOfKinRelationship: "",
    nextOfKinPhone: "",
  });

  const age = useMemo(() => {
    if (!formData.dateOfBirth) return null;
    const birth = new Date(formData.dateOfBirth);
    const today = new Date();
    let y = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) y--;
    return y;
  }, [formData.dateOfBirth]);

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { full_name: formData.fullName } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("User creation failed");

      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: authData.user.id,
        full_name: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        date_of_birth: formData.dateOfBirth || null,
        gender: formData.gender || null,
        address: formData.address || null,
      });
      if (profileError) throw profileError;

      const patientId = `OPD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

      const { error: patientError } = await supabase.from("patients").insert({
        user_id: authData.user.id,
        patient_id: patientId,
        patient_type: formData.patientType || "outsider",
        national_id: formData.nationalId || null,
        nationality: formData.nationality || null,
        postal_address: formData.postalAddress || null,
        email: formData.email || null,
        payroll_number: formData.payrollNumber || null,
        admission_number: formData.admissionNumber || null,
        visit_reason: formData.visitReason || "outpatient",
        insurance_provider: formData.insuranceProvider || null,
        insurance_number: formData.insuranceNumber || null,
        next_of_kin_name: formData.nextOfKinName || null,
        next_of_kin_relationship: formData.nextOfKinRelationship || null,
        next_of_kin_phone: formData.nextOfKinPhone || null,
      });
      if (patientError) throw patientError;

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: authData.user.id, role: "patient" });
      if (roleError) throw roleError;

      toast({ title: "Patient registered", description: `OPD No: ${patientId}` });
      setOpen(false);
      setFormData({
        fullName: "", phone: "", email: "", password: "", dateOfBirth: "", gender: "",
        nationalId: "", nationality: "Kenyan", postalAddress: "", address: "",
        patientType: "", payrollNumber: "", admissionNumber: "", visitReason: "outpatient",
        insuranceProvider: "", insuranceNumber: "",
        nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
      });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Register New Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Patient</DialogTitle>
          <DialogDescription>Enter patient details — fields marked * are required</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Patient Type & Visit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Patient Type *</Label>
              <Select value={formData.patientType} onValueChange={(v) => update("patientType", v)} required>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuea_staff">CUEA Staff</SelectItem>
                  <SelectItem value="cuea_student">CUEA Student</SelectItem>
                  <SelectItem value="outsider">Outsider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visit Reason *</Label>
              <Select value={formData.visitReason} onValueChange={(v) => update("visitReason", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outpatient">Outpatient</SelectItem>
                  <SelectItem value="dental">Dental</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditional: Staff payroll / Student reg */}
          {formData.patientType === "cuea_staff" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payroll Number *</Label>
                <Input value={formData.payrollNumber} onChange={(e) => update("payrollNumber", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Insurance Provider</Label>
                <Select value={formData.insuranceProvider} onValueChange={(v) => update("insuranceProvider", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pacis">Pacis</SelectItem>
                    <SelectItem value="Madison">Madison</SelectItem>
                    <SelectItem value="CIC">CIC</SelectItem>
                    <SelectItem value="NHIF">NHIF</SelectItem>
                    <SelectItem value="AAR">AAR</SelectItem>
                    <SelectItem value="Jubilee">Jubilee</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {formData.patientType === "cuea_student" && (
            <div className="space-y-2">
              <Label>Student Registration / Admission Number *</Label>
              <Input value={formData.admissionNumber} onChange={(e) => update("admissionNumber", e.target.value)} required />
            </div>
          )}

          {/* Bio */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input required value={formData.fullName} onChange={(e) => update("fullName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>National ID / Passport *</Label>
              <Input required value={formData.nationalId} onChange={(e) => update("nationalId", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Input type="date" required value={formData.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input readOnly value={age !== null ? `${age} years` : ""} className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select value={formData.gender} onValueChange={(v) => update("gender", v)} required>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input type="tel" required value={formData.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0712345678" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" required value={formData.email} onChange={(e) => update("email", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" required minLength={6} value={formData.password} onChange={(e) => update("password", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={formData.nationality} onChange={(e) => update("nationality", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Postal Address</Label>
              <Input value={formData.postalAddress} onChange={(e) => update("postalAddress", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Physical Address</Label>
              <Input value={formData.address} onChange={(e) => update("address", e.target.value)} />
            </div>
          </div>


          {/* Insurance - for staff patients */}
          {formData.patientType === "cuea_staff" && formData.insuranceProvider && (
            <div className="space-y-2">
              <Label>Insurance Member Number</Label>
              <Input value={formData.insuranceNumber} onChange={(e) => update("insuranceNumber", e.target.value)} />
            </div>
          )}

          {/* Next of Kin */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Next of Kin</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input required value={formData.nextOfKinName} onChange={(e) => update("nextOfKinName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Relationship *</Label>
                <Input required value={formData.nextOfKinRelationship} onChange={(e) => update("nextOfKinRelationship", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input required type="tel" value={formData.nextOfKinPhone} onChange={(e) => update("nextOfKinPhone", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</> : "Register Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
