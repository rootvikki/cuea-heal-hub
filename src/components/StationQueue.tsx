import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Play, CheckCircle, User, ChevronLeft, ChevronRight, Lock, Undo2 } from "lucide-react";
import { toast } from "sonner";

interface StationQueueProps {
  stationStages: string[];
  nextStage: string;
  title: string;
  onSelectPatient?: (ticket: any) => void;
  selectedTicketId?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  triageClaimMode?: boolean;
}

async function fetchStationTickets(stationStages: string[]) {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, patients!inner(id, patient_id, user_id, patient_type, allergies, blood_type, chronic_conditions, insurance_provider, insurance_number, national_id, payroll_number, admission_number, profiles!inner(full_name, phone, date_of_birth, gender))")
    .in("workflow_stage", stationStages)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((t: any) => ({
    ...t,
    patient: {
      id: t.patients?.id,
      patient_id: t.patients?.patient_id,
      user_id: t.patients?.user_id,
      patient_type: t.patients?.patient_type,
      allergies: t.patients?.allergies,
      blood_type: t.patients?.blood_type,
      chronic_conditions: t.patients?.chronic_conditions,
      insurance_provider: t.patients?.insurance_provider,
      insurance_number: t.patients?.insurance_number,
      national_id: t.patients?.national_id,
      payroll_number: t.patients?.payroll_number,
      admission_number: t.patients?.admission_number,
      profile: {
        full_name: t.patients?.profiles?.full_name,
        phone: t.patients?.profiles?.phone,
        date_of_birth: t.patients?.profiles?.date_of_birth,
        gender: t.patients?.profiles?.gender,
      },
    },
  }));
}

export function StationQueue({ stationStages, nextStage, title, onSelectPatient, selectedTicketId, collapsed = false, onToggleCollapse, triageClaimMode = false }: StationQueueProps) {
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);

  const queryKey = ["station-queue", ...stationStages];

  const { data: tickets = [] } = useQuery({
    queryKey,
    queryFn: () => fetchStationTickets(stationStages),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (triageClaimMode) {
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) return;
        const { data: staff } = await supabase.from("staff").select("id").eq("user_id", data.user.id).maybeSingle();
        setStaffId(staff?.id ?? null);
      });
    }
  }, [triageClaimMode]);

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
    if (!triageClaimMode) return onSelectPatient?.(ticket);
    if (ticket.assigned_to && ticket.assigned_to !== staffId) {
      toast.error("This patient is already claimed by another clinician");
      return;
    }
    if (!ticket.assigned_to) {
      const { data, error } = await supabase.rpc("manage_triage_claim", { _ticket_id: ticket.id, _action: "claim" });
      if (error) return toast.error(error.message);
      ticket = { ...ticket, ...data, assigned_to: staffId, status: "triage_in_progress", workflow_stage: "triage_in_progress" };
      toast.success("Patient claimed for triage");
      queryClient.invalidateQueries({ queryKey });
    }
    onSelectPatient?.(ticket);
  };

  const releaseClaim = async (ticket: any) => {
    const { error } = await supabase.rpc("manage_triage_claim", { _ticket_id: ticket.id, _action: "release" });
    if (error) return toast.error(error.message);
    if (selectedTicketId === ticket.id) onSelectPatient?.(null);
    toast.success("Patient returned to Awaiting Triage");
    queryClient.invalidateQueries({ queryKey });
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
                onClick={() => void startServing(ticket)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{ticket.ticket_number}</span>
                  <Badge variant={ticket.priority >= 3 ? "destructive" : "outline"} className="text-xs">
                    {ticket.priority >= 3 ? "EMERGENCY" : ticket.priority === 2 ? "HIGH" : "Normal"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">
                    {ticket.patient?.profile?.full_name?.trim() || (
                      <span className="text-destructive italic">{ticket.patient?.patient_id || "Name pending"}</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{ticket.patient?.patient_id}</p>
                {triageClaimMode && ticket.assigned_to && (
                  <p className="flex items-center gap-1 text-xs text-primary"><Lock className="h-3 w-3" /> {ticket.assigned_to === staffId ? "Claimed by you" : "In triage"}</p>
                )}
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={triageClaimMode && !!ticket.assigned_to && ticket.assigned_to !== staffId} className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); void startServing(ticket); }}>
                    <Play className="h-3 w-3 mr-1" /> {triageClaimMode ? (ticket.assigned_to === staffId ? "Resume" : "Claim") : "Serve"}
                  </Button>
                  {triageClaimMode ? ticket.assigned_to === staffId && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void releaseClaim(ticket); }}><Undo2 className="h-3 w-3 mr-1" /> Release</Button> : (
                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); void completeAndAdvance(ticket.id); }}><CheckCircle className="h-3 w-3 mr-1" /> Done</Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
