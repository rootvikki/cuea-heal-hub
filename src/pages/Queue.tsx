import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ClipboardList, Plus } from "lucide-react";
import { TicketWorkflowCard } from "@/components/workflow/TicketWorkflowCard";
import { VitalsEntry } from "@/components/workflow/VitalsEntry";
import { StageFilter } from "@/components/workflow/StageFilter";

const Queue = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentStage, setCurrentStage] = useState("all");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    patientId: "",
    departmentId: "",
    priority: "1",
  });

  useEffect(() => {
    fetchUserRoles();
    fetchTickets();
    fetchDepartments();
    fetchPatients();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("tickets-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
        },
        () => {
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUserRoles = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (data) {
      setUserRoles(data.map((r) => r.role));
    }
  };

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
            .maybeSingle();

          const { data: profile } = patient
            ? await supabase
                .from("profiles")
                .select("full_name")
                .eq("user_id", patient.user_id)
                .maybeSingle()
            : { data: null };

          const { data: dept } = await supabase
            .from("departments")
            .select("name")
            .eq("id", ticket.department_id)
            .maybeSingle();

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
            .maybeSingle();
          return { ...patient, profile };
        })
      );
      setPatients(patientsWithProfiles);
    }
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const ticketNumber = `T-${Date.now().toString().slice(-6)}`;

    const { error } = await supabase.from("tickets").insert({
      ticket_number: ticketNumber,
      patient_id: formData.patientId,
      department_id: formData.departmentId,
      priority: parseInt(formData.priority),
      status: "checked_in",
      workflow_stage: "checked_in",
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
        description: `Ticket number: ${ticketNumber}`,
      });
      setDialogOpen(false);
      setFormData({ patientId: "", departmentId: "", priority: "1" });
    }
  };

  const filteredTickets =
    currentStage === "all"
      ? tickets
      : tickets.filter((t) => t.status === currentStage);

  const stageCounts = tickets.reduce((acc: Record<string, number>, ticket) => {
    acc[ticket.status] = (acc[ticket.status] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Patient Queue</h1>
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

      <StageFilter
        currentStage={currentStage}
        onStageChange={setCurrentStage}
        stageCounts={stageCounts}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Active Tickets ({filteredTickets.length})
          </CardTitle>
          <CardDescription>
            {currentStage === "all"
              ? "All active tickets"
              : `Tickets in ${currentStage.replace(/_/g, " ")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading queue...</p>
          ) : filteredTickets.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No patients in this stage
            </p>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <div key={ticket.id} className="space-y-2">
                  <TicketWorkflowCard
                    ticket={ticket}
                    onUpdate={fetchTickets}
                    userRoles={userRoles}
                  />
                  {ticket.status === "triage" &&
                    userRoles.some((r) => ["nurse", "admin", "super_admin"].includes(r)) && (
                      <div className="flex justify-end">
                        <VitalsEntry
                          ticketId={ticket.id}
                          patientId={ticket.patient_id}
                          onComplete={fetchTickets}
                        />
                      </div>
                    )}
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
