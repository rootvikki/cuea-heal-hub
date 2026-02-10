import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, Users, Clock, ArrowRight } from "lucide-react";
import { toast as sonnerToast } from "sonner";

interface TicketWithDetails {
  id: string;
  ticket_number: string;
  status: string;
  priority: number;
  checked_in_at: string;
  workflow_stage: string | null;
  patient: {
    patient_id: string;
    profile: { full_name: string } | null;
  } | null;
  department: { name: string } | null;
}

const stageLabels: Record<string, string> = {
  checked_in: "Reception",
  triage: "Triage",
  waiting_for_doctor: "Waiting Room",
  in_consult: "Doctor's Office",
  order_placed_lab: "Lab Order Placed",
  order_placed_imaging: "Imaging Order Placed",
  at_lab: "Laboratory",
  at_imaging: "Imaging",
  at_pharmacy: "Pharmacy",
  at_billing: "Cashier",
  checked_out: "Complete",
};

const stageOrder = [
  "checked_in",
  "triage",
  "waiting_for_doctor",
  "in_consult",
  "at_lab",
  "at_imaging",
  "at_pharmacy",
  "at_billing",
  "checked_out",
];

const QueueDisplay = () => {
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchTickets();

    // Real-time subscription
    const channel = supabase
      .channel("queue-display")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const newStatus = (payload.new as any).status;
            const ticketNumber = (payload.new as any).ticket_number;
            sonnerToast.info(`${ticketNumber} moved to ${stageLabels[newStatus] || newStatus}`);
          }
          fetchTickets();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timeInterval);
    };
  }, []);

  const fetchTickets = async () => {
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

          let profile = null;
          if (patient?.user_id) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          const { data: dept } = await supabase
            .from("departments")
            .select("name")
            .eq("id", ticket.department_id)
            .single();

          return {
            ...ticket,
            patient: patient ? { ...patient, profile } : null,
            department: dept,
          };
        })
      );
      setTickets(ticketsWithDetails);
    }
  };

  const getStageColor = (status: string) => {
    const colors: Record<string, string> = {
      checked_in: "bg-muted text-muted-foreground",
      triage: "bg-warning text-warning-foreground",
      waiting_for_doctor: "bg-secondary text-secondary-foreground",
      in_consult: "bg-primary text-primary-foreground",
      order_placed_lab: "bg-accent text-accent-foreground",
      order_placed_imaging: "bg-accent text-accent-foreground",
      at_lab: "bg-accent text-accent-foreground",
      at_imaging: "bg-accent text-accent-foreground",
      at_pharmacy: "bg-success text-success-foreground",
      at_billing: "bg-secondary text-secondary-foreground",
      checked_out: "bg-muted text-muted-foreground",
    };
    return colors[status] || "bg-muted text-muted-foreground";
  };

  const getPriorityLabel = (priority: number) => {
    if (priority === 3) return { label: "EMERGENCY", color: "bg-destructive text-destructive-foreground animate-pulse" };
    if (priority === 2) return { label: "HIGH", color: "bg-warning text-warning-foreground" };
    return null;
  };

  // Group tickets by stage
  const ticketsByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = tickets.filter((t) => (t.workflow_stage || t.status) === stage);
    return acc;
  }, {} as Record<string, TicketWithDetails[]>);

  // Get currently being served (in_consult, at_lab, at_imaging, at_pharmacy, at_billing)
  const nowServing = tickets.filter((t) =>
    ["in_consult", "at_lab", "at_imaging", "at_pharmacy", "at_billing"].includes(t.workflow_stage || t.status)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/favicon.png" alt="CUEA Logo" className="w-12 h-12 rounded-full bg-white p-1" />
            <div>
              <h1 className="text-2xl font-bold">CUEA Health Center</h1>
              <p className="text-primary-foreground/80 text-sm">Queue Display</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            {isLive && (
              <Badge variant="secondary" className="gap-1 text-lg px-3 py-1">
                <Radio className="h-4 w-4 animate-pulse" />
                LIVE
              </Badge>
            )}
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">
                {currentTime.toLocaleTimeString()}
              </p>
              <p className="text-sm text-primary-foreground/80">
                {currentTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Now Serving Section */}
        <Card className="border-2 border-primary">
          <CardHeader className="bg-primary text-primary-foreground py-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-6 w-6" />
              NOW SERVING
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {nowServing.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-lg">
                No patients currently being served
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nowServing.map((ticket) => {
                  const priority = getPriorityLabel(ticket.priority);
                  return (
                    <div
                      key={ticket.id}
                      className="p-4 rounded-lg border-2 border-primary/20 bg-card"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-3xl font-bold text-primary">
                          {ticket.ticket_number}
                        </span>
                        {priority && (
                          <Badge className={priority.color}>{priority.label}</Badge>
                        )}
                      </div>
                      <p className="font-medium text-lg">
                        {ticket.patient?.profile?.full_name || "Patient"}
                      </p>
                      <Badge className={`${getStageColor(ticket.workflow_stage || ticket.status)} mt-2`}>
                        {stageLabels[ticket.workflow_stage || ticket.status]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queue Flow Visualization */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {stageOrder.slice(0, -1).map((stage) => {
            const stageTickets = ticketsByStage[stage] || [];
            return (
              <Card key={stage} className="relative">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>{stageLabels[stage]}</span>
                    <Badge variant="outline" className="ml-2">
                      {stageTickets.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {stageTickets.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No patients
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {stageTickets.slice(0, 5).map((ticket) => {
                        const priority = getPriorityLabel(ticket.priority);
                        return (
                          <div
                            key={ticket.id}
                            className={`p-2 rounded border text-sm ${
                              priority ? "border-destructive bg-destructive/5" : "border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{ticket.ticket_number}</span>
                              {priority && (
                                <span className="text-xs text-destructive font-medium">
                                  {priority.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {ticket.patient?.profile?.full_name}
                            </p>
                          </div>
                        );
                      })}
                      {stageTickets.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{stageTickets.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
                {/* Arrow to next stage */}
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 hidden md:block">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Waiting List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Waiting Queue
              <Badge variant="outline" className="ml-2">
                {tickets.filter((t) => (t.workflow_stage || t.status) === "waiting_for_doctor").length} waiting
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {tickets
                .filter((t) => (t.workflow_stage || t.status) === "waiting_for_doctor")
                .map((ticket, index) => {
                  const priority = getPriorityLabel(ticket.priority);
                  return (
                    <div
                      key={ticket.id}
                      className={`p-3 rounded-lg border-2 text-center ${
                        priority
                          ? "border-destructive bg-destructive/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <p className="text-xs text-muted-foreground mb-1">#{index + 1}</p>
                      <p className="text-xl font-bold text-primary">
                        {ticket.ticket_number}
                      </p>
                      <p className="text-sm truncate">
                        {ticket.patient?.profile?.full_name}
                      </p>
                      {priority && (
                        <Badge className={`${priority.color} mt-1 text-xs`}>
                          {priority.label}
                        </Badge>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Stats Footer */}
        <div className="flex justify-center gap-8 py-4 text-center">
          <div>
            <p className="text-4xl font-bold text-primary">{tickets.length}</p>
            <p className="text-sm text-muted-foreground">Total in Queue</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-secondary">
              {tickets.filter((t) => (t.workflow_stage || t.status) === "waiting_for_doctor").length}
            </p>
            <p className="text-sm text-muted-foreground">Waiting</p>
          </div>
          <div>
            <p className="text-4xl font-bold text-success">{nowServing.length}</p>
            <p className="text-sm text-muted-foreground">Being Served</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default QueueDisplay;
