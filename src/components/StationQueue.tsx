import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Play, CheckCircle, User, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface StationQueueProps {
  stationStages: string[];
  nextStage: string;
  title: string;
  onSelectPatient?: (ticket: any) => void;
  selectedTicketId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

async function fetchStationTickets(stationStages: string[]) {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, patients!inner(patient_id, user_id, profiles!inner(full_name))")
    .in("workflow_stage", stationStages)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((t: any) => ({
    ...t,
    patient: {
      patient_id: t.patients?.patient_id,
      user_id: t.patients?.user_id,
      profile: { full_name: t.patients?.profiles?.full_name },
    },
  }));
}

export function StationQueue({ stationStages, nextStage, title, onSelectPatient, selectedTicketId, collapsed = false, onToggleCollapse }: StationQueueProps) {
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);

  const queryKey = ["station-queue", ...stationStages];

  const { data: tickets = [] } = useQuery({
    queryKey,
    queryFn: () => fetchStationTickets(stationStages),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`station-${title}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, title]);

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
      queryClient.invalidateQueries({ queryKey });
    }
  };

  // Collapsed mode: narrow vertical strip
  if (collapsed) {
    return (
      <div className="w-12 border-r bg-muted/30 flex flex-col items-center py-3 gap-3 shrink-0 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleCollapse}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
          {tickets.length}
        </Badge>
        <div className="flex-1 flex items-center">
          <span
            className="text-[10px] font-semibold text-muted-foreground tracking-wider"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {title}
          </span>
        </div>
        {isLive && (
          <Radio className="h-3 w-3 text-[hsl(var(--success))] animate-pulse" />
        )}
      </div>
    );
  }

  return (
    <div className="w-72 border-r bg-muted/30 flex flex-col h-full shrink-0 transition-all duration-200">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onToggleCollapse && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleCollapse}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          {isLive && (
            <Badge variant="outline" className="gap-1 text-[hsl(var(--success))] border-[hsl(var(--success))] text-xs">
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
            tickets.map((ticket: any) => (
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
