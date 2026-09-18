import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, ArrowRight, Radio, Search, User } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { inferPathFromStage, WorkflowTimeline } from "@/components/WorkflowTimeline";

async function fetchQueueTickets() {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, patients!inner(patient_id, user_id, profiles!inner(full_name)), departments!inner(name)")
    .neq("status", "checked_out")
    .order("priority", { ascending: false })
    .order("checked_in_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((t: any) => ({
    ...t,
    patient: {
      patient_id: t.patients?.patient_id,
      user_id: t.patients?.user_id,
      profile: { full_name: t.patients?.profiles?.full_name },
    },
    department: { name: t.departments?.name },
  }));
}

async function fetchAllPatients() {
  const { data, error } = await supabase
    .from("patients")
    .select("id, patient_id, user_id, visit_reason, profiles!inner(full_name)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((p: any) => ({
    ...p,
    profile: { full_name: p.profiles?.full_name },
  }));
}

const PRIORITY_OPTIONS = [
  { value: "1", label: "Normal", color: "bg-muted border-border text-foreground", description: "Standard queue priority" },
  { value: "2", label: "High", color: "bg-warning/15 border-[hsl(var(--warning))] text-[hsl(var(--warning))]", description: "Prioritized in queue" },
  { value: "3", label: "Emergency", color: "bg-destructive/15 border-destructive text-destructive", description: "Immediate attention" },
];

const Queue = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [formData, setFormData] = useState({
    patientId: "",
    departmentId: "",
    priority: "1",
  });

  const { data: tickets = [], isLoading: loading } = useQuery({
    queryKey: ["queue-tickets"],
    queryFn: fetchQueueTickets,
    refetchInterval: 30000,
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["all-patients-for-checkin"],
    queryFn: fetchAllPatients,
    staleTime: 60000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*");
      return data || [];
    },
    staleTime: 300000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("tickets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, (payload) => {
        if (payload.eventType === "UPDATE" && payload.new && payload.old) {
          const newStatus = (payload.new as any).status;
          const oldStatus = (payload.old as any).status;
          if (newStatus !== oldStatus) {
            sonnerToast.info(`Queue updated: Patient moved to ${newStatus.replace(/_/g, " ")}`);
          }
        } else if (payload.eventType === "INSERT") {
          sonnerToast.success("New patient checked in");
        }
        queryClient.invalidateQueries({ queryKey: ["queue-tickets"] });
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const filteredPatients = patients.filter((p: any) => {
    if (!patientSearch) return true;
    const s = patientSearch.toLowerCase();
    return p.patient_id?.toLowerCase().includes(s) || p.profile?.full_name?.toLowerCase().includes(s);
  });

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: existingTickets } = await supabase
      .from("tickets")
      .select("id, ticket_number")
      .eq("patient_id", formData.patientId)
      .neq("status", "checked_out")
      .limit(1);

    if (existingTickets && existingTickets.length > 0) {
      toast({
        title: "Duplicate ticket",
        description: `This patient already has an active ticket (${existingTickets[0].ticket_number}).`,
        variant: "destructive",
      });
      return;
    }

    const selectedPatient = patients.find((p: any) => p.id === formData.patientId);
    const isDental = selectedPatient?.visit_reason === "dental";
    const initialStatus = isDental ? "at_dental" : "triage";

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
      toast({ title: "Error creating ticket", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Patient checked in",
        description: isDental ? `Ticket ${ticketNumber} — routed to Dental` : `Ticket ${ticketNumber} — awaiting Triage`,
      });
      setDialogOpen(false);
      setFormData({ patientId: "", departmentId: "", priority: "1" });
      setPatientSearch("");
      queryClient.invalidateQueries({ queryKey: ["queue-tickets"] });
    }
  };

  type TicketStatus = "checked_in" | "triage" | "triage_in_progress" | "waiting_for_doctor" | "in_consult" | "at_pharmacy" | "at_billing" | "checked_out" | "order_placed_lab" | "order_placed_imaging" | "at_lab" | "at_imaging";

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      checked_in: "bg-muted", triage: "bg-warning", triage_in_progress: "bg-status-in-progress", waiting_for_doctor: "bg-status-pending",
      in_consult: "bg-status-in-progress", at_dental: "bg-status-in-progress",
      order_placed_lab: "bg-primary", order_placed_imaging: "bg-primary",
      at_lab: "bg-accent", at_imaging: "bg-accent", at_pharmacy: "bg-success",
      at_billing: "bg-secondary", checked_out: "bg-status-completed",
    };
    return colors[status] || "bg-muted";
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 3) return <Badge variant="destructive">Emergency</Badge>;
    if (priority === 2) return <Badge className="bg-warning">High</Badge>;
    return <Badge variant="outline">Normal</Badge>;
  };

  const getDisplayFlow = (ticket: any): string[] => {
    const stage = ticket.workflow_stage || ticket.status;
    return inferPathFromStage(stage);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Patient Queue</h1>
            {isLive && (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">Real-time patient flow management</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-12 px-6 text-base"><Plus className="h-5 w-5" /> Check-in Patient</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg">Check-in Patient</DialogTitle>
              <DialogDescription>Generate a queue ticket for the patient</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCheckIn} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Search Patient</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or OPD number..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Patient *</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                  required
                >
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {filteredPatients.slice(0, 50).map((patient: any) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {patient.patient_id} — {patient.profile?.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Department *</Label>
                <Select value={formData.departmentId} onValueChange={(value) => setFormData({ ...formData, departmentId: value })} required>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((dept: any) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
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
                      onClick={() => setFormData({ ...formData, priority: opt.value })}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        formData.priority === opt.value
                          ? `${opt.color} ring-2 ring-offset-1 ring-current font-bold`
                          : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[10px] mt-0.5 opacity-70">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-11 px-5">Cancel</Button>
                <Button type="submit" className="h-11 px-6">Check-in</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Active Tickets ({tickets.length})
          </CardTitle>
          <CardDescription>Real-time patient queue status</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading queue...</p>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No patients in queue</p>
              <p className="text-sm mt-1">Check in a patient to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket: any) => (
                <div key={ticket.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold">{ticket.ticket_number}</span>
                        {getPriorityBadge(ticket.priority)}
                      </div>
                      <p className="font-medium">{ticket.patient?.profile?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{ticket.patient?.patient_id} • {ticket.department?.name}</p>
                      <p className="text-xs text-muted-foreground">Checked in: {new Date(ticket.checked_in_at).toLocaleString()}</p>
                      <WaitTimeBadge checkedInAt={ticket.checked_in_at} />
                    </div>
                    <Badge className={getStatusColor(ticket.status)}>
                      {ticket.status === "triage" ? "Awaiting Triage" : ticket.status === "triage_in_progress" ? "Triage in Progress" : ticket.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <WorkflowTimeline
                    currentStage={ticket.workflow_stage || ticket.status}
                    visitPath={getDisplayFlow(ticket)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const WaitTimeBadge = ({ checkedInAt }: { checkedInAt: string }) => {
  const mins = Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);
  const color = mins >= 60 ? "bg-destructive text-destructive-foreground" : mins >= 30 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground";
  const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  return (
    <Badge className={`${color} text-xs mt-1`}>
      ⏱ Waiting: {label}
    </Badge>
  );
};

export default Queue;
