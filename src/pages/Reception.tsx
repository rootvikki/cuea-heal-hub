import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import {
  Search, UserPlus, ClipboardList, Calendar, Radio, User, ArrowRight, Clock, Plus,
} from "lucide-react";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import { inferPathFromStage, WorkflowTimeline } from "@/components/WorkflowTimeline";

const PRIORITY_OPTIONS = [
  { value: "1", label: "Normal", color: "bg-muted border-border text-foreground" },
  { value: "2", label: "High", color: "bg-warning/15 border-[hsl(var(--warning))] text-[hsl(var(--warning))]" },
  { value: "3", label: "Emergency", color: "bg-destructive/15 border-destructive text-destructive" },
];

const Reception = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [selectedPatientForCheckIn, setSelectedPatientForCheckIn] = useState<any>(null);
  const [checkInForm, setCheckInForm] = useState({ departmentId: "", priority: "1" });
  const [appointmentForm, setAppointmentForm] = useState({ patientId: "", departmentId: "", appointmentDate: "", reason: "" });
  const [aptPatientSearch, setAptPatientSearch] = useState("");

  // Fetch patients
  const { data: patients = [] } = useQuery({
    queryKey: ["reception-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, user_id, visit_reason, national_id, profiles!inner(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, profile: { full_name: p.profiles?.full_name } }));
    },
    staleTime: 30000,
  });

  // Fetch departments
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*");
      return data || [];
    },
    staleTime: 300000,
  });

  // Fetch today's appointments
  const { data: todayAppointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["today-appointments"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients!inner(id, patient_id, user_id, visit_reason, profiles!inner(full_name)), departments!inner(name)")
        .gte("appointment_date", today)
        .lt("appointment_date", `${today}T23:59:59`)
        .order("appointment_date");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch active queue tickets
  const { data: activeTickets = [] } = useQuery({
    queryKey: ["reception-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, patients!inner(patient_id, profiles!inner(full_name)), departments!inner(name)")
        .neq("status", "checked_out")
        .order("priority", { ascending: false })
        .order("checked_in_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        patient: { patient_id: t.patients?.patient_id, profile: { full_name: t.patients?.profiles?.full_name } },
        department: { name: t.departments?.name },
      }));
    },
    refetchInterval: 15000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("reception-tickets-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Search patients
  const searchResults = search.length >= 2
    ? patients.filter((p: any) => {
        const s = search.toLowerCase();
        return p.patient_id?.toLowerCase().includes(s) ||
          p.profile?.full_name?.toLowerCase().includes(s) ||
          p.national_id?.toLowerCase().includes(s);
      }).slice(0, 10)
    : [];

  // Open check-in dialog for a patient
  const openCheckIn = (patient: any) => {
    setSelectedPatientForCheckIn(patient);
    setCheckInForm({ departmentId: "", priority: "1" });
    setCheckInDialogOpen(true);
  };

  // Handle check-in
  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForCheckIn) return;

    const patientId = selectedPatientForCheckIn.id;

    const { data: existing } = await supabase
      .from("tickets")
      .select("id, ticket_number")
      .eq("patient_id", patientId)
      .neq("status", "checked_out")
      .limit(1);

    if (existing && existing.length > 0) {
      toast({ title: "Already checked in", description: `Active ticket: ${existing[0].ticket_number}`, variant: "destructive" });
      return;
    }

    const isDental = selectedPatientForCheckIn.visit_reason === "dental";
    const initialStatus = isDental ? "at_dental" : "checked_in";
    const ticketNumber = `T-${Date.now().toString().slice(-6)}`;

    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: patientId,
      department_id: checkInForm.departmentId,
      priority: parseInt(checkInForm.priority),
      status: initialStatus,
      workflow_stage: initialStatus,
    });

    if (error) {
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Patient checked in", description: isDental ? `${ticketNumber} → Dental` : `Ticket: ${ticketNumber}` });
      setCheckInDialogOpen(false);
      setSelectedPatientForCheckIn(null);
      setSearch("");
      queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
    }
  };

  // Check-in from appointment
  const handleCheckInFromAppointment = async (apt: any) => {
    const patientId = apt.patients?.id;
    if (!patientId) { toast({ title: "Error", description: "Patient not found", variant: "destructive" }); return; }

    const { data: existing } = await supabase
      .from("tickets").select("id, ticket_number").eq("patient_id", patientId).neq("status", "checked_out").limit(1);

    if (existing && existing.length > 0) {
      toast({ title: "Already checked in", description: `Active ticket: ${existing[0].ticket_number}`, variant: "destructive" });
      return;
    }

    const isDental = apt.patients?.visit_reason === "dental";
    const ticketNumber = `T-${Date.now().toString().slice(-6)}`;

    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: patientId,
      department_id: apt.department_id,
      priority: 1,
      status: isDental ? "at_dental" : "checked_in",
      workflow_stage: isDental ? "at_dental" : "checked_in",
      appointment_id: apt.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("appointments").update({ status: "confirmed" }).eq("id", apt.id);
      toast({ title: "Patient checked in", description: `Ticket: ${ticketNumber}` });
      refetchAppointments();
      queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
    }
  };

  // Schedule appointment
  const handleScheduleAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("appointments").insert({
      patient_id: appointmentForm.patientId,
      department_id: appointmentForm.departmentId,
      appointment_date: appointmentForm.appointmentDate,
      reason: appointmentForm.reason,
      status: "scheduled",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Appointment scheduled" });
      setAppointmentDialogOpen(false);
      setAppointmentForm({ patientId: "", departmentId: "", appointmentDate: "", reason: "" });
      setAptPatientSearch("");
      refetchAppointments();
    }
  };

  const filteredAptPatients = patients.filter((p: any) => {
    if (!aptPatientSearch) return true;
    const s = aptPatientSearch.toLowerCase();
    return p.patient_id?.toLowerCase().includes(s) || p.profile?.full_name?.toLowerCase().includes(s);
  });

  // After patient registration, auto-open check-in
  const handlePatientRegistered = () => {
    queryClient.invalidateQueries({ queryKey: ["reception-patients"] });
    toast({ title: "Patient registered", description: "You can now search and check them in." });
  };

  const waitMins = (checkedInAt: string) => Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Reception Desk</h1>
            {isLive && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">Search, register, and check-in patients</p>
        </div>
        <PatientRegistrationDialog onSuccess={handlePatientRegistered} />
      </div>

      {/* Section 1: Patient Search + Check-in */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5" /> Patient Search & Check-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, OPD number, or National ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-14 text-lg"
              autoFocus
            />
          </div>

          {search.length >= 2 && (
            <div className="space-y-2">
              {searchResults.length > 0 ? (
                searchResults.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{p.profile?.full_name}</p>
                        <p className="text-sm text-muted-foreground">{p.patient_id}{p.national_id ? ` • ID: ${p.national_id}` : ""}</p>
                      </div>
                    </div>
                    <Button onClick={() => openCheckIn(p)} className="gap-2">
                      <ClipboardList className="h-4 w-4" /> Check-in
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-muted-foreground">No patients found for "{search}"</p>
                  <PatientRegistrationDialog onSuccess={handlePatientRegistered} />
                </div>
              )}
            </div>
          )}

          {search.length < 2 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Type at least 2 characters to search patients
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section 2: Today's Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5" /> Today's Appointments ({todayAppointments.length})
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setAppointmentDialogOpen(true)}>
                <Plus className="h-4 w-4" /> Schedule
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">No appointments today</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {todayAppointments.map((apt: any) => (
                  <div key={apt.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {new Date(apt.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <Badge variant={apt.status === "scheduled" ? "outline" : "default"} className="text-xs">
                          {apt.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{apt.patients?.profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{apt.departments?.name}</p>
                    </div>
                    {apt.status === "scheduled" && (
                      <Button size="sm" onClick={() => handleCheckInFromAppointment(apt)} className="gap-1">
                        <ArrowRight className="h-3 w-3" /> Check-in
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Active Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" /> Active Queue ({activeTickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTickets.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">No patients in queue</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activeTickets.map((ticket: any) => {
                  const mins = waitMins(ticket.checked_in_at);
                  return (
                    <div key={ticket.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{ticket.ticket_number}</span>
                          <Badge variant="outline" className="text-xs">{ticket.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="text-sm">{ticket.patient?.profile?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{ticket.department?.name}</p>
                      </div>
                      <Badge className={`text-xs ${mins >= 60 ? "bg-destructive text-destructive-foreground" : mins >= 30 ? "bg-warning" : "bg-muted text-muted-foreground"}`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Check-in Dialog */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Check-in Patient</DialogTitle>
            <DialogDescription>
              {selectedPatientForCheckIn?.profile?.full_name} ({selectedPatientForCheckIn?.patient_id})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCheckIn} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Department *</Label>
              <Select value={checkInForm.departmentId} onValueChange={(v) => setCheckInForm({ ...checkInForm, departmentId: v })} required>
                <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Priority</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCheckInForm({ ...checkInForm, priority: opt.value })}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      checkInForm.priority === opt.value
                        ? `${opt.color} ring-2 ring-offset-1 ring-current font-bold`
                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {selectedPatientForCheckIn?.visit_reason === "dental" && (
              <Badge className="bg-primary/10 text-primary border-primary">Will be routed to Dental</Badge>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCheckInDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Check-in</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Appointment Dialog */}
      <Dialog open={appointmentDialogOpen} onOpenChange={(open) => { setAppointmentDialogOpen(open); if (!open) setAptPatientSearch(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
            <DialogDescription>Book a future appointment for a patient</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScheduleAppointment} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Patient *</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patient..." value={aptPatientSearch} onChange={(e) => setAptPatientSearch(e.target.value)} className="pl-10 h-12" />
              </div>
              <Select value={appointmentForm.patientId} onValueChange={(v) => setAppointmentForm({ ...appointmentForm, patientId: v })} required>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent>
                  {filteredAptPatients.slice(0, 50).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {p.patient_id} — {p.profile?.full_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Department *</Label>
              <Select value={appointmentForm.departmentId} onValueChange={(v) => setAppointmentForm({ ...appointmentForm, departmentId: v })} required>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Date & Time *</Label>
              <Input type="datetime-local" value={appointmentForm.appointmentDate} onChange={(e) => setAppointmentForm({ ...appointmentForm, appointmentDate: e.target.value })} required className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Reason</Label>
              <Textarea value={appointmentForm.reason} onChange={(e) => setAppointmentForm({ ...appointmentForm, reason: e.target.value })} placeholder="Reason for visit..." rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAppointmentDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Schedule</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reception;
