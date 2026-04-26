import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Hospital, Mail, ArrowLeft } from "lucide-react";

type AuthStep = "login" | "forgot-password";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<AuthStep>("login");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if user is suspended
      const { data: profileData } = await supabase
        .from("profiles")
        .select("status, must_change_password")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileData?.status === "suspended") {
        await supabase.auth.signOut();
        toast({
          title: "Account Suspended",
          description: "Your account has been suspended. Please contact your administrator.",
          variant: "destructive",
        });
        return;
      }

      // Check if user must change password on first login
      if ((profileData as any)?.must_change_password) {
        navigate("/change-password");
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email, 
            redirectUrl: `${window.location.origin}/reset-password` 
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to send reset email");
      }

      toast({
        title: "Password reset email sent",
        description: "Please check your email for the password reset link.",
      });
      
      setStep("login");
    } catch (error: any) {
      toast({
        title: "Failed to send reset email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <img 
            src="/favicon.png" 
            alt="CUEA Logo" 
            className="mx-auto w-20 h-20"
          />
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              CUEA Infirmary
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Hospital Management System
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === "login" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="your.email@cuea.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
              <Button
                type="button"
                variant="link"
                className="w-full text-muted-foreground"
                onClick={() => setStep("forgot-password")}
              >
                Forgot your password?
              </Button>
              <div className="text-center pt-2 border-t space-y-2">
                <p className="text-xs text-muted-foreground">
                  🔒 New accounts are created by administrators only. Self-signup is disabled.
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="text-primary font-medium"
                  onClick={() => navigate("/staff-registration")}
                >
                  Staff? Register your details here →
                </Button>
              </div>
            </form>
          )}

          {step === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Button
                type="button"
                variant="ghost"
                className="mb-2 -ml-2"
                onClick={() => setStep("login")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to login
              </Button>
              <div className="text-center mb-4">
                <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <h3 className="font-semibold text-lg">Reset Password</h3>
                <p className="text-sm text-muted-foreground">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="your.email@cuea.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
