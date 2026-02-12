import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, ArrowRight, Radio } from "lucide-react";
import { toast as sonnerToast } from "sonner";

const Queue = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "",
    departmentId: "",
    priority: "1",
  });

  useEffect(() => {
    fetchTickets();
    fetchDepartments();
    fetchPatients();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("tickets-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        (payload) => {
          console.log("Realtime update:", payload);
          
          // Show toast notification for status changes
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            const newStatus = (payload.new as any).status;
            const oldStatus = (payload.old as any).status;
            if (newStatus !== oldStatus) {
              sonnerToast.info(`Queue updated: Patient moved to ${newStatus.replace(/_/g, " ")}`);
            }
          } else if (payload.eventType === "INSERT") {
            sonnerToast.success("New patient checked in");
          }
          
          fetchTickets();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .neq("status", "checked_out")
      .order("priority", { ascending: false })
      .order("checked_in_at", { ascending: true });

    if (data) {
      const ticketsWithDetails = await Promise.all(
        data.map(async (ticket) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", ticket.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient?.user_id)
            .single();

          const { data: dept } = await supabase
            .from("departments")
            .select("name")
            .eq("id", ticket.department_id)
            .single();

          return {
            ...ticket,
            patient: { ...patient, profile },
            department: dept,
          };
        })
      );
      setTickets(ticketsWithDetails);
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

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check for duplicate active ticket
    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("id, ticket_number")
      .eq("patient_id", formData.patientId)
      .neq("status", "checked_out")
      .limit(1);

    if (existingTickets && existingTickets.length > 0) {
      toast({
        title: "Duplicate ticket",
        description: `This patient already has an active ticket (${existingTickets[0].ticket_number}). Complete or check out the existing ticket first.`,
        variant: "destructive",
      });
      return;
    }

    // Check patient visit_reason for dental auto-routing
    const { data: patientData } = await supabase
      .from("patients")
      .select("visit_reason")
      .eq("id", formData.patientId)
      .single();

    const isDental = patientData?.visit_reason === "dental";
    const initialStatus = isDental ? "at_dental" : "checked_in";

    const ticketNumber = `T-${Date.now().toString().slice(-6)}`;

    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: formData.patientId,
      department_id: formData.departmentId,
      priority: parseInt(formData.priority),
      status: initialStatus,
      workflow_stage: initialStatus,
    });

    if (error) {
      toast({
        title: "Error creating ticket",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Patient checked in",
        description: isDental
          ? `Ticket ${ticketNumber} — routed to Dental`
          : `Ticket number: ${ticketNumber}`,
      });
      setDialogOpen(false);
      setFormData({ patientId: "", departmentId: "", priority: "1" });
    }
  };

  type TicketStatus = "checked_in" | "triage" | "waiting_for_doctor" | "in_consult" | "at_pharmacy" | "at_billing" | "checked_out" | "order_placed_lab" | "order_placed_imaging" | "at_lab" | "at_imaging";

  const updateTicketStatus = async (ticketId: string, newStatus: TicketStatus) => {
    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus, workflow_stage: newStatus })
      .eq("id", ticketId);

    if (error) {
      toast({
        title: "Error updating ticket",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Ticket updated",
        description: "Status changed successfully",
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      checked_in: "bg-muted",
      triage: "bg-warning",
      waiting_for_doctor: "bg-status-pending",
      in_consult: "bg-status-in-progress",
      at_dental: "bg-status-in-progress",
      order_placed_lab: "bg-primary",
      order_placed_imaging: "bg-primary",
      at_lab: "bg-accent",
      at_imaging: "bg-accent",
      at_pharmacy: "bg-success",
      at_billing: "bg-secondary",
      checked_out: "bg-status-completed",
    };
    return colors[status] || "bg-muted";
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 3) return <Badge variant="destructive">Emergency</Badge>;
    if (priority === 2) return <Badge className="bg-warning">High</Badge>;
    return <Badge variant="outline">Normal</Badge>;
  };

  const statusFlow: TicketStatus[] = [
    "checked_in",
    "triage",
    "waiting_for_doctor",
    "in_consult",
    "at_pharmacy",
    "at_billing",
    "checked_out",
  ];

  type TicketStatusDental = TicketStatus | "at_dental";

  const getDisplayFlow = (ticket: any): string[] => {
    const stage = ticket.workflow_stage || ticket.status;
    if (stage === "at_dental") {
      return ["checked_in", "triage", "at_dental", "at_pharmacy", "at_billing", "checked_out"];
    }
    const base = [...statusFlow] as string[];
    if (["at_lab", "at_imaging"].includes(stage)) {
      const idx = base.indexOf("in_consult");
      base.splice(idx + 1, 0, stage);
    }
    return base;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Patient Queue</h1>
            {isLive && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Real-time patient flow management
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Check-in Patient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Check-in Patient</DialogTitle>
              <DialogDescription>Generate a queue ticket for the patient</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCheckIn} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                  required
                >
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
                <Select
                  value={formData.departmentId}
                  onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                  required
                >
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
                <Label>Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Normal</SelectItem>
                    <SelectItem value="2">High</SelectItem>
                    <SelectItem value="3">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Check-in</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Active Tickets ({tickets.length})
          </CardTitle>
          <CardDescription>Real-time patient queue status</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading queue...</p>
          ) : tickets.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No patients in queue</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold">{ticket.ticket_number}</span>
                        {getPriorityBadge(ticket.priority)}
                      </div>
                      <p className="font-medium">
                        {ticket.patient?.profile?.full_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ticket.patient?.patient_id} • {ticket.department?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Checked in: {new Date(ticket.checked_in_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="flex gap-1 flex-wrap items-center">
                    {getDisplayFlow(ticket).map((status, idx, arr) => {
                      const currentStage = ticket.workflow_stage || ticket.status;
                      const currentIdx = arr.indexOf(currentStage);
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={status} className="flex items-center gap-1">
                          <div
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              isCurrent
                                ? "bg-primary text-primary-foreground"
                                : isCompleted
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status.replace(/_/g, " ")}
                          </div>
                          {idx < arr.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Queue;
