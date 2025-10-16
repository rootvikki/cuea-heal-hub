import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminRoleAssignment } from "@/components/AdminRoleAssignment";
import { UserManagement } from "@/components/UserManagement";
import { SuperAdminSetup } from "@/components/SuperAdminSetup";
import { RoleBasedDashboard } from "@/components/RoleBasedDashboard";
import { Activity, Pill } from "lucide-react";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayAppointments: 0,
    activeTickets: 0,
    pendingPayments: 0,
  });
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [hasRole, setHasRole] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSuperAdminSetup, setShowSuperAdminSetup] = useState(false);
  const [checkingSystem, setCheckingSystem] = useState(true);

  useEffect(() => {
    const checkSystemSetup = async () => {
      try {
        // Check if any super admin exists
        const { data: adminData, error } = await supabase
          .from("user_roles")
          .select("id")
          .eq("role", "super_admin")
          .limit(1);

        if (error) throw error;
        
        if (!adminData || adminData.length === 0) {
          setShowSuperAdminSetup(true);
          setCheckingSystem(false);
          return;
        }

        fetchData();
      } catch (error) {
        console.error("Error checking system setup:", error);
        setCheckingSystem(false);
      }
    };

    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Get user name from metadata or profile
        const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
        setUserName(fullName);
        setUserId(user.id);
        setUserEmail(user.email || "");

        // Check if user has a role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        
        setHasRole((roleData && roleData.length > 0) || false);
        
        if (roleData && roleData.length > 0) {
          const role = roleData[0].role;
          setUserRole(role);
          setIsAdmin(role === 'super_admin' || role === 'admin');
        }

        // Fetch statistics
        const today = new Date().toISOString().split('T')[0];

        const [patientsRes, appointmentsRes, ticketsRes, invoicesRes] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }).gte("appointment_date", today),
          supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "checked_out"),
          supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);

        setStats({
          totalPatients: patientsRes.count || 0,
          todayAppointments: appointmentsRes.count || 0,
          activeTickets: ticketsRes.count || 0,
          pendingPayments: invoicesRes.count || 0,
        });
      }
      setCheckingSystem(false);
    };

    checkSystemSetup();
  }, []);

  // ... keep existing code (statCards removed)

  if (checkingSystem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading system...</p>
        </div>
      </div>
    );
  }

  if (showSuperAdminSetup) {
    return <SuperAdminSetup onComplete={() => window.location.reload()} />;
  }

  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Welcome back, {userName}!</h1>
            <p className="text-muted-foreground text-lg">
              {userRole && <span className="capitalize">{userRole.replace(/_/g, " ")} Dashboard</span>}
            </p>
          </div>
          {!hasRole && (
            <AdminRoleAssignment userId={userId} userEmail={userEmail} />
          )}
        </div>
      </div>

      <RoleBasedDashboard role={userRole || "user"} stats={stats}>
        {isAdmin && (
          <div className="mt-6">
            <UserManagement />
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-success" />
              Quick Actions
            </CardTitle>
            <CardDescription>Frequently used functions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2">
              <button className="w-full p-3 text-left rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                <div className="font-medium">Register New Patient</div>
                <div className="text-sm text-muted-foreground">Add a new patient to the system</div>
              </button>
              <button className="w-full p-3 text-left rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors">
                <div className="font-medium">Create Appointment</div>
                <div className="text-sm text-muted-foreground">Schedule a new appointment</div>
              </button>
              <button className="w-full p-3 text-left rounded-lg bg-success/10 hover:bg-success/20 transition-colors">
                <div className="font-medium">Check-in Patient</div>
                <div className="text-sm text-muted-foreground">Generate queue ticket</div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-warning" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-success mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">System online and operational</p>
                  <p className="text-xs text-muted-foreground">All modules functioning normally</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Database synchronized</p>
                  <p className="text-xs text-muted-foreground">Last sync: Just now</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </RoleBasedDashboard>
    </div>
  );
};

export default Dashboard;
