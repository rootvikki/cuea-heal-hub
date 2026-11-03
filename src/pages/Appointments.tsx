import { nextTicketNumber } from "@/lib/tickets";
import { visitPaymentModeFor } from "@/lib/billing";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Plus, ClipboardList, Search, User } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Appointment {
  id: string;
  appointment_date: string;
  status: string;
  reason: string;
  patient_id: string;
  department_id: string;
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
  const [patientSearch, setPatientSearch] = useState("");
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
      .select("*, patients!inner(patient_id, user_id, profiles:profiles!inner(full_name)), departments!inner(name)")
      .gte("appointment_date", dateStr)
      .lt("appointment_date", `${dateStr}T23:59:59`)
      .order("appointment_date");

    if (error) {
      console.error("Error fetching appointments:", error);
    } else {
      const mapped = (data || []).map((apt: any) => ({
        ...apt,
        patients: {
          patient_id: apt.patients?.patient_id,
          profiles: apt.patients?.profiles,
        },
        departments: apt.departments,
      }));
      setAppointments(mapped as Appointment[]);
    }
    setLoading(false);
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("*");
    setDepartments(data || []);
  };

  const fetchPatients = async () => {
    const { data } = await supabase
      .from("patients")
      .select("id, patient_id, user_id, profiles:profiles!inner(full_name)");
    if (data) {
      const mapped = (data as any[]).map((p) => ({
        ...p,
        profile: p.profiles,
      }));
      setPatients(mapped);
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (!patientSearch) return true;
    const term = patientSearch.toLowerCase();
    return (
      p.patient_id?.toLowerCase().includes(term) ||
      p.profile?.full_name?.toLowerCase().includes(term)
    );
  });

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
      setPatientSearch("");
      fetchAppointments();
    }
  };

  const handleCheckInFromAppointment = async (appointment: Appointment) => {
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

    const ticketNumber = await nextTicketNumber();
    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: patientRecord.id,
      department_id: appointment.department_id,
      priority: 1,
      status: "triage",
      workflow_stage: "triage",
      appointment_id: appointment.id,
      payment_mode: await visitPaymentModeFor(patientRecord.id),
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appointment.id);
      toast({ title: "Patient checked in", description: `Ticket ${ticketNumber} — awaiting Triage` });
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            Schedule and manage patient appointments
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setPatientSearch(""); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-12 px-6 text-base">
              <Plus className="h-5 w-5" />
              New Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg">Schedule Appointment</DialogTitle>
              <DialogDescription>Create a new appointment for a patient</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Patient *</Label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or OPD number..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
                <Select value={formData.patientId} onValueChange={(value) => setFormData({ ...formData, patientId: value })}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPatients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {patient.patient_id} — {patient.profile?.full_name}
                        </div>
                      </SelectItem>
                    ))}
                    {filteredPatients.length === 0 && (
                      <div className="p-2 text-sm text-muted-foreground text-center">No patients found</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Department *</Label>
                <Select value={formData.departmentId} onValueChange={(value) => setFormData({ ...formData, departmentId: value })}>
                  <SelectTrigger className="h-12 text-base">
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
                <Label className="text-sm font-semibold">Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={formData.appointmentDate}
                  onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                  required
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Reason for Visit</Label>
                <Textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g., General checkup, Follow-up, Prescription refill..."
                  rows={3}
                  className="text-base"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-11 px-5">
                  Cancel
                </Button>
                <Button type="submit" className="h-11 px-6">Schedule</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
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
