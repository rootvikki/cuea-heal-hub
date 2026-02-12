import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminRoleAssignment } from "@/components/AdminRoleAssignment";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import { Users, Calendar, ClipboardList, DollarSign, Activity, Pill } from "lucide-react";
import { format } from "date-fns";

const Dashboard = () => {
  const navigate = useNavigate();
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
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
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
          .eq("user_id", user.id)
          .limit(1);
        
        setHasRole((roleData && roleData.length > 0) || false);

        // Fetch statistics
        const today = new Date().toISOString().split('T')[0];

        const [patientsRes, appointmentsRes, ticketsRes, invoicesRes, activityRes] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }).gte("appointment_date", today),
          supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "checked_out"),
          supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("audit_logs").select("id, action, module, created_at").order("created_at", { ascending: false }).limit(6),
        ]);

        setStats({
          totalPatients: patientsRes.count || 0,
          todayAppointments: appointmentsRes.count || 0,
          activeTickets: ticketsRes.count || 0,
          pendingPayments: invoicesRes.count || 0,
        });
        setRecentActivity(activityRes.data || []);
      }
    };

    fetchData();
  }, []);

  const statCards = [
    {
      title: "Total Patients",
      value: stats.totalPatients,
      icon: Users,
      description: "Registered patients",
      color: "text-primary",
    },
    {
      title: "Today's Appointments",
      value: stats.todayAppointments,
      icon: Calendar,
      description: "Scheduled for today",
      color: "text-accent",
    },
    {
      title: "Active Queue",
      value: stats.activeTickets,
      icon: ClipboardList,
      description: "Patients in queue",
      color: "text-warning",
    },
    {
      title: "Pending Payments",
      value: stats.pendingPayments,
      icon: DollarSign,
      description: "Awaiting payment",
      color: "text-destructive",
    },
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Welcome back, {userName}!</h1>
            <p className="text-muted-foreground text-lg">
              Here's what's happening in your hospital today.
            </p>
          </div>
          {!hasRole && (
            <AdminRoleAssignment userId={userId} userEmail={userEmail} />
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
              <PatientRegistrationDialog />
              <button className="w-full p-3 text-left rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors" onClick={() => navigate("/appointments")}>
                <div className="font-medium">Create Appointment</div>
                <div className="text-sm text-muted-foreground">Schedule a new appointment</div>
              </button>
              <button className="w-full p-3 text-left rounded-lg bg-success/10 hover:bg-success/20 transition-colors" onClick={() => navigate("/queue")}>
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
            <CardDescription>Latest system actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                recentActivity.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${log.action === "INSERT" ? "bg-success" : log.action === "UPDATE" ? "bg-primary" : "bg-destructive"}`}></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {log.action === "INSERT" ? "Created" : log.action === "UPDATE" ? "Updated" : log.action} in {log.module.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.created_at ? format(new Date(log.created_at), "MMM d, h:mm a") : "—"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
