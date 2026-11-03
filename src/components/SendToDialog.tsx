import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STATIONS, sendPatientTo, type StationKey } from "@/lib/stations";

interface SendToDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: { id: string; patientName?: string } | null;
  /** Where the patient is being sent from, e.g. "Laboratory". */
  from: string;
  /** Stations to hide (usually the current one). */
  exclude?: StationKey[];
  /** Highlighted as the suggested next step. */
  recommended?: StationKey;
  /** Runs before the ticket is moved (e.g. save results). Throw to cancel. */
  beforeSend?: (to: StationKey) => Promise<void>;
  onSent?: (to: StationKey) => void;
}

/** "Send patient to…" — one tap to any department, with an optional handover note. */
export function SendToDialog({ open, onOpenChange, ticket, from, exclude = [], recommended, beforeSend, onSent }: SendToDialogProps) {
  const [to, setTo] = useState<StationKey | null>(recommended ?? null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) { setTo(recommended ?? null); setNote(""); }
  }, [open, recommended]);

  const send = async () => {
    if (!ticket || !to) return;
    setSending(true);
    try {
      await beforeSend?.(to);
      const station = await sendPatientTo({ ticketId: ticket.id, patientName: ticket.patientName, to, from, note });
      toast.success(to === "checkout" ? "Patient checked out" : `Sent to ${station.label}`, { description: ticket.patientName });
      onOpenChange(false);
      onSent?.(to);
    } catch (e) {
      toast.error("Could not send patient", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  const options = STATIONS.filter((s) => !exclude.includes(s.key));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send patient to…</DialogTitle>
          <DialogDescription>{ticket?.patientName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options.map((s) => {
            const Icon = s.icon;
            const active = to === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setTo(s.key)}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-sm font-medium transition-all",
                  active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : `hover:border-primary/40 ${s.color}`,
                )}
              >
                <Icon className="h-5 w-5" />
                {s.label}
                {recommended === s.key && <Badge className="absolute -top-2 right-1 text-[10px] px-1.5 py-0">Next</Badge>}
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="handover-note">Handover note (optional)</Label>
          <Textarea id="handover-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the next department should know" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!to || sending} className="min-w-[8rem]">
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {to === "checkout" ? "Check out" : "Send"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
