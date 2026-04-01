import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const SHIFT_OPTIONS = [
  { value: "all_day", label: "All Day (8AM - 5PM)" },
  { value: "morning", label: "Morning (6AM - 2PM)" },
  { value: "afternoon", label: "Afternoon (2PM - 10PM)" },
  { value: "night", label: "Night (10PM - 6AM)" },
  { value: "flexible", label: "Flexible" },
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
    desired_role: "",
    specialization: "",
    license_number: "",
    years_of_experience: "",
    preferred_shift: "",
    notes: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.phone || !form.desired_role) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("staff_applications" as any).insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        national_id: form.national_id || null,
        desired_role: form.desired_role,
        specialization: form.specialization || null,
        license_number: form.license_number || null,
        years_of_experience: form.years_of_experience ? parseInt(form.years_of_experience) : null,
        preferred_shift: form.preferred_shift || null,
        notes: form.notes || null,
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
            <CardTitle>Apply to Join Our Team</CardTitle>
            <CardDescription>Fill in your details below. The administration team will review your application and contact you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Info */}
              <div>
                <h3 className="font-semibold text-base mb-4 text-primary">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input className="h-12 text-base" placeholder="John Doe" value={form.full_name} onChange={e => handleChange("full_name", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email Address *</Label>
                    <Input className="h-12 text-base" type="email" placeholder="john@example.com" value={form.email} onChange={e => handleChange("email", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <Input className="h-12 text-base" placeholder="+254 7XX XXX XXX" value={form.phone} onChange={e => handleChange("phone", e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>National ID</Label>
                    <Input className="h-12 text-base" placeholder="12345678" value={form.national_id} onChange={e => handleChange("national_id", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Professional Info */}
              <div>
                <h3 className="font-semibold text-base mb-4 text-primary">Professional Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label>Desired Role *</Label>
                    <Select value={form.desired_role} onValueChange={v => handleChange("desired_role", v)}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select a role" /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Specialization</Label>
                    <Input className="h-12 text-base" placeholder="e.g. Pediatrics, Radiology" value={form.specialization} onChange={e => handleChange("specialization", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input className="h-12 text-base" placeholder="Professional license #" value={form.license_number} onChange={e => handleChange("license_number", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Years of Experience</Label>
                    <Input className="h-12 text-base" type="number" min="0" max="50" placeholder="e.g. 5" value={form.years_of_experience} onChange={e => handleChange("years_of_experience", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Availability */}
              <div>
                <h3 className="font-semibold text-base mb-4 text-primary">Availability</h3>
                <div className="space-y-2">
                  <Label>Preferred Shift</Label>
                  <Select value={form.preferred_shift} onValueChange={v => handleChange("preferred_shift", v)}>
                    <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select preferred shift" /></SelectTrigger>
                    <SelectContent>
                      {SHIFT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea className="text-base" rows={4} placeholder="Tell us anything else about yourself..." value={form.notes} onChange={e => handleChange("notes", e.target.value)} />
              </div>

              <div className="flex gap-4 pt-2">
                <Button type="button" variant="outline" className="h-12" onClick={() => navigate("/auth")}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Button>
                <Button type="submit" className="h-12 flex-1" disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Application"}
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
