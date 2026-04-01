import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ROLE_OPTIONS = [
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "clinical_officer", label: "Clinical Officer" },
  { value: "receptionist", label: "Receptionist" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "radiologist", label: "Radiologist" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "cashier", label: "Cashier" },
  { value: "records_officer", label: "Records Officer" },
  { value: "ward_manager", label: "Ward Manager" },
  { value: "hr_admin", label: "HR Admin" },
];

const StaffRegistration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    national_id: "",
    payroll_number: "",
    roles: [] as string[],
    specialization: "",
    license_number: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.phone || form.roles.length === 0) {
      toast({ title: "Missing fields", description: "Please fill in all required fields and select at least one role.", variant: "destructive" });
      return;
    }
    if (!form.email.endsWith("@cuea.edu") && !form.email.endsWith("@cuea.ac.ke")) {
      toast({ title: "Invalid email", description: "Please use your CUEA email address.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("staff_applications" as any).insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        national_id: form.national_id || null,
        desired_role: form.roles.join(", "),
        specialization: form.specialization || null,
        license_number: form.license_number || null,
        notes: form.payroll_number ? `Payroll: ${form.payroll_number}` : null,
      } as any);

      if (error) throw error;
      setSubmitted(true);
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <Card className="w-full max-w-lg shadow-xl text-center">
          <CardContent className="pt-10 pb-10 space-y-6">
            <CheckCircle className="w-20 h-20 mx-auto text-green-500" />
            <h2 className="text-2xl font-bold">Details Submitted!</h2>
            <p className="text-muted-foreground text-base">
              Thank you, <strong>{form.full_name}</strong>. Your details have been received. The admin will use this information to set up your account. You will receive your login credentials via email at <strong>{form.email}</strong>.
            </p>
            <Button onClick={() => navigate("/auth")} variant="outline" className="h-12">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <img src="/favicon.png" alt="CUEA Logo" className="mx-auto w-16 h-16 mb-4" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            CUEA Infirmary
          </h1>
          <p className="text-muted-foreground mt-2">Staff Information Form</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Staff Details Registration</CardTitle>
            <CardDescription>Please fill in your details so the admin can set up your system account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="font-semibold text-base mb-4 text-primary">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input className="h-12 text-base" placeholder="John Doe" value={form.full_name} onChange={e => handleChange("full_name", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>CUEA Email Address *</Label>
                    <Input className="h-12 text-base" type="email" placeholder="john@cuea.edu" value={form.email} onChange={e => handleChange("email", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <Input className="h-12 text-base" placeholder="+254 7XX XXX XXX" value={form.phone} onChange={e => handleChange("phone", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>National ID</Label>
                    <Input className="h-12 text-base" placeholder="12345678" value={form.national_id} onChange={e => handleChange("national_id", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Payroll Number</Label>
                    <Input className="h-12 text-base" placeholder="e.g. P001" value={form.payroll_number} onChange={e => handleChange("payroll_number", e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-4 text-primary">Professional Information</h3>
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label>Current Role(s) * <span className="text-muted-foreground font-normal text-sm">(select all that apply)</span></Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {ROLE_OPTIONS.map(r => (
                        <label key={r.value} className="flex items-center gap-2 cursor-pointer p-2 rounded-md border hover:bg-accent/50 transition-colors">
                          <Checkbox checked={form.roles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} />
                          <span className="text-sm">{r.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label>Specialization</Label>
                      <Input className="h-12 text-base" placeholder="e.g. Pediatrics, Radiology" value={form.specialization} onChange={e => handleChange("specialization", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>License Number</Label>
                      <Input className="h-12 text-base" placeholder="Professional license #" value={form.license_number} onChange={e => handleChange("license_number", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <Button type="button" variant="outline" className="h-12" onClick={() => navigate("/auth")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Button>
                <Button type="submit" className="h-12 flex-1" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Details"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffRegistration;
