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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, User, Phone, Shield, Heart, CheckCircle2 } from "lucide-react";
import { calculateAge } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { normalizePhone } from "@/lib/validation";
import { PAYMENT_MODES } from "@/lib/pricing";

const INSURANCE_PROVIDERS = ["Pacis"];

const SectionHeader = ({ icon: Icon, title, filled, total }: { icon: React.ElementType; title: string; filled: number; total: number }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      <div className="p-2 rounded-lg bg-primary/10 border-l-4 border-primary">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="font-bold text-base">{title}</h3>
    </div>
    <Badge variant={filled === total ? "default" : "outline"} className="text-xs gap-1">
      {filled === total && <CheckCircle2 className="h-3 w-3" />}
      {filled}/{total}
    </Badge>
  </div>
);

interface RegistrationResult {
  patientRecordId: string;
  patientId: string;
  visitReason: string;
  existing: boolean;
  fullName: string;
}

export const PatientRegistrationDialog = ({ onSuccess }: { onSuccess?: (data: RegistrationResult) => void }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "", phone: "", email: "", dateOfBirth: "", gender: "",
    nationalId: "", nationality: "Kenyan", postalAddress: "", address: "",
    patientType: "" as "" | "cuea_staff" | "cuea_student" | "outsider",
    payrollNumber: "", admissionNumber: "", visitReason: "outpatient" as "outpatient" | "dental",
    insuranceProvider: "Pacis", insuranceNumber: "", paymentMode: "mpesa_school_fees",
    nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
  });

  const ageDisplay = useMemo(() => {
    if (!formData.dateOfBirth) return "";
    return calculateAge(formData.dateOfBirth);
  }, [formData.dateOfBirth]);

  const update = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // Section completion counts
  const classificationFilled = useMemo(() => {
    let filled = 0, total = 2;
    if (formData.patientType) filled++;
    if (formData.visitReason) filled++;
    if (formData.patientType === "cuea_staff") { total++; if (formData.payrollNumber) filled++; }
    if (formData.patientType === "cuea_student") { total++; if (formData.admissionNumber) filled++; }
    return { filled, total };
  }, [formData]);

  const personalFilled = useMemo(() => {
    let filled = 0;
    const total = 4;
    if (formData.fullName) filled++;
    if (formData.nationalId) filled++;
    if (formData.dateOfBirth) filled++;
    if (formData.gender) filled++;
    return { filled, total };
  }, [formData]);

  const contactFilled = useMemo(() => {
    let filled = 0;
    const total = 2;
    if (formData.phone) filled++;
    if (formData.email) filled++;
    return { filled, total };
  }, [formData]);

  const kinFilled = useMemo(() => {
    let filled = 0;
    const total = 3;
    if (formData.nextOfKinName) filled++;
    if (formData.nextOfKinRelationship) filled++;
    if (formData.nextOfKinPhone) filled++;
    return { filled, total };
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validatePatientForm({
      fullName: formData.fullName, email: formData.email, phone: formData.phone,
      nationalId: formData.nationalId,
      nextOfKinName: formData.nextOfKinName, nextOfKinPhone: formData.nextOfKinPhone,
    });
    if (formData.paymentMode === "insurance" && !formData.insuranceProvider) {
      errors.push({ field: "insuranceProvider", message: "Select the insurance provider" });
    }
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
          fullName: formData.fullName.trim(), phone: normalizePhone(formData.phone), email: formData.email.trim(),
          dateOfBirth: formData.dateOfBirth || null,
          gender: formData.gender || null, nationalId: formData.nationalId || null,
          nationality: formData.nationality || null, postalAddress: formData.postalAddress || null,
          address: formData.address || null, patientType: formData.patientType || "outsider",
          payrollNumber: formData.payrollNumber || null, admissionNumber: formData.admissionNumber || null,
          visitReason: formData.visitReason || "outpatient",
          insuranceProvider: formData.insuranceProvider || null,
          insuranceNumber: formData.insuranceNumber || null,
          nextOfKinName: formData.nextOfKinName || null,
          nextOfKinRelationship: formData.nextOfKinRelationship || null,
          nextOfKinPhone: formData.nextOfKinPhone ? normalizePhone(formData.nextOfKinPhone) : null,
        },
      });
      const result = response.data;
      if (response.error) {
        // Extract message from the response body if available
        const msg = result?.error || response.error.message || "Registration failed";
        throw new Error(msg);
      }
      if (result?.error) throw new Error(result.error);
      toast({
        title: result?.existing ? "Patient already exists" : "Patient registered",
        description: result?.message || `OPD No: ${result.patientId}`,
      });
      if (result?.patientRecordId) {
        await supabase.from("patients").update({ preferred_payment_mode: formData.paymentMode } as any).eq("id", result.patientRecordId);
      }
      setOpen(false);
      const registrationData: RegistrationResult = {
        patientRecordId: result.patientRecordId,
        patientId: result.patientId,
        visitReason: result.visitReason || formData.visitReason || "outpatient",
        existing: !!result.existing,
        fullName: formData.fullName,
      };
      setFormData({
        fullName: "", phone: "", email: "", dateOfBirth: "", gender: "",
        nationalId: "", nationality: "Kenyan", postalAddress: "", address: "",
        patientType: "", payrollNumber: "", admissionNumber: "", visitReason: "outpatient",
        insuranceProvider: "Pacis", insuranceNumber: "", paymentMode: "mpesa_school_fees",
        nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "",
      });
      onSuccess?.(registrationData);
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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Register New Patient</DialogTitle>
          <DialogDescription>Complete all sections below. Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Classification */}
          <div>
            <SectionHeader icon={Shield} title="Patient Classification" filled={classificationFilled.filled} total={classificationFilled.total} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Patient Type *</Label>
                <Select value={formData.patientType} onValueChange={(v) => update("patientType", v)} required>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cuea_staff">CUEA Staff</SelectItem>
                    <SelectItem value="cuea_student">CUEA Student</SelectItem>
                    <SelectItem value="outsider">Outsider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Visit Reason *</Label>
                <Select value={formData.visitReason} onValueChange={(v) => update("visitReason", v)}>
                  <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="dental">Dental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.patientType === "cuea_staff" && (
              <div className="mt-5 space-y-2">
                <Label className="text-sm font-semibold">Payroll / Member Number *</Label>
                <Input value={formData.payrollNumber} onChange={(e) => update("payrollNumber", e.target.value)} required className="h-12 text-base" placeholder="e.g. PAY-0001" />
              </div>
            )}
            {formData.patientType === "cuea_student" && (
              <div className="mt-5 space-y-2">
                <Label className="text-sm font-semibold">Student Registration / Admission Number *</Label>
                <Input value={formData.admissionNumber} onChange={(e) => update("admissionNumber", e.target.value)} required className="h-12 text-base" placeholder="e.g. ADM/2024/001" />
              </div>
            )}
            <div className="mt-5 space-y-2">
              <Label className="text-sm font-semibold">Usual Payment Mode *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => update("paymentMode", m.value)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${formData.paymentMode === m.value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"}`}>
                    <p className="font-semibold text-sm">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Can be changed at each check-in.</p>
            </div>
            {formData.paymentMode === "insurance" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Insurance Provider *</Label>
                  <Select value={formData.insuranceProvider} onValueChange={(v) => update("insuranceProvider", v)}>
                    <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {INSURANCE_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Insurance Member Number *</Label>
                  <Input required value={formData.insuranceNumber} onChange={(e) => update("insuranceNumber", e.target.value)} className="h-12 text-base" placeholder="e.g. INS-123456" />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Section 2: Personal Information */}
          <div>
            <SectionHeader icon={User} title="Personal Information" filled={personalFilled.filled} total={personalFilled.total} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Full Name *</Label>
                <Input required value={formData.fullName} onChange={(e) => update("fullName", e.target.value)} className="h-12 text-base" placeholder="e.g. John Kamau Mwangi" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">National ID / Passport *</Label>
                <Input required value={formData.nationalId} onChange={(e) => update("nationalId", e.target.value)} className="h-12 text-base" placeholder="e.g. 12345678" />
                <p className="text-xs text-muted-foreground">Government-issued ID number</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Date of Birth *</Label>
                <Input type="date" required value={formData.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Age</Label>
                <Input readOnly value={ageDisplay} className="bg-muted font-bold h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Gender *</Label>
                <Select value={formData.gender} onValueChange={(v) => update("gender", v)} required>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Nationality</Label>
                <Input value={formData.nationality} onChange={(e) => update("nationality", e.target.value)} className="h-12 text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Postal Address</Label>
                <Input value={formData.postalAddress} onChange={(e) => update("postalAddress", e.target.value)} className="h-12 text-base" placeholder="e.g. P.O. Box 12345" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Label className="text-sm font-semibold">Physical Address</Label>
              <Input value={formData.address} onChange={(e) => update("address", e.target.value)} className="h-12 text-base" placeholder="e.g. Karen, Nairobi" />
            </div>
          </div>

          <Separator />

          {/* Section 3: Contact & Account */}
          <div>
            <SectionHeader icon={Phone} title="Contact & Account" filled={contactFilled.filled} total={contactFilled.total} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Phone Number *</Label>
                <PhoneInput required value={formData.phone} onChange={(v) => update("phone", v)} />
                <p className="text-xs text-muted-foreground">Pick the country code — international numbers are accepted</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Email *</Label>
                <Input type="email" required value={formData.email} onChange={(e) => update("email", e.target.value)} className="h-12 text-base" placeholder="patient@email.com" />
                <p className="text-xs text-muted-foreground">Used for portal login and notifications</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Section 4: Next of Kin */}
          <div>
            <SectionHeader icon={Heart} title="Next of Kin" filled={kinFilled.filled} total={kinFilled.total} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Name *</Label>
                <Input required value={formData.nextOfKinName} onChange={(e) => update("nextOfKinName", e.target.value)} className="h-12 text-base" placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Relationship *</Label>
                <Input required value={formData.nextOfKinRelationship} onChange={(e) => update("nextOfKinRelationship", e.target.value)} className="h-12 text-base" placeholder="e.g. Spouse, Parent" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Phone *</Label>
                <PhoneInput required value={formData.nextOfKinPhone} onChange={(v) => update("nextOfKinPhone", v)} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 px-6 text-base">Cancel</Button>
            <Button type="submit" disabled={loading} size="lg" className="h-12 px-8 text-base">
              {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Registering...</> : "Register Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
