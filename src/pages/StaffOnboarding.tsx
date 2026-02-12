import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateStaffForm } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Check, User, Briefcase, Clock, FileCheck, Loader2 } from "lucide-react";

type AppRole = "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager";

interface Department {
  id: string;
  name: string;
}

interface FormData {
  email: string;
  fullName: string;
  phone: string;
  nationalId: string;
  payrollNumber: string;
  primaryRole: AppRole | "";
  secondaryRoles: AppRole[];
  departmentId: string;
  specialization: string;
  licenseNumber: string;
  workingDays: string[];
  shiftPreference: string;
  notes: string;
}

const STEPS = [
  { id: 1, title: "Basic Info", icon: User },
  { id: 2, title: "Role & Department", icon: Briefcase },
  { id: 3, title: "Schedule", icon: Clock },
  { id: 4, title: "Review", icon: FileCheck },
];

const ROLES: { value: AppRole; label: string; category: string }[] = [
  { value: "super_admin", label: "Super Administrator", category: "Administration" },
  { value: "system_admin", label: "System Administrator", category: "Administration" },
  { value: "admin", label: "Administrator", category: "Administration" },
  { value: "hr_admin", label: "HR Administrator", category: "Administration" },
  { value: "doctor", label: "Doctor", category: "Clinical" },
  { value: "clinical_officer", label: "Clinical Officer", category: "Clinical" },
  { value: "nurse", label: "Nurse", category: "Clinical" },
  { value: "ward_manager", label: "Ward Manager", category: "Clinical" },
  { value: "receptionist", label: "Receptionist", category: "Support" },
  { value: "lab_technician", label: "Lab Technician", category: "Diagnostics" },
  { value: "radiologist", label: "Radiologist", category: "Diagnostics" },
  { value: "pharmacist", label: "Pharmacist", category: "Pharmacy" },
  { value: "finance_officer", label: "Finance Officer", category: "Finance" },
  { value: "cashier", label: "Cashier", category: "Finance" },
  { value: "accountant", label: "Accountant", category: "Finance" },
  { value: "records_officer", label: "Records Officer", category: "Support" },
  { value: "auditor", label: "Auditor", category: "Finance" },
];

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHIFTS = ["All Day (8AM - 5PM)", "Morning (6AM - 2PM)", "Afternoon (2PM - 10PM)", "Night (10PM - 6AM)", "Flexible"];

const ROLE_DEPARTMENT_MAP: Record<string, string> = {
  doctor: "General Medicine",
  clinical_officer: "General Medicine",
  nurse: "General Medicine",
  ward_manager: "General Medicine",
  receptionist: "General Medicine",
  records_officer: "General Medicine",
  lab_technician: "Laboratory",
  radiologist: "Imaging",
  pharmacist: "Pharmacy",
};

