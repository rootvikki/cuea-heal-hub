import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus, ClipboardList } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Appointment {
  id: string;
  appointment_date: string;
  status: string;
  reason: string;
  patients: {
    patient_id: string;
    profiles: { full_name: string };
  };
  departments: { name: string };
}

const Appointments = () => {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [departments, setDepartments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "",
    departmentId: "",
    appointmentDate: "",
    reason: "",
  });

  useEffect(() => {
    fetchAppointments();
    fetchDepartments();
    fetchPatients();
  }, [selectedDate]);

  const fetchAppointments = async () => {
    setLoading(true);
    const dateStr = selectedDate?.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, status, reason, department_id")
      .gte("appointment_date", dateStr)
      .lt("appointment_date", `${dateStr}T23:59:59`)
      .order("appointment_date");

    if (error) {
      console.error("Error fetching appointments:", error);
    } else {
      // Fetch patient and department info separately
      const appointmentIds = data?.map(a => a.id) || [];
      const patientPromises = data?.map(async (apt: any) => {
        const { data: patientData } = await supabase
          .from("patients")
          .select("patient_id, user_id")
          .eq("id", apt.patient_id)
          .single();
        
        if (patientData) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patientData.user_id)
            .single();
          
          return { ...apt, patients: { patient_id: patientData.patient_id, profiles: profileData } };
        }
        return apt;
      }) || [];

      const appointmentsWithData = await Promise.all(patientPromises);
      
      // Fetch departments
      const deptPromises = appointmentsWithData.map(async (apt: any) => {
        const { data: deptData } = await supabase
          .from("departments")
          .select("name")
          .eq("id", apt.department_id)
          .single();
        
        return { ...apt, departments: deptData };
      });

      const finalAppointments = await Promise.all(deptPromises);
      setAppointments(finalAppointments as any);
    }
    setLoading(false);
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("*");
    setDepartments(data || []);
  };

  const fetchPatients = async () => {
    const { data } = await supabase.from("patients").select("id, patient_id, user_id");
    if (data) {
      const patientsWithProfiles = await Promise.all(
        data.map(async (patient) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient.user_id)
            .single();
          return { ...patient, profile };
        })
      );
      setPatients(patientsWithProfiles);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { error } = await supabase.from("appointments").insert({
      patient_id: formData.patientId,
      department_id: formData.departmentId,
      appointment_date: formData.appointmentDate,
      reason: formData.reason,
      status: "scheduled",
    });

    if (error) {
      toast({
        title: "Error creating appointment",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Appointment created",
        description: "The appointment has been scheduled successfully.",
      });
      setDialogOpen(false);
      setFormData({ patientId: "", departmentId: "", appointmentDate: "", reason: "" });
      fetchAppointments();
    }
  };

  const handleCheckInFromAppointment = async (appointment: Appointment) => {
    // Check for duplicate active ticket
    const patientId = (appointment as any).patient_id_raw || appointment.patients?.patient_id;
    // We need the patient UUID (not OPD number)
    const { data: patientRecord } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", appointment.patients?.patient_id)
      .single();

    if (!patientRecord) {
      toast({ title: "Error", description: "Patient record not found", variant: "destructive" });
      return;
    }

    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("id, ticket_number")
      .eq("patient_id", patientRecord.id)
      .neq("status", "checked_out")
      .limit(1);

    if (existingTickets && existingTickets.length > 0) {
      toast({
        title: "Already checked in",
        description: `This patient already has an active ticket (${existingTickets[0].ticket_number}).`,
        variant: "destructive",
      });
      return;
    }

    const ticketNumber = `T-${Date.now().toString().slice(-6)}`;
    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: patientRecord.id,
      department_id: (appointment as any).department_id,
      priority: 1,
      status: "checked_in",
      workflow_stage: "checked_in",
      appointment_id: appointment.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Update appointment status
      await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appointment.id);
      toast({ title: "Patient checked in", description: `Ticket: ${ticketNumber}` });
      fetchAppointments();
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-status-pending",
      confirmed: "bg-primary",
      in_progress: "bg-status-in-progress",
      completed: "bg-status-completed",
      cancelled: "bg-status-cancelled",
    };
    return colors[status] || "bg-muted";
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage patient appointments
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Appointment</DialogTitle>
              <DialogDescription>Create a new appointment for a patient</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={formData.patientId} onValueChange={(value) => setFormData({ ...formData, patientId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.patient_id} - {patient.profile?.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={formData.departmentId} onValueChange={(value) => setFormData({ ...formData, departmentId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.appointmentDate}
                  onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Reason for Visit</Label>
                <Input
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g., General checkup, Follow-up"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Schedule</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Appointments for {selectedDate?.toLocaleDateString()}
            </CardTitle>
            <CardDescription>
              {appointments.length} appointment(s) scheduled
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading appointments...</p>
            ) : appointments.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No appointments scheduled for this date.
              </p>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {new Date(apt.appointment_date).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <Badge className={getStatusColor(apt.status)}>
                            {apt.status}
                          </Badge>
                        </div>
                        <p className="text-sm">
                          <span className="font-medium">{apt.patients?.profiles?.full_name}</span>
                          {" "}({apt.patients?.patient_id})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {apt.departments?.name}
                        </p>
                        {apt.reason && (
                          <p className="text-sm text-muted-foreground">{apt.reason}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        {apt.status === "scheduled" && (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => handleCheckInFromAppointment(apt)}>
                            <ClipboardList className="h-3 w-3" /> Check-in
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Appointments;
