import { signOutThisTab } from "@/lib/isolatedSession";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

const DEFAULT_IDLE_MINUTES = 5;
const COUNTDOWN_SECONDS = 6;

const IdleTimeout = () => {
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [idleMinutes, setIdleMinutes] = useState(DEFAULT_IDLE_MINUTES);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimeoutMs = useRef(DEFAULT_IDLE_MINUTES * 60 * 1000);
  const showWarningRef = useRef(false);

  // Fetch admin-configured timeout
  useEffect(() => {
    const fetchTimeout = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "idle_timeout_minutes")
        .maybeSingle();

      if (data?.value) {
        const val = parseFloat(data.value);
        if (!isNaN(val) && val > 0) {
          setIdleMinutes(val);
          idleTimeoutMs.current = val * 60 * 1000;
        }
      }
    };
    fetchTimeout();
  }, []);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; }
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
  }, []);

  const logout = useCallback(async () => {
    clearTimers();
    showWarningRef.current = false;
    setShowWarning(false);
    if (await signOutThisTab((o) => supabase.auth.signOut(o))) return;
    navigate("/auth", { replace: true });
  }, [navigate, clearTimers]);

  const startCountdown = useCallback(() => {
    showWarningRef.current = true;
    setShowWarning(true);
    setCountdown(COUNTDOWN_SECONDS);
    let remaining = COUNTDOWN_SECONDS;
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        logout();
      }
    }, 1000);
  }, [logout]);

  const resetIdleTimer = useCallback(() => {
    // If warning is showing, dismiss it
    if (showWarningRef.current) {
      if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
      showWarningRef.current = false;
      setShowWarning(false);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startCountdown, idleTimeoutMs.current);
  }, [startCountdown]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    const handler = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    idleTimer.current = setTimeout(startCountdown, idleTimeoutMs.current);

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimers();
    };
  }, [resetIdleTimer, startCountdown, clearTimers]);

  const progressPercent = (countdown / COUNTDOWN_SECONDS) * 100;

  const formatIdleLabel = (mins: number) => {
    if (mins < 1) return `${Math.round(mins * 60)} seconds`;
    if (mins === 1) return "1 minute";
    return `${mins} minutes`;
  };

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent className="max-w-md border-destructive border-2 shadow-2xl">
        <AlertDialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 animate-pulse">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <AlertDialogTitle className="text-2xl font-bold">Session Timeout</AlertDialogTitle>
          <p className="text-muted-foreground mt-1">
            You've been inactive for {formatIdleLabel(idleMinutes)}.
          </p>
        </AlertDialogHeader>

        <div className="flex flex-col items-center gap-4 py-6">
          {/* Giant countdown number */}
          <div className="relative flex items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                className="stroke-muted"
                strokeWidth="8"
              />
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                className="stroke-destructive transition-all duration-1000 ease-linear"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - progressPercent / 100)}`}
              />
            </svg>
            <span className="absolute text-5xl font-black text-destructive tabular-nums">
              {countdown}
            </span>
          </div>

          <p className="text-lg font-semibold text-foreground">
            Logging out in <span className="text-destructive">{countdown}</span> second{countdown !== 1 ? "s" : ""}
          </p>
        </div>

        <AlertDialogFooter className="sm:justify-center">
          <Button
            size="lg"
            className="px-8 text-base font-semibold"
            onClick={resetIdleTimer}
          >
            I'm Still Here — Stay Logged In
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default IdleTimeout;
