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

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const COUNTDOWN_SECONDS = 6;

const IdleTimeout = () => {
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // User interacted during countdown — cancel it
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      setShowWarning(false);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(startCountdown, IDLE_TIMEOUT_MS);
  }, [showWarning, startCountdown]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    idleTimer.current = setTimeout(startCountdown, IDLE_TIMEOUT_MS);

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
            You've been inactive for 5 minutes. You will be logged out in{" "}
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
