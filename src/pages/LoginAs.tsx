import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Landing page of a "Log in as" tab: exchanges the one-time token for the user's own session. */
export default function LoginAs() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = params.get("t");
    // Never leave the one-time token in the address bar or history.
    window.history.replaceState(null, "", window.location.pathname);

    void (async () => {
      if (!tokenHash) {
        const { data } = await supabase.auth.getSession();
        if (data.session) navigate("/dashboard", { replace: true });
        else setError("This sign-in link has already been used. Close this tab and choose Log in as again.");
        return;
      }
      await supabase.auth.signOut({ scope: "local" });
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error || !data.session) {
        setError(error?.message || "Could not sign in as this user.");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("must_change_password").eq("user_id", data.session.user.id).maybeSingle();
      navigate(profile?.must_change_password ? "/change-password" : "/dashboard", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      {error ? (
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.close()}>Close tab</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" /> Signing in…
        </div>
      )}
    </div>
  );
}
