import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Clock, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Department {
  name: string;
  activeStaff: number;
  patientsHandled: number;
  avgServiceTime: number;
  revenue: number;
  queueLength: number;
  performance: number;
}

const departments: Department[] = [
  { name: "Reception", activeStaff: 5, patientsHandled: 120, avgServiceTime: 5, revenue: 50000, queueLength: 8, performance: 92 },
  { name: "Consultation", activeStaff: 12, patientsHandled: 85, avgServiceTime: 25, revenue: 340000, queueLength: 12, performance: 88 },
  { name: "Laboratory", activeStaff: 8, patientsHandled: 95, avgServiceTime: 45, revenue: 180000, queueLength: 6, performance: 95 },
  { name: "Radiology", activeStaff: 6, patientsHandled: 42, avgServiceTime: 30, revenue: 210000, queueLength: 4, performance: 90 },
  { name: "Pharmacy", activeStaff: 7, patientsHandled: 110, avgServiceTime: 10, revenue: 280000, queueLength: 5, performance: 94 },
  { name: "Billing", activeStaff: 4, patientsHandled: 98, avgServiceTime: 8, revenue: 0, queueLength: 3, performance: 96 },
  { name: "Emergency", activeStaff: 10, patientsHandled: 18, avgServiceTime: 15, revenue: 120000, queueLength: 2, performance: 98 },
  { name: "Wards", activeStaff: 15, patientsHandled: 45, avgServiceTime: 0, revenue: 450000, queueLength: 0, performance: 87 },
];

export const DepartmentSummary = () => {
  const getPerformanceColor = (performance: number) => {
    if (performance >= 90) return "text-success";
    if (performance >= 75) return "text-warning";
    return "text-destructive";
  };

  const getPerformanceBadge = (performance: number) => {
    if (performance >= 90) return <Badge className="bg-success">Excellent</Badge>;
    if (performance >= 75) return <Badge className="bg-warning">Good</Badge>;
    return <Badge variant="destructive">Needs Attention</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Departmental Summary</h2>
        <p className="text-muted-foreground">Real-time overview of all departments</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {departments.map((dept) => (
          <Card key={dept.name} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{dept.name}</CardTitle>
                {getPerformanceBadge(dept.performance)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Staff on Duty</span>
                </div>
                <span className="font-medium">{dept.activeStaff}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Patients Today</span>
                </div>
                <span className="font-medium">{dept.patientsHandled}</span>
              </div>

              {dept.avgServiceTime > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Avg. Time</span>
                  </div>
                  <span className="font-medium">{dept.avgServiceTime} min</span>
                </div>
              )}

              {dept.revenue > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Revenue</span>
                  </div>
                  <span className="font-medium">KES {(dept.revenue / 1000).toFixed(0)}K</span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Queue Length</span>
                <span className={`font-medium ${dept.queueLength > 10 ? 'text-destructive' : ''}`}>
                  {dept.queueLength}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Performance</span>
                  <span className={`font-medium ${getPerformanceColor(dept.performance)}`}>
                    {dept.performance}%
                  </span>
                </div>
                <Progress value={dept.performance} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
