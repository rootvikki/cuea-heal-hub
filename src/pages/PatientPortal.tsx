import { useState, useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Calendar, 
  TestTube, 
  CreditCard, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  User,
  Pill,
  MessageSquare
} from "lucide-react";
import FeedbackForm from "@/components/FeedbackForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabOrderTimeline } from "@/components/LabOrderTimeline";
import { PrescriptionTimeline } from "@/components/PrescriptionTimeline";

interface PatientData {
  id: string;
  patient_id: string;
  user_id: string;
}

interface Appointment {
  id: string;
  appointment_date: string;
  status: string;
  reason: string | null;
  notes: string | null;
  department: { name: string } | null;
  doctor: { 
    id: string;
    specialization: string | null;
    profile?: { full_name: string } | null;
  } | null;
}

interface LabResult {
  id: string;
  created_at: string;
  status: string;
  result_value: string | null;
  result_notes: string | null;
  test: { test_name: string; normal_range: string | null; unit: string | null } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  created_at: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: string;
}

interface Prescription {
  id: string;
  created_at: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  dispensed: boolean;
}

const PatientPortal = () => {
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch patient record
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (patientError) throw patientError;
      if (!patientData) {
        setLoading(false);
        return;
      }

      setPatient(patientData);

      // Fetch all patient data in parallel
      const [appointmentsRes, labResultsRes, invoicesRes, prescriptionsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select(`
            *,
            department:departments(name),
            doctor:staff(id, specialization)
          `)
          .eq("patient_id", patientData.id)
          .order("appointment_date", { ascending: false }),
        
        supabase
          .from("lab_orders")
          .select(`
            *,
            test:lab_tests_catalog(test_name, normal_range, unit)
          `)
          .eq("patient_id", patientData.id)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("invoices")
          .select("*")
          .eq("patient_id", patientData.id)
          .order("created_at", { ascending: false }),
        
        supabase
          .from("prescriptions")
          .select("*")
          .eq("patient_id", patientData.id)
          .order("created_at", { ascending: false })
      ]);

      if (appointmentsRes.data) setAppointments(appointmentsRes.data);
      if (labResultsRes.data) setLabResults(labResultsRes.data);
      if (invoicesRes.data) setInvoices(invoicesRes.data);
      if (prescriptionsRes.data) setPrescriptions(prescriptionsRes.data);

    } catch (error) {
      console.error("Error fetching patient data:", error);
      toast.error("Failed to load patient data");
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedInvoice || !phoneNumber) return;

    setProcessingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: {
          phoneNumber: phoneNumber,
          amount: selectedInvoice.balance,
          invoiceId: selectedInvoice.id,
          accountReference: selectedInvoice.invoice_number
        }
      });

      if (error) throw error;

      toast.success("Payment request sent! Check your phone to complete the transaction.");
      setPaymentDialogOpen(false);
      setPhoneNumber("");
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("Failed to initiate payment");
    } finally {
      setProcessingPayment(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      scheduled: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
      confirmed: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      completed: { variant: "secondary", icon: <CheckCircle className="h-3 w-3" /> },
      cancelled: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
      pending: { variant: "outline", icon: <Clock className="h-3 w-3" /> },
      paid: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
      partial: { variant: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
    };
    const config = variants[status] || { variant: "outline" as const, icon: null };
    return (
      <Badge variant={config.variant} className="gap-1">
        {config.icon}
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  if (!patient) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 p-6">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <User className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No Patient Record Found</h2>
                <p className="text-muted-foreground text-center">
                  Please contact the reception to register as a patient.
                </p>
              </CardContent>
            </Card>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2"><User className="h-7 w-7 text-primary" /> Patient Portal</h1>
            <p className="text-muted-foreground mt-1">Patient ID: {patient.patient_id}</p>
          </div>

          <Tabs defaultValue="appointments" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
              <TabsTrigger value="appointments" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Appointments</span>
              </TabsTrigger>
              <TabsTrigger value="labs" className="gap-2">
                <TestTube className="h-4 w-4" />
                <span className="hidden sm:inline">Lab Results</span>
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="gap-2">
                <Pill className="h-4 w-4" />
                <span className="hidden sm:inline">Prescriptions</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Billing</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Feedback</span>
              </TabsTrigger>
            </TabsList>

            {/* Appointments Tab */}
            <TabsContent value="appointments">
              <Card>
                <CardHeader>
                  <CardTitle>My Appointments</CardTitle>
                  <CardDescription>View your upcoming and past appointments</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {appointments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No appointments found</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {appointments.map((apt) => (
                          <Card key={apt.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">
                                    {format(new Date(apt.appointment_date), "EEEE, MMMM d, yyyy")}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(apt.appointment_date), "h:mm a")}
                                  </p>
                                  {apt.department && (
                                    <p className="text-sm mt-1">{apt.department.name}</p>
                                  )}
                                  {apt.reason && (
                                    <p className="text-sm text-muted-foreground mt-1">{apt.reason}</p>
                                  )}
                                </div>
                                {getStatusBadge(apt.status)}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>


            {/* Lab Results Tab */}
            <TabsContent value="labs">
              <Card>
                <CardHeader>
                  <CardTitle>Lab Results</CardTitle>
                  <CardDescription>View your laboratory test results</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {labResults.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No lab results found</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {labResults.map((lab) => (
                          <Card key={lab.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium">{lab.test?.test_name || "Unknown Test"}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(lab.created_at), "MMMM d, yyyy")}
                                  </p>
                                </div>
                                {getStatusBadge(lab.status)}
                              </div>
                              <LabOrderTimeline order={lab} />
                              {lab.status === "completed" && (
                                <div className="mt-2 p-3 bg-muted rounded-md">
                                  <div className="flex justify-between">
                                    <span className="font-medium">Result:</span>
                                    <span>
                                      {lab.result_value} {lab.test?.unit}
                                    </span>
                                  </div>
                                  {lab.test?.normal_range && (
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                      <span>Normal Range:</span>
                                      <span>{lab.test.normal_range}</span>
                                    </div>
                                  )}
                                  {lab.result_notes && (
                                    <p className="text-sm mt-2">{lab.result_notes}</p>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Prescriptions Tab */}
            <TabsContent value="prescriptions">
              <Card>
                <CardHeader>
                  <CardTitle>My Prescriptions</CardTitle>
                  <CardDescription>View your prescribed medications</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {prescriptions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Pill className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No prescriptions found</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {prescriptions.map((rx) => (
                          <Card key={rx.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium">{rx.medication_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(rx.created_at || ""), "MMMM d, yyyy")}
                                  </p>
                                </div>
                                <Badge variant={rx.dispensed ? "default" : "outline"}>
                                  {rx.dispensed ? "Dispensed" : "Sent to Pharmacy"}
                                </Badge>
                              </div>
                              <PrescriptionTimeline prescription={rx} />
                              <div className="grid grid-cols-3 gap-2 text-sm mt-2">
                                <div>
                                  <span className="text-muted-foreground">Dosage:</span>
                                  <p>{rx.dosage}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Frequency:</span>
                                  <p>{rx.frequency}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Duration:</span>
                                  <p>{rx.duration}</p>
                                </div>
                              </div>
                              {rx.instructions && (
                                <p className="text-sm mt-2 text-muted-foreground">
                                  {rx.instructions}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>My Bills</CardTitle>
                  <CardDescription>View and pay your invoices</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {invoices.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No invoices found</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {invoices.map((inv) => (
                          <Card key={inv.id}>
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <p className="font-medium">{inv.invoice_number}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(inv.created_at), "MMMM d, yyyy")}
                                  </p>
                                </div>
                                {getStatusBadge(inv.status)}
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total</span>
                                  <p className="font-medium">KES {inv.total_amount.toLocaleString()}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Paid</span>
                                  <p className="font-medium text-green-600">
                                    KES {(inv.amount_paid || 0).toLocaleString()}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Balance</span>
                                  <p className="font-medium text-destructive">
                                    KES {(inv.balance || 0).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              {inv.balance > 0 && (
                                <Button
                                  className="w-full mt-4"
                                  onClick={() => {
                                    setSelectedInvoice(inv);
                                    setPaymentDialogOpen(true);
                                  }}
                                >
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Pay Now
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Feedback Tab */}
            <TabsContent value="feedback">
              <FeedbackForm patientId={patient.id} />
            </TabsContent>
          </Tabs>

          {/* Payment Dialog */}
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pay Invoice</DialogTitle>
                <DialogDescription>
                  Pay {selectedInvoice?.invoice_number} - KES {selectedInvoice?.balance?.toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">M-Pesa Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="254712345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your phone number in international format (254...)
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={handlePayment}
                  disabled={!phoneNumber || processingPayment}
                >
                  {processingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Send M-Pesa Request
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default PatientPortal;
