import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminRoleAssignment } from "@/components/AdminRoleAssignment";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import { DashboardSkeleton } from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, Calendar, ClipboardList, DollarSign, Activity, Pill,
  Stethoscope, TestTube, Camera, Heart, Shield, FileText, Package, AlertTriangle, Receipt
} from "lucide-react";
import { format } from "date-fns";

const ROLE_PRIORITY = [
  "super_admin", "admin", "doctor", "clinical_officer", "nurse", "ward_manager",
  "receptionist", "lab_technician", "radiologist", "pharmacist", "finance_officer",
  "cashier", "accountant", "hr_admin", "records_officer", "auditor", "patient",
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, profile, roles } = useUser();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };
  const hasRole = roles.length > 0;

  // Determine primary role
  const primaryRole = ROLE_PRIORITY.find(r => roles.includes(r)) || "patient";

  // Redirect patients to portal
  useEffect(() => {
    if (!statsLoading && primaryRole === "patient" && roles.length === 1) {
      navigate("/portal", { replace: true });
    }
  }, [primaryRole, roles, statsLoading]);

  useEffect(() => {
    fetchStats();
  }, [primaryRole]);

  const fetchStats = async () => {
    const today = new Date().toISOString().split("T")[0];
    const queries: Record<string, () => PromiseLike<any>> = {};

    if (["super_admin", "admin", "receptionist"].includes(primaryRole)) {
      queries.totalPatients = () => supabase.from("patients").select("id", { count: "exact", head: true });
      queries.todayAppointments = () => supabase.from("appointments").select("id", { count: "exact", head: true }).gte("appointment_date", today);
      queries.activeTickets = () => supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "checked_out");
      queries.pendingPayments = () => supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending");
    }

    if (["doctor", "clinical_officer"].includes(primaryRole)) {
      queries.myQueue = () => supabase.from("tickets").select("id", { count: "exact", head: true }).in("workflow_stage", ["waiting_for_doctor", "in_consult"]);
      queries.pendingLabs = () => supabase.from("lab_orders").select("id", { count: "exact", head: true }).neq("status", "completed");
      queries.pendingImaging = () => supabase.from("imaging_orders").select("id", { count: "exact", head: true }).neq("status", "completed");
    }

    if (primaryRole === "nurse") {
      queries.triageQueue = () => supabase.from("tickets").select("id", { count: "exact", head: true }).in("workflow_stage", ["checked_in", "triage"]);
      queries.activeTickets = () => supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "checked_out");
    }

    if (primaryRole === "lab_technician") {
      queries.pendingLabs = () => supabase.from("lab_orders").select("id", { count: "exact", head: true }).eq("status", "pending");
      queries.completedToday = () => supabase.from("lab_orders").select("id", { count: "exact", head: true }).eq("status", "completed").gte("result_entered_at", today);
    }

    if (primaryRole === "pharmacist") {
      queries.pendingRx = () => supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("dispensed", false);
      queries.lowStock = () => supabase.from("pharmacy_inventory").select("id, quantity, reorder_level");
    }

    if (primaryRole === "radiologist") {
      queries.pendingImaging = () => supabase.from("imaging_orders").select("id", { count: "exact", head: true }).neq("status", "completed");
      queries.completedToday = () => supabase.from("imaging_orders").select("id", { count: "exact", head: true }).eq("status", "completed").gte("reported_at", today);
    }

    if (["finance_officer", "cashier"].includes(primaryRole)) {
      queries.pendingPayments = () => supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending");
      queries.paidToday = () => supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "paid").gte("updated_at", today);
    }

    if (["super_admin", "admin"].includes(primaryRole)) {
      queries.activity = () => supabase.from("audit_logs").select("id, action, module, created_at").order("created_at", { ascending: false }).limit(6);
    }

    const results: Record<string, number> = {};
    const entries = Object.entries(queries);
    const responses = await Promise.all(entries.map(([, fn]) => fn()));

    entries.forEach(([key], i) => {
      const res = responses[i];
      if (key === "activity") {
        setRecentActivity(res.data || []);
      } else if (key === "lowStock") {
        const items = res.data || [];
        results[key] = items.filter((i: any) => i.quantity <= (i.reorder_level || 50)).length;
      } else {
        results[key] = res.count || 0;
      }
    });

    setStats(results);
    setStatsLoading(false);
  };

  if (statsLoading) return <DashboardSkeleton />;

  const renderAdminDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Patients" value={stats.totalPatients} icon={Users} description="Registered patients" color="text-primary" onClick={() => navigate("/patients")} />
        <StatCard title="Today's Appointments" value={stats.todayAppointments} icon={Calendar} description="Scheduled for today" color="text-accent" onClick={() => navigate("/appointments")} />
        <StatCard title="Active Queue" value={stats.activeTickets} icon={ClipboardList} description="Patients in queue" color="text-warning" onClick={() => navigate("/queue")} />
        <StatCard title="Pending Payments" value={stats.pendingPayments} icon={DollarSign} description="Awaiting payment" color="text-destructive" onClick={() => navigate("/billing")} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-success" />Quick Actions</CardTitle>
            <CardDescription>Frequently used functions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <PatientRegistrationDialog />
            <QuickActionButton label="Create Appointment" desc="Schedule a new appointment" onClick={() => navigate("/appointments")} icon={Calendar} />
            <QuickActionButton label="Check-in Patient" desc="Generate queue ticket" onClick={() => navigate("/queue")} icon={ClipboardList} />
            <QuickActionButton label="Manage Users" desc="User accounts & roles" onClick={() => navigate("/admin/users")} icon={Users} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-warning" />Recent Activity</CardTitle>
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
                      <p className="text-sm font-medium">{log.action === "INSERT" ? "Created" : log.action === "UPDATE" ? "Updated" : log.action} in {log.module.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{log.created_at ? format(new Date(log.created_at), "MMM d, h:mm a") : "—"}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderDoctorDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="My Queue" value={stats.myQueue} icon={Stethoscope} description="Patients waiting" color="text-primary" />
        <StatCard title="Pending Lab Results" value={stats.pendingLabs} icon={TestTube} description="Awaiting results" color="text-warning" />
        <StatCard title="Pending Imaging" value={stats.pendingImaging} icon={Camera} description="Awaiting results" color="text-accent" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" />Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <QuickActionButton label="Start Consultation" desc="Open consultation workspace" onClick={() => navigate("/consultation")} icon={Stethoscope} />
            <QuickActionButton label="View Lab Results" desc="Check lab orders" onClick={() => navigate("/laboratory")} icon={TestTube} />
            <QuickActionButton label="View Imaging" desc="Check imaging results" onClick={() => navigate("/imaging")} icon={Camera} />
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderNurseDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Triage Queue" value={stats.triageQueue} icon={Heart} description="Awaiting triage" color="text-destructive" />
        <StatCard title="Active Patients" value={stats.activeTickets} icon={ClipboardList} description="In facility" color="text-primary" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QuickActionButton label="Start Triage" desc="Record vitals & procedures" onClick={() => navigate("/vitals")} icon={Activity} />
          <QuickActionButton label="Inpatient Ward" desc="Nursing notes & bed management" onClick={() => navigate("/inpatient")} icon={Heart} />
        </CardContent>
      </Card>
    </>
  );

  const renderLabDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending Orders" value={stats.pendingLabs} icon={TestTube} description="Awaiting results" color="text-warning" />
        <StatCard title="Completed Today" value={stats.completedToday} icon={Activity} description="Results entered" color="text-success" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QuickActionButton label="Enter Lab Results" desc="Process pending orders" onClick={() => navigate("/laboratory")} icon={TestTube} />
        </CardContent>
      </Card>
    </>
  );

  const renderPharmacistDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending Prescriptions" value={stats.pendingRx} icon={Pill} description="Awaiting dispensing" color="text-primary" />
        <StatCard title="Low Stock Alerts" value={stats.lowStock} icon={AlertTriangle} description="Below reorder level" color="text-destructive" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QuickActionButton label="Dispense Medications" desc="Process prescriptions" onClick={() => navigate("/pharmacy")} icon={Pill} />
        </CardContent>
      </Card>
    </>
  );

  const renderRadiologistDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending Studies" value={stats.pendingImaging} icon={Camera} description="Awaiting processing" color="text-warning" />
        <StatCard title="Completed Today" value={stats.completedToday} icon={Activity} description="Reports submitted" color="text-success" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QuickActionButton label="Imaging Worklist" desc="Process pending orders" onClick={() => navigate("/imaging")} icon={Camera} />
        </CardContent>
      </Card>
    </>
  );

  const renderFinanceDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending Invoices" value={stats.pendingPayments} icon={Receipt} description="Awaiting payment" color="text-warning" />
        <StatCard title="Paid Today" value={stats.paidToday} icon={DollarSign} description="Payments received" color="text-success" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <QuickActionButton label="Process Payments" desc="Billing & invoices" onClick={() => navigate("/billing")} icon={Receipt} />
          <QuickActionButton label="Insurance Claims" desc="Manage claims" onClick={() => navigate("/insurance")} icon={Shield} />
        </CardContent>
      </Card>
    </>
  );

  const renderReceptionistDashboard = () => (
    <>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Patients" value={stats.totalPatients} icon={Users} description="Registered" color="text-primary" />
        <StatCard title="Today's Appointments" value={stats.todayAppointments} icon={Calendar} description="Scheduled" color="text-accent" />
        <StatCard title="Active Queue" value={stats.activeTickets} icon={ClipboardList} description="In facility" color="text-warning" />
        <StatCard title="Pending Payments" value={stats.pendingPayments} icon={DollarSign} description="Awaiting" color="text-destructive" />
      </div>
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <PatientRegistrationDialog />
          <QuickActionButton label="Check-in Patient" desc="Generate queue ticket" onClick={() => navigate("/queue")} icon={ClipboardList} />
          <QuickActionButton label="Appointments" desc="View & manage appointments" onClick={() => navigate("/appointments")} icon={Calendar} />
        </CardContent>
      </Card>
    </>
  );

  const getDashboardContent = () => {
    switch (primaryRole) {
      case "super_admin":
      case "admin":
        return renderAdminDashboard();
      case "doctor":
      case "clinical_officer":
        return renderDoctorDashboard();
      case "nurse":
      case "ward_manager":
        return renderNurseDashboard();
      case "receptionist":
        return renderReceptionistDashboard();
      case "lab_technician":
        return renderLabDashboard();
      case "pharmacist":
        return renderPharmacistDashboard();
      case "radiologist":
        return renderRadiologistDashboard();
      case "finance_officer":
      case "cashier":
      case "accountant":
        return renderFinanceDashboard();
      default:
        return renderAdminDashboard();
    }
  };

  const roleLabel = primaryRole.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold">{getGreeting()}, {userName}!</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground text-lg">Here's your dashboard overview</p>
              <Badge variant="secondary" className="text-xs">{roleLabel}</Badge>
            </div>
          </div>
          {!hasRole && user && (
            <AdminRoleAssignment userId={user.id} userEmail={user.email || ""} />
          )}
        </div>
      </div>
      {getDashboardContent()}
    </div>
  );
};

// Reusable stat card
const StatCard = ({ title, value, icon: Icon, description, color, onClick }: {
  title: string; value: number | undefined; icon: any; description: string; color: string; onClick?: () => void;
}) => (
  <Card
    className={`hover:shadow-lg hover:scale-[1.02] transition-all duration-200 ${onClick ? "cursor-pointer active:scale-[0.98]" : "cursor-default"}`}
    onClick={onClick}
  >
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <div className="p-2 rounded-full bg-muted">
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">{value ?? 0}</div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </CardContent>
  </Card>
);

// Quick action button
const QuickActionButton = ({ label, desc, onClick, icon: Icon }: { label: string; desc: string; onClick: () => void; icon?: any }) => (
  <button className="w-full p-3 text-left rounded-lg bg-muted/50 hover:bg-muted transition-all duration-150 hover:translate-x-1 flex items-center gap-3" onClick={onClick}>
    {Icon && (
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
    )}
    <div>
      <div className="font-medium">{label}</div>
      <div className="text-sm text-muted-foreground">{desc}</div>
    </div>
  </button>
);

export default Dashboard;
