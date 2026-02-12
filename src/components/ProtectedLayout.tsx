import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProtectedLayoutProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedLayout = ({ children, allowedRoles }: ProtectedLayoutProps) => {
  const { user, session, roles, profile, loading } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Suspension guard
  useEffect(() => {
    if (!loading && profile?.status === "suspended") {
      toast({
        title: "Account Suspended",
        description: "Your account has been suspended. Please contact your administrator.",
        variant: "destructive",
      });
      supabase.auth.signOut().then(() => navigate("/auth", { replace: true }));
    }
  }, [profile?.status, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  if (profile?.status === "suspended") {
    return null; // Will redirect via useEffect
  }

  // Check role-based access
  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess =
      roles.includes("super_admin") ||
      roles.includes("admin") ||
      roles.some((r) => allowedRoles.includes(r));

    if (!hasAccess) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1">{children}</main>
      </div>
    </SidebarProvider>
  );
};

export default ProtectedLayout;
