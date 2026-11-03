import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Ticket, Zap, Loader2, Eraser } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CACHE_VERSION_KEY, clearThisBrowser } from "@/lib/cacheReset";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";

async function saveSetting(key: string, value: string) {
  const { data: existing } = await supabase.from("system_settings").select("id").eq("key", key).maybeSingle();
  const { error } = existing
    ? await supabase.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key)
    : await supabase.from("system_settings").insert({ key, value });
  if (error) throw error;
  logAuditEvent({ action: "system_setting_changed", module: "settings", details: { key, value } });
}

const todayKey = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return `ticket_${d.replace(/-/g, "")}`;
};

/** Super-admin settings: daily ticket numbering and instant updates. */
export function QueueAndLiveSettings() {
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState("T-");
  const [live, setLive] = useState(true);
  const [issuedToday, setIssuedToday] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("system_settings").select("key, value").in("key", ["ticket_prefix", "live_updates"]);
      (data || []).forEach((r) => {
        if (r.key === "ticket_prefix") setPrefix(r.value ?? "T-");
        if (r.key === "live_updates") setLive(r.value !== "off");
      });
      const { data: c } = await supabase.from("counters").select("current_value").eq("id", todayKey()).maybeSingle();
      setIssuedToday(Number(c?.current_value ?? 0));
    })();
  }, []);

  const savePrefix = async () => {
    const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 6);
    setSaving(true);
    try {
      await saveSetting("ticket_prefix", clean);
      setPrefix(clean);
      toast.success("Ticket format saved", { description: `Next tickets look like ${clean}00001` });
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const toggleLive = async (on: boolean) => {
    setLive(on);
    try {
      await saveSetting("live_updates", on ? "on" : "off");
      queryClient.invalidateQueries({ queryKey: ["system-setting", "live_updates"] });
      toast.success(on ? "Instant updates on" : "Instant updates off", { description: on ? "Changes show on every screen as soon as they are saved." : "Screens refresh once a minute instead." });
    } catch (e) {
      setLive(!on);
      toast.error("Could not save", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const [clearing, setClearing] = useState(false);
  const clearEveryone = async () => {
    setClearing(true);
    try {
      const version = new Date().toISOString();
      await saveSetting("cache_version", version);
      logAuditEvent({ action: "cache_cleared_for_everyone", module: "settings", details: { version } });
      toast.success("Cache cleared for everyone", { description: "Open screens clear and reload within a minute (or when someone returns to the tab)." });
      await clearThisBrowser(queryClient);
      localStorage.setItem(CACHE_VERSION_KEY, version);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setClearing(false);
      toast.error("Could not clear cache", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const preview = `${prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 6)}00001`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" /> Queue ticket numbers</CardTitle>
          <CardDescription>Ticket numbers restart at 00001 at midnight (Nairobi time) every day. Triage left open from the previous day is cleared when the first ticket is issued.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 w-48">
              <Label>Prefix</Label>
              <Input className="h-12 text-base uppercase" value={prefix} maxLength={6} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. T-" />
            </div>
            <Button onClick={savePrefix} disabled={saving} className="h-12">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save format</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            First ticket each day: <strong className="text-foreground">{preview}</strong>
            {issuedToday != null && <> · Issued today: <strong className="text-foreground">{issuedToday}</strong></>}
            . Leave the prefix empty for plain numbers (00001).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Instant updates</CardTitle>
          <CardDescription>When on, changes appear on every open screen as soon as they are saved: pharmacy stock and prices, stock cards, replenishment, bills, payments, procedures and patient details.</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={live} onCheckedChange={(v) => void toggleLive(v)} />
            {live ? "On — screens update immediately" : "Off — screens refresh every minute"}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Eraser className="h-5 w-5 text-primary" /> Clear cache for everyone</CardTitle>
          <CardDescription>Wipes the data stored in every user's browser — unsaved form drafts, saved preferences and cached lists — and reloads their screens with the latest version of the system. Everyone stays signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={clearing}>{clearing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eraser className="h-4 w-4 mr-2" />}Clear cache for everyone</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear the cache on every computer?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every open screen in the system reloads within about a minute. Unsaved form drafts (registration, triage, consultation, pharmacy) on all computers will be lost — ask staff to save their work first. Saved records are not affected and nobody is signed out.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void clearEveryone()}>Yes, clear for everyone</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
