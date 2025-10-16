import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Calendar, Pill, TestTube, Receipt, ClipboardList } from "lucide-react";

interface DashboardStat {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
  color: string;
}

interface RoleBasedDashboardProps {
  role: string;
  stats: any;
  children?: ReactNode;
}

export const RoleBasedDashboard = ({ role, stats, children }: RoleBasedDashboardProps) => {
  const getDashboardConfig = () => {
    switch (role) {
      case "super_admin":
      case "admin":
        return {
          title: "System Overview",
          stats: [
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
              description: "Scheduled today",
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
              icon: Receipt,
              description: "Awaiting payment",
              color: "text-destructive",
            },
          ],
        };

      case "doctor":
        return {
          title: "Doctor Dashboard",
          stats: [
            {
              title: "My Appointments Today",
              value: stats.myAppointments || 0,
              icon: Calendar,
              description: "Scheduled appointments",
              color: "text-primary",
            },
            {
              title: "Patients in Queue",
              value: stats.patientsWaiting || 0,
              icon: Users,
              description: "Waiting to be seen",
              color: "text-warning",
            },
            {
              title: "Lab Results Pending",
              value: stats.labResultsPending || 0,
              icon: TestTube,
              description: "Awaiting results",
              color: "text-accent",
            },
            {
              title: "Follow-ups Required",
              value: stats.followUps || 0,
              icon: Activity,
              description: "Need follow-up",
              color: "text-success",
            },
          ],
        };

      case "nurse":
        return {
          title: "Nurse Dashboard",
          stats: [
            {
              title: "Patients to Triage",
              value: stats.patientsToTriage || 0,
              icon: Activity,
              description: "Awaiting triage",
              color: "text-warning",
            },
            {
              title: "Vitals to Record",
              value: stats.vitalsNeeded || 0,
              icon: Activity,
              description: "Pending vitals",
              color: "text-primary",
            },
            {
              title: "Active Ward Patients",
              value: stats.wardPatients || 0,
              icon: Users,
              description: "In your ward",
              color: "text-accent",
            },
            {
              title: "Tasks Pending",
              value: stats.nursingTasks || 0,
              icon: ClipboardList,
              description: "Tasks to complete",
              color: "text-success",
            },
          ],
        };

      case "pharmacist":
        return {
          title: "Pharmacy Dashboard",
          stats: [
            {
              title: "Pending Prescriptions",
              value: stats.pendingPrescriptions || 0,
              icon: Pill,
              description: "To be dispensed",
              color: "text-warning",
            },
            {
              title: "Low Stock Items",
              value: stats.lowStock || 0,
              icon: Activity,
              description: "Need reordering",
              color: "text-destructive",
            },
            {
              title: "Dispensed Today",
              value: stats.dispensedToday || 0,
              icon: Pill,
              description: "Prescriptions filled",
              color: "text-success",
            },
            {
              title: "Inventory Value",
              value: `KES ${stats.inventoryValue || 0}`,
              icon: Receipt,
              description: "Total stock value",
              color: "text-primary",
            },
          ],
        };

      case "lab_technician":
        return {
          title: "Laboratory Dashboard",
          stats: [
            {
              title: "Pending Tests",
              value: stats.pendingTests || 0,
              icon: TestTube,
              description: "Awaiting processing",
              color: "text-warning",
            },
            {
              title: "In Progress",
              value: stats.testsInProgress || 0,
              icon: Activity,
              description: "Currently running",
              color: "text-primary",
            },
            {
              title: "Completed Today",
              value: stats.completedToday || 0,
              icon: TestTube,
              description: "Tests completed",
              color: "text-success",
            },
            {
              title: "Results to Upload",
              value: stats.resultsToUpload || 0,
              icon: ClipboardList,
              description: "Need uploading",
              color: "text-accent",
            },
          ],
        };

      case "receptionist":
        return {
          title: "Reception Dashboard",
          stats: [
            {
              title: "Today's Appointments",
              value: stats.todayAppointments || 0,
              icon: Calendar,
              description: "Scheduled today",
              color: "text-primary",
            },
            {
              title: "Checked-in Patients",
              value: stats.checkedIn || 0,
              icon: Users,
              description: "Currently checked in",
              color: "text-success",
            },
            {
              title: "Pending Check-ins",
              value: stats.pendingCheckins || 0,
              icon: ClipboardList,
              description: "Need check-in",
              color: "text-warning",
            },
            {
              title: "New Registrations",
              value: stats.newRegistrations || 0,
              icon: Users,
              description: "Registered today",
              color: "text-accent",
            },
          ],
        };

      case "cashier":
      case "finance_officer":
      case "accountant":
        return {
          title: "Finance Dashboard",
          stats: [
            {
              title: "Pending Invoices",
              value: stats.pendingInvoices || 0,
              icon: Receipt,
              description: "Awaiting payment",
              color: "text-warning",
            },
            {
              title: "Today's Collections",
              value: `KES ${stats.todayCollections || 0}`,
              icon: Receipt,
              description: "Collected today",
              color: "text-success",
            },
            {
              title: "Outstanding Balance",
              value: `KES ${stats.outstanding || 0}`,
              icon: Activity,
              description: "Total outstanding",
              color: "text-destructive",
            },
            {
              title: "Processed Today",
              value: stats.processedPayments || 0,
              icon: ClipboardList,
              description: "Payments processed",
              color: "text-primary",
            },
          ],
        };

      default:
        return {
          title: "Dashboard",
          stats: [],
        };
    }
  };

  const config = getDashboardConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{config.title}</h2>
        <p className="text-muted-foreground">Your personalized overview</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {config.stats.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow">
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

      {children}
    </div>
  );
};
