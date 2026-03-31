import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

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

  // Fetch admin-configured timeout from system_settings
  useEffect(() => {
    const fetchTimeout = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "idle_timeout_minutes")
        .maybeSingle();

      if (data?.value) {
        const minutes = parseInt(data.value, 10);
        if (!isNaN(minutes) && minutes >= 1) {
          setIdleMinutes(minutes);
          idleTimeoutMs.current = minutes * 60 * 1000;
        }
      }
    };
    fetchTimeout();
  }, []);

  const logout = useCallback(async () => {
    clearTimers();
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  }, [navigate]);

  const clearTimers = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  };

  const startCountdown = useCallback(() => {
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
    if (showWarning) {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      setShowWarning(false);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startCountdown, idleTimeoutMs.current);
  }, [showWarning, startCountdown]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    idleTimer.current = setTimeout(startCountdown, idleTimeoutMs.current);

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      clearTimers();
    };
  }, [resetIdleTimer, startCountdown]);

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Timeout</AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive for {idleMinutes} minute{idleMinutes !== 1 ? "s" : ""}. You will be logged out in{" "}
            <span className="font-bold text-destructive">{countdown}</span> seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={resetIdleTimer}>Stay Logged In</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default IdleTimeout;
