import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { validatePatientForm } from "@/lib/validation";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, User, Phone, Shield, Heart } from "lucide-react";
import { calculateAge } from "@/lib/utils";

export const PatientRegistrationDialog = ({ onSuccess }: { onSuccess?: () => void }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "", phone: "", email: "", password: "", dateOfBirth: "", gender: "",
    nationalId: "", nationality: "Kenyan", postalAddress: "", address: "",
    patientType: "" as "" | "cuea_staff" | "cuea_student" | "outsider",
    payrollNumber: "", admissionNumber: "", visitReason: "outpatient" as "outpatient" | "dental",
    insuranceProvider: "", insuranceNumber: "",
    nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
  });

  const ageDisplay = useMemo(() => {
    if (!formData.dateOfBirth) return "";
    return calculateAge(formData.dateOfBirth);
  }, [formData.dateOfBirth]);

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validatePatientForm({
      fullName: formData.fullName, email: formData.email, phone: formData.phone,
      password: formData.password, nationalId: formData.nationalId,
      nextOfKinName: formData.nextOfKinName, nextOfKinPhone: formData.nextOfKinPhone,
    });
    if (errors.length > 0) {
      toast({ title: "Validation Error", description: errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in to register patients");
      const response = await supabase.functions.invoke("register-patient", {
        body: {
          fullName: formData.fullName, phone: formData.phone, email: formData.email,
          password: formData.password, dateOfBirth: formData.dateOfBirth || null,
          gender: formData.gender || null, nationalId: formData.nationalId || null,
          nationality: formData.nationality || null, postalAddress: formData.postalAddress || null,
          address: formData.address || null, patientType: formData.patientType || "outsider",
          payrollNumber: formData.payrollNumber || null, admissionNumber: formData.admissionNumber || null,
          visitReason: formData.visitReason || "outpatient",
          insuranceProvider: formData.insuranceProvider || null,
          insuranceNumber: formData.insuranceNumber || null,
          nextOfKinName: formData.nextOfKinName || null,
          nextOfKinRelationship: formData.nextOfKinRelationship || null,
          nextOfKinPhone: formData.nextOfKinPhone || null,
        },
      });
      if (response.error) throw new Error(response.error.message || "Registration failed");
      const result = response.data;
      if (result.error) throw new Error(result.error);
      toast({ title: "Patient registered", description: `OPD No: ${result.patientId}` });
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
        <Button className="gap-2"><UserPlus className="h-4 w-4" /> Register New Patient</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Register New Patient</DialogTitle>
          <DialogDescription>Complete all sections below. Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Classification */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/10"><Shield className="h-4 w-4 text-primary" /></div>
              <h3 className="font-semibold text-sm">Patient Classification</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            {formData.patientType === "cuea_staff" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>Payroll Number *</Label>
                  <Input value={formData.payrollNumber} onChange={(e) => update("payrollNumber", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Insurance Provider</Label>
                  <Select value={formData.insuranceProvider} onValueChange={(v) => update("insuranceProvider", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["Pacis", "Madison", "CIC", "NHIF", "AAR", "Jubilee", "Other"].map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {formData.patientType === "cuea_student" && (
              <div className="mt-4 space-y-2">
                <Label>Student Registration / Admission Number *</Label>
                <Input value={formData.admissionNumber} onChange={(e) => update("admissionNumber", e.target.value)} required />
              </div>
            )}
          </div>

          <Separator />

          {/* Section 2: Personal Information */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/10"><User className="h-4 w-4 text-primary" /></div>
              <h3 className="font-semibold text-sm">Personal Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input required value={formData.fullName} onChange={(e) => update("fullName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>National ID / Passport *</Label>
                <Input required value={formData.nationalId} onChange={(e) => update("nationalId", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Date of Birth *</Label>
                <Input type="date" required value={formData.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input readOnly value={ageDisplay} className="bg-muted font-semibold" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Nationality</Label>
                <Input value={formData.nationality} onChange={(e) => update("nationality", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Postal Address</Label>
                <Input value={formData.postalAddress} onChange={(e) => update("postalAddress", e.target.value)} />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <Label>Physical Address</Label>
              <Input value={formData.address} onChange={(e) => update("address", e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Section 3: Contact & Account */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/10"><Phone className="h-4 w-4 text-primary" /></div>
              <h3 className="font-semibold text-sm">Contact & Account</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number *</Label>
                <Input type="tel" required value={formData.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0712345678" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" required value={formData.email} onChange={(e) => update("email", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" required minLength={6} value={formData.password} onChange={(e) => update("password", e.target.value)} />
              </div>
              {formData.patientType === "cuea_staff" && formData.insuranceProvider && (
                <div className="space-y-2">
                  <Label>Insurance Member Number</Label>
                  <Input value={formData.insuranceNumber} onChange={(e) => update("insuranceNumber", e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Section 4: Next of Kin */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-primary/10"><Heart className="h-4 w-4 text-primary" /></div>
              <h3 className="font-semibold text-sm">Next of Kin</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <Separator />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading} size="lg">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registering...</> : "Register Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};