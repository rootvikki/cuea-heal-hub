import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Play, CheckCircle, User } from "lucide-react";
import { toast } from "sonner";

interface StationQueueProps {
  stationStages: string[];
  nextStage: string;
  title: string;
  onSelectPatient?: (ticket: any) => void;
  selectedTicketId?: string;
}

export function StationQueue({ stationStages, nextStage, title, onSelectPatient, selectedTicketId }: StationQueueProps) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    fetchTickets();
    const channel = supabase
      .channel(`station-${title}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        fetchTickets();
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .in("workflow_stage", stationStages)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (data) {
      const enriched = await Promise.all(
        data.map(async (t) => {
          const { data: patient } = await supabase.from("patients").select("patient_id, user_id").eq("id", t.patient_id).single();
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", patient?.user_id).single();
          return { ...t, patient: { ...patient, profile } };
        })
      );
      setTickets(enriched);
    }
  };

  const startServing = async (ticket: any) => {
    onSelectPatient?.(ticket);
  };

  const completeAndAdvance = async (ticketId: string) => {
    const { error } = await supabase
      .from("tickets")
      .update({ workflow_stage: nextStage as any, status: nextStage as any })
      .eq("id", ticketId);

    if (error) {
      toast.error("Failed to advance patient");
    } else {
      toast.success(`Patient sent to ${nextStage.replace(/_/g, " ")}`);
      fetchTickets();
    }
  };

  return (
    <div className="w-72 border-r bg-muted/30 flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          {isLive && (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-600 text-xs">
              <Radio className="h-2 w-2 animate-pulse" /> Live
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{tickets.length} patient(s)</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {tickets.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No patients</p>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`p-3 rounded-lg border text-sm space-y-2 cursor-pointer transition-colors ${
                  selectedTicketId === ticket.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                }`}
                onClick={() => startServing(ticket)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{ticket.ticket_number}</span>
                  <Badge variant={ticket.priority >= 3 ? "destructive" : "outline"} className="text-xs">
                    {ticket.priority >= 3 ? "URGENT" : "Normal"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{ticket.patient?.profile?.full_name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ticket.patient?.patient_id}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); startServing(ticket); }}>
                    <Play className="h-3 w-3 mr-1" /> Serve
                  </Button>
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); completeAndAdvance(ticket.id); }}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Done
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
