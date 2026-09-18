import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

const SOUND_KEY = "cuea-triage-arrival-sound";

const playArrivalTone = () => {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, context.currentTime);
  gain.gain.setValueAtTime(0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
  oscillator.addEventListener("ended", () => void context.close());
};

export function TriageArrivalAlerts() {
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) === "true");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "denied" : Notification.permission);
  const ready = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { ready.current = true; }, 1200);
    const channel = supabase.channel("triage-arrival-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tickets" }, (payload) => {
        const ticket = payload.new as { ticket_number?: string; status?: string; workflow_stage?: string };
        if (!ready.current || (ticket.workflow_stage ?? ticket.status) !== "triage") return;
        const message = `${ticket.ticket_number ?? "A patient"} is awaiting triage`;
        toast.info(message, { icon: <BellRing className="h-4 w-4" /> });
        if (soundEnabled) playArrivalTone();
        if (notificationPermission === "granted") new Notification("Awaiting Triage", { body: message });
      })
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [notificationPermission, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, String(next));
    if (next) playArrivalTone();
  };

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={toggleSound} className="gap-2">
        {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        Arrival sound {soundEnabled ? "on" : "off"}
      </Button>
      {notificationPermission !== "granted" && typeof Notification !== "undefined" && (
        <Button type="button" variant="outline" size="sm" onClick={enableNotifications} className="gap-2">
          <Bell className="h-4 w-4" /> Enable desktop alerts
        </Button>
      )}
    </div>
  );
}