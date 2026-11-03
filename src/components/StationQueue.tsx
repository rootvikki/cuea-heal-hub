import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Radio, Play, User, ChevronLeft, ChevronRight, Lock, Undo2, Send, Users, Clock, FastForward } from "lucide-react";
import { toast } from "sonner";
import { SendToDialog } from "@/components/SendToDialog";
import { STATIONS, stageLabel, type StationKey } from "@/lib/stations";
import { paymentModeLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface StationQueueProps {
  stationStages: string[];
  /** Suggested next stage — shown as "Next" in the Send dialog. */
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
    .order("updated_at", { ascending: true });

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

const waitLabel = (since?: string | null) => {
  if (!since) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};

const stageToStation = (stage: string): StationKey | undefined => STATIONS.find((s) => s.stage === stage)?.key;

export function StationQueue({ stationStages, nextStage, title, onSelectPatient, selectedTicketId, collapsed = false, onToggleCollapse, triageClaimMode = false }: StationQueueProps) {
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sendTicket, setSendTicket] = useState<any>(null);

  const queryKey = useMemo(() => ["station-queue", ...stationStages], [stationStages]);

  const { data: tickets = [] } = useQuery({
    queryKey,
    queryFn: () => fetchStationTickets(stationStages),
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!triageClaimMode) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", data.user.id).maybeSingle();
      setStaffId(staff?.id ?? null);
    });
  }, [triageClaimMode]);

  useEffect(() => {
    const channel = supabase
      .channel(`station-${title}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        queryClient.invalidateQueries({ queryKey });
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, title, queryKey]);

  const lockedByOther = (t: any) => triageClaimMode && !!t.assigned_to && t.assigned_to !== staffId;

  const startServing = async (ticket: any) => {
    setMobileOpen(false);
    if (!triageClaimMode) return onSelectPatient?.(ticket);
    if (lockedByOther(ticket)) {
      toast.error("This patient is already being served by another nurse");
      return;
    }
    if (!ticket.assigned_to) {
      const { data, error } = await supabase.rpc("manage_triage_claim", { _ticket_id: ticket.id, _action: "claim" });
      if (error) return toast.error(error.message);
      ticket = { ...ticket, ...(data as any), assigned_to: staffId, status: "triage_in_progress", workflow_stage: "triage_in_progress" };
      queryClient.invalidateQueries({ queryKey });
    }
    onSelectPatient?.(ticket);
  };

  const serveNext = () => {
    const next = tickets.find((t: any) => t.id !== selectedTicketId && !lockedByOther(t));
    if (!next) return toast.info("No one else is waiting");
    void startServing(next);
  };

  const releaseClaim = async (ticket: any) => {
    const { error } = await supabase.rpc("manage_triage_claim", { _ticket_id: ticket.id, _action: "release" });
    if (error) return toast.error(error.message);
    if (selectedTicketId === ticket.id) onSelectPatient?.(null);
    toast.success("Patient returned to the waiting list");
    queryClient.invalidateQueries({ queryKey });
  };

  const currentStation = stageToStation(stationStages[0]);
  const recommended = stageToStation(nextStage);

  const list = (
    <div className="p-2 space-y-2">
      {tickets.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-10 space-y-1">
          <Users className="h-6 w-6 mx-auto opacity-40" />
          <p>No patients waiting</p>
        </div>
      ) : (
        tickets.map((ticket: any, idx: number) => {
          const locked = lockedByOther(ticket);
          const mine = triageClaimMode && ticket.assigned_to === staffId;
          return (
            <div
              key={ticket.id}
              role="button"
              tabIndex={0}
              aria-disabled={locked}
              className={cn(
                "p-3 rounded-lg border text-sm space-y-2 transition-colors bg-background",
                selectedTicketId === ticket.id ? "border-primary ring-1 ring-primary/40 bg-primary/5" : "hover:bg-muted/50 cursor-pointer",
                locked && "opacity-60 cursor-not-allowed",
              )}
              onClick={() => void startServing(ticket)}
              onKeyDown={(e) => { if (e.key === "Enter") void startServing(ticket); }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="text-xs text-muted-foreground font-normal">{idx + 1}.</span>
                  {ticket.ticket_number}
                </span>
                <Badge variant={ticket.priority >= 3 ? "destructive" : "outline"} className={cn("text-[10px]", ticket.priority === 2 && "border-amber-500 text-amber-700")}>
                  {ticket.priority >= 3 ? "EMERGENCY" : ticket.priority === 2 ? "HIGH" : "Normal"}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate font-medium">
                  {ticket.patient?.profile?.full_name?.trim() || <span className="text-destructive italic">{ticket.patient?.patient_id || "Name pending"}</span>}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-mono">{ticket.patient?.patient_id}</span>
                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{waitLabel(ticket.updated_at || ticket.checked_in_at)}</span>
                {stationStages.length > 1 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stageLabel(ticket.workflow_stage)}</Badge>}
                {ticket.payment_mode === "insurance" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{paymentModeLabel(ticket.payment_mode)}</Badge>}
              </div>
              {triageClaimMode && ticket.assigned_to && (
                <p className="flex items-center gap-1 text-xs text-primary"><Lock className="h-3 w-3" /> {mine ? "On triage with you" : "On triage"}</p>
              )}
              <div className="flex gap-1.5">
                <Button size="sm" variant={selectedTicketId === ticket.id ? "default" : "outline"} disabled={locked} className="flex-1 h-8 text-xs" onClick={(e) => { e.stopPropagation(); void startServing(ticket); }}>
                  <Play className="h-3 w-3 mr-1" /> {mine ? "Resume" : selectedTicketId === ticket.id ? "Serving" : "Serve"}
                </Button>
                {mine ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); void releaseClaim(ticket); }}>
                    <Undo2 className="h-3 w-3 mr-1" /> Release
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={locked} className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setSendTicket(ticket); }}>
                    <Send className="h-3 w-3 mr-1" /> Send
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const header = (
    <div className="p-3 border-b space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <Button variant="ghost" size="icon" className="h-7 w-7 hidden md:inline-flex" onClick={onToggleCollapse} aria-label="Collapse queue">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h3 className="font-semibold text-sm">{title}</h3>
          <Badge variant="secondary" className="text-xs">{tickets.length}</Badge>
        </div>
        {isLive && (
          <Badge variant="outline" className="gap-1 text-[hsl(var(--success))] border-[hsl(var(--success))] text-[10px]">
            <Radio className="h-2 w-2 animate-pulse" /> Live
          </Badge>
        )}
      </div>
      <Button size="sm" className="w-full h-9" onClick={serveNext} disabled={tickets.length === 0}>
        <FastForward className="h-4 w-4 mr-1.5" /> Serve next patient
      </Button>
    </div>
  );

  return (
    <>
      {/* Mobile / small tablets: compact bar + slide-over list */}
      <div className="md:hidden flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2">
        <Button variant="outline" size="sm" className="h-10" onClick={() => setMobileOpen(true)}>
          <Users className="h-4 w-4 mr-1.5" /> {title} <Badge variant="secondary" className="ml-2">{tickets.length}</Badge>
        </Button>
        <Button size="sm" className="h-10" onClick={serveNext} disabled={tickets.length === 0}>
          <FastForward className="h-4 w-4 mr-1" /> Next
        </Button>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[88vw] max-w-sm flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>{title}</SheetTitle></SheetHeader>
          {header}
          <ScrollArea className="flex-1">{list}</ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Desktop: side panel */}
      {collapsed ? (
        <div className="hidden md:flex w-12 border-r bg-muted/30 flex-col items-center py-3 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse} aria-label="Show queue">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{tickets.length}</Badge>
          <div className="flex-1 flex items-center">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider" style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}>
              {title}
            </span>
          </div>
          {isLive && <Radio className="h-3 w-3 text-[hsl(var(--success))] animate-pulse" />}
        </div>
      ) : (
        <div className="hidden md:flex w-72 border-r bg-muted/30 flex-col h-full shrink-0">
          {header}
          <ScrollArea className="flex-1">{list}</ScrollArea>
        </div>
      )}

      <SendToDialog
        open={!!sendTicket}
        onOpenChange={(o) => !o && setSendTicket(null)}
        ticket={sendTicket ? { id: sendTicket.id, patientName: sendTicket.patient?.profile?.full_name } : null}
        from={title.replace(/ Queue$/, "")}
        exclude={currentStation ? [currentStation] : []}
        recommended={recommended}
        onSent={() => {
          if (selectedTicketId === sendTicket?.id) onSelectPatient?.(null);
          queryClient.invalidateQueries({ queryKey });
        }}
      />
    </>
  );
}

/**
 * Page shell for station screens: queue on the left (desktop) or as a bar on top (mobile),
 * work area on the right. Fits any screen size without double scrollbars.
 */
export function StationShell({ queue, children }: { queue: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:rounded-xl md:border md:bg-card md:overflow-hidden md:h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-9.5rem)]">
      {queue}
      <div className="flex-1 min-w-0 md:overflow-y-auto md:p-5 lg:p-6 space-y-5">{children}</div>
    </div>
  );
}
