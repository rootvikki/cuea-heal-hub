import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Clears the triage queue of leftovers: visits from previous days still waiting for
 * triage are closed, and patients stuck "On triage" too long go back to Awaiting Triage.
 * (Previous-day triage is also cleared automatically when the first ticket of the day is issued.)
 */
export function ClearOldTriage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("120");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("clear_old_triage", { _stuck_minutes: Number(minutes) });
    setBusy(false);
    if (error) return toast.error("Could not clear triage", { description: error.message });
    const r = (data || {}) as { closed?: number; released?: number };
    toast.success("Triage queue cleared", { description: `${r.closed ?? 0} old visit(s) closed · ${r.released ?? 0} returned to Awaiting Triage` });
    queryClient.invalidateQueries({ queryKey: ["station-queue"] });
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}><Eraser className="h-4 w-4" /> Clear old triage</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clear old triage?</DialogTitle>
            <DialogDescription>
              Visits from previous days still waiting at triage are closed. Patients left "On triage" longer than the time below go back to
              Awaiting Triage so another nurse can serve them. Vitals already saved are kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Return patients "On triage" for more than</Label>
            <Select value={minutes} onValueChange={setMinutes}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="240">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Clear old triage</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