export default function StaffOnboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  const [formData, setFormData] = useState<FormData>({
    email: "",
    fullName: "",
    phone: "",
    nationalId: "",
    payrollNumber: "",
    primaryRole: "",
    secondaryRoles: [],
    departmentId: "",
    specialization: "",
    licenseNumber: "",
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    shiftPreference: "All Day (8AM - 5PM)",
    notes: "",
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("id, name").order("name");
    if (data) setDepartments(data);
  };

  const updateFormData = (field: keyof FormData, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSecondaryRole = (role: AppRole) => {
    setFormData(prev => ({
      ...prev,
      secondaryRoles: prev.secondaryRoles.includes(role)
        ? prev.secondaryRoles.filter(r => r !== role)
        : [...prev.secondaryRoles, role],
    }));
  };

  const toggleWorkingDay = (day: string) => {
    setFormData(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter(d => d !== day)
        : [...prev.workingDays, day],
    }));
  };

  // Auto-suggest department when primary role changes
  useEffect(() => {
    if (formData.primaryRole && departments.length > 0) {
      const suggestedDeptName = ROLE_DEPARTMENT_MAP[formData.primaryRole];
      if (suggestedDeptName) {
        const dept = departments.find(d => d.name.toLowerCase().includes(suggestedDeptName.toLowerCase()));
        if (dept) setFormData(prev => ({ ...prev, departmentId: dept.id }));
      }
    }
  }, [formData.primaryRole, departments]);

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1: {
        if (!(formData.email && formData.fullName && formData.payrollNumber)) return false;
        const errors = validateStaffForm({
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          payrollNumber: formData.payrollNumber,
        });
        if (errors.length > 0) {
          toast({ title: "Validation Error", description: errors[0].message, variant: "destructive" });
          return false;
        }
        return true;
      }
      case 2:
        return !!(formData.primaryRole);
      case 3:
        return formData.workingDays.length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    } else {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields before proceeding.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!formData.primaryRole) return;
    
    setIsSubmitting(true);
    try {
      // Call the admin-create-user edge function
      const { data: { session } } = await supabase.auth.getSession();
      
      const allRoles = [formData.primaryRole, ...formData.secondaryRoles];
      
      const response = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          roles: allRoles,
          departmentId: formData.departmentId || null,
          adminUserId: session?.user?.id,
          payrollNumber: formData.payrollNumber,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast({
        title: "Staff Member Created",
        description: `${formData.fullName} has been successfully onboarded. A welcome email has been sent to ${formData.email}.`,
      });

      navigate("/staff");
    } catch (error: any) {
      toast({
        title: "Error Creating Staff Member",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleLabel = (value: string) => {
    return ROLES.find(r => r.value === value)?.label || value;
  };

  const getDepartmentName = (id: string) => {
    return departments.find(d => d.id === id)?.name || "Not Selected";
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Staff Onboarding</h1>
        <p className="text-muted-foreground mt-2">Add a new staff member to the system</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                  currentStep >= step.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {currentStep > step.id ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <step.icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`ml-2 text-sm font-medium hidden sm:inline ${
                  currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-12 sm:w-24 h-0.5 mx-2 ${
                    currentStep > step.id ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <Progress value={(currentStep / 4) * 100} className="h-2" />
      </div>

      {/* Step Content */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>
            {currentStep === 1 && "Enter the basic information for the new staff member"}
            {currentStep === 2 && "Assign role and department"}
            {currentStep === 3 && "Set work schedule preferences"}
            {currentStep === 4 && "Review and confirm the staff member details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="staff@cuea.edu"
                    value={formData.email}
                    onChange={e => updateFormData("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payrollNumber">Payroll Number *</Label>
                  <Input
                    id="payrollNumber"
                    placeholder="e.g. PAY-0001"
                    value={formData.payrollNumber}
                    onChange={e => updateFormData("payrollNumber", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    placeholder="Dr. John Doe"
                    value={formData.fullName}
                    onChange={e => updateFormData("fullName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="+254 700 000 000"
                    value={formData.phone}
                    onChange={e => updateFormData("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID</Label>
                  <Input
                    id="nationalId"
                    placeholder="12345678"
                    value={formData.nationalId}
                    onChange={e => updateFormData("nationalId", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Role & Department */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryRole">Primary Role *</Label>
                  <Select
                    value={formData.primaryRole}
                    onValueChange={value => updateFormData("primaryRole", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select primary role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department *</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={value => updateFormData("departmentId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Secondary Roles (Optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.filter(r => r.value !== formData.primaryRole).map(role => (
                    <Badge
                      key={role.value}
                      variant={formData.secondaryRoles.includes(role.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleSecondaryRole(role.value)}
                    >
                      {role.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input
                    id="specialization"
                    placeholder="e.g., Cardiology, Pediatrics"
                    value={formData.specialization}
                    onChange={e => updateFormData("specialization", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input
                    id="licenseNumber"
                    placeholder="Medical license number"
                    value={formData.licenseNumber}
                    onChange={e => updateFormData("licenseNumber", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Working Days</Label>
                <div className="flex flex-wrap gap-2">
                  {WORKING_DAYS.map(day => (
                    <Badge
                      key={day}
                      variant={formData.workingDays.includes(day) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleWorkingDay(day)}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shift">Shift Preference</Label>
                <Select
                  value={formData.shiftPreference}
                  onValueChange={value => updateFormData("shiftPreference", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map(shift => (
                      <SelectItem key={shift} value={shift}>
                        {shift}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information about the staff member..."
                  value={formData.notes}
                  onChange={e => updateFormData("notes", e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Full Name:</span>
                      <span className="font-medium">{formData.fullName || "Not provided"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{formData.email || "Not provided"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="font-medium">{formData.phone || "Not provided"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">National ID:</span>
                      <span className="font-medium">{formData.nationalId || "Not provided"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payroll Number:</span>
                      <span className="font-medium">{formData.payrollNumber || "Not provided"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Role & Department
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Primary Role:</span>
                      <Badge>{getRoleLabel(formData.primaryRole)}</Badge>
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Secondary Roles:</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {formData.secondaryRoles.length > 0 ? (
                          formData.secondaryRoles.map(role => (
                            <Badge key={role} variant="outline">{getRoleLabel(role)}</Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Department:</span>
                      <span className="font-medium">{getDepartmentName(formData.departmentId)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Specialization:</span>
                      <span className="font-medium">{formData.specialization || "Not provided"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">License:</span>
                      <span className="font-medium">{formData.licenseNumber || "Not provided"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-muted-foreground">Working Days:</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {formData.workingDays.map(day => (
                          <Badge key={day} variant="outline">{day.slice(0, 3)}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shift:</span>
                      <span className="font-medium">{formData.shiftPreference}</span>
                    </div>
                    {formData.notes && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground">Notes:</span>
                        <p className="mt-1">{formData.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Upon confirmation, a welcome email will be sent to <strong>{formData.email}</strong> with login credentials.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 1 ? () => navigate("/staff") : handleBack}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 1 ? "Cancel" : "Back"}
        </Button>

        {currentStep < 4 ? (
          <Button onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Create Staff Member
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
