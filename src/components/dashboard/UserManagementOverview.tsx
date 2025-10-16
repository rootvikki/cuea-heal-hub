import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, UserCheck, UserX, Shield, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RoleSummary {
  role: string;
  count: number;
  active: number;
}

export const UserManagementOverview = () => {
  const [totalUsers, setTotalUsers] = useState(0);
  const [newUsersThisMonth, setNewUsersThisMonth] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [roleSummaries, setRoleSummaries] = useState<RoleSummary[]>([]);

  useEffect(() => {
    fetchUserStats();
  }, []);

  const fetchUserStats = async () => {
    // Get total users from profiles
    const { count: totalCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    setTotalUsers(totalCount || 0);

    // Get new users this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const { count: newCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", firstDayOfMonth.toISOString());

    setNewUsersThisMonth(newCount || 0);

    // Get role distribution
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role");

    if (rolesData) {
      const roleCounts: { [key: string]: number } = {};
      rolesData.forEach((item) => {
        const role = item.role;
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });

      const summaries: RoleSummary[] = Object.entries(roleCounts).map(([role, count]) => ({
        role,
        count,
        active: count, // Simplified - in production, track actual activity
      }));

      setRoleSummaries(summaries);
      setActiveUsers(rolesData.length);
    }
  };

  const getRoleIcon = (role: string) => {
    const icons: { [key: string]: any } = {
      super_admin: Shield,
      admin: Shield,
      doctor: Activity,
      nurse: Activity,
      default: Users,
    };
    return icons[role] || icons.default;
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: { [key: string]: string } = {
      super_admin: "bg-destructive",
      admin: "bg-primary",
      doctor: "bg-success",
      nurse: "bg-accent",
      pharmacist: "bg-warning",
      lab_technician: "bg-secondary",
    };
    return colors[role] || "bg-muted";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">User Management Overview</h2>
        <p className="text-muted-foreground">System users and role distribution</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All registered users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New This Month</CardTitle>
            <UserPlus className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newUsersThisMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Recently registered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              With assigned roles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers - activeUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              No roles assigned
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users by Role</CardTitle>
          <CardDescription>Distribution of system roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {roleSummaries.map((summary) => {
              const Icon = getRoleIcon(summary.role);
              return (
                <div
                  key={summary.role}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${getRoleBadgeColor(summary.role)}/10`}>
                      <Icon className={`h-4 w-4 ${getRoleBadgeColor(summary.role).replace('bg-', 'text-')}`} />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{summary.role.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.active} active
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-bold">
                    {summary.count}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
