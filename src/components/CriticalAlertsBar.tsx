import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logAuditEvent } from "@/lib/auditLog";
import { useLiveTable } from "@/lib/liveUpdates";
import { toast } from "sonner";

const CLINICAL = ["doctor", "clinical_officer", "nurse"];

interface Alert { id: string; title: string; message: string; created_at: string }

/** Red bar on every screen for doctors and nurses until each critical lab value is acknowledged. */
export function CriticalAlertsBar() {
  const { user, roles } = useUser();
  const queryClient = useQueryClient();
  const show = !!user && roles.some((r) => CLINICAL.includes(r));
  const [open, setOpen] = useState<Alert | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: alerts = [], refetch } = useQuery({
    queryKey: ["critical_alerts", "open"],
    enabled: show,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from("critical_alerts")
        .select("id, title, message, created_at")
        .eq("alert_type", "lab_critical").eq("acknowledged", false).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(20);
      return (data || []) as Alert[];
    },
  });
  useLiveTable(["critical_alerts"], () => void refetch());

  if (!show || alerts.length === 0) return null;

  const acknowledge = async () => {
    if (!open || !user) return;
    setSaving(true);
    const { error } = await supabase.from("critical_alerts").update({
      acknowledged: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString(), acknowledged_note: note.trim() || null,
    }).eq("id", open.id);
    setSaving(false);
    if (error) { toast.error("Could not acknowledge", { description: error.message }); return; }
    logAuditEvent({ action: "critical_value_acknowledged", module: "laboratory", details: { alert: open.id, title: open.title, note: note.trim() || null } });
    setOpen(null); setNote("");
    queryClient.invalidateQueries({ queryKey: ["critical_alerts"] });
    toast.success("Acknowledged", { description: "The lab can see you have received this result." });
  };

  return (
    <div className="border-b border-destructive bg-destructive/10 px-4 py-2 space-y-1" role="alert">
      {alerts.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Siren className="h-4 w-4 text-destructive shrink-0 animate-pulse" />
          <span className="font-semibold text-destructive">{a.title}</span>
          <span className="text-foreground/80 hidden sm:inline">{a.message}</span>
          <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <Button size="sm" variant="destructive" className="h-7 ml-auto" onClick={() => { setOpen(a); setNote(""); }}>Acknowledge</Button>
        </div>
      ))}
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge critical result</DialogTitle>
            <DialogDescription>{open?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Action taken (optional)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. patient recalled, IV dextrose given" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={() => void acknowledge()} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
