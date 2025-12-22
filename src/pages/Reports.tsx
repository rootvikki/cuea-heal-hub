import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { FileText, TrendingUp, Users, DollarSign, Activity, Download, Calendar } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

interface DailyStats {
  date: string;
  patients: number;
  appointments: number;
  revenue: number;
}

interface DepartmentStats {
  name: string;
  patients: number;
  revenue: number;
}

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("7days");
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [departmentStats, setDepartmentStats] = useState<DepartmentStats[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    totalPatients: 0,
    totalAppointments: 0,
    totalRevenue: 0,
    totalPending: 0,
    avgWaitTime: 0,
    bedOccupancy: 0,
  });
  const [topDiagnoses, setTopDiagnoses] = useState<{ diagnosis: string; count: number }[]>([]);
  const [topMedications, setTopMedications] = useState<{ medication: string; count: number }[]>([]);

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const days = period === "7days" ? 7 : period === "30days" ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch patients
      const { data: patients, error: patientsError } = await supabase
        .from("patients")
        .select("created_at")
        .gte("created_at", startDate.toISOString());

      if (patientsError) throw patientsError;

      // Fetch appointments
      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("appointment_date, status, department_id")
        .gte("appointment_date", startDate.toISOString());

      if (appointmentsError) throw appointmentsError;

      // Fetch invoices for revenue
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("net_amount, amount_paid, balance, status, created_at")
        .gte("created_at", startDate.toISOString());

      if (invoicesError) throw invoicesError;

      // Fetch departments
      const { data: departments, error: deptError } = await supabase
        .from("departments")
        .select("id, name");

      if (deptError) throw deptError;

      // Fetch prescriptions
      const { data: prescriptions, error: prescError } = await supabase
        .from("prescriptions")
        .select("medication_name")
        .gte("created_at", startDate.toISOString());

      if (prescError) throw prescError;

      // Fetch encounters for diagnoses
      const { data: encounters, error: encError } = await supabase
        .from("encounters")
        .select("diagnosis")
        .gte("created_at", startDate.toISOString());

      if (encError) throw encError;

      // Fetch bed stats
      const { data: beds, error: bedsError } = await supabase
        .from("beds")
        .select("status");

      if (bedsError) throw bedsError;

      // Calculate summary stats
      const totalRevenue = invoices?.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) || 0;
      const totalPending = invoices?.reduce((sum, inv) => sum + (inv.balance || 0), 0) || 0;
      const totalBeds = beds?.length || 0;
      const occupiedBeds = beds?.filter((b) => b.status === "occupied").length || 0;

      setSummaryStats({
        totalPatients: patients?.length || 0,
        totalAppointments: appointments?.length || 0,
        totalRevenue,
        totalPending,
        avgWaitTime: 25, // Placeholder
        bedOccupancy: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      });

      // Calculate daily stats
      const dailyMap: Record<string, DailyStats> = {};
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        dailyMap[dateStr] = { date: dateStr, patients: 0, appointments: 0, revenue: 0 };
      }

      patients?.forEach((p) => {
        const dateStr = new Date(p.created_at).toISOString().split("T")[0];
        if (dailyMap[dateStr]) dailyMap[dateStr].patients++;
      });

      appointments?.forEach((a) => {
        const dateStr = new Date(a.appointment_date).toISOString().split("T")[0];
        if (dailyMap[dateStr]) dailyMap[dateStr].appointments++;
      });

      invoices?.forEach((inv) => {
        const dateStr = new Date(inv.created_at).toISOString().split("T")[0];
        if (dailyMap[dateStr]) dailyMap[dateStr].revenue += inv.amount_paid || 0;
      });

      setDailyStats(Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)));

      // Calculate department stats
      const deptMap: Record<string, DepartmentStats> = {};
      departments?.forEach((d) => {
        deptMap[d.id] = { name: d.name, patients: 0, revenue: 0 };
      });

      appointments?.forEach((a) => {
        if (a.department_id && deptMap[a.department_id]) {
          deptMap[a.department_id].patients++;
        }
      });

      setDepartmentStats(Object.values(deptMap).filter((d) => d.patients > 0));

      // Calculate top medications
      const medCounts: Record<string, number> = {};
      prescriptions?.forEach((p) => {
        medCounts[p.medication_name] = (medCounts[p.medication_name] || 0) + 1;
      });
      setTopMedications(
        Object.entries(medCounts)
          .map(([medication, count]) => ({ medication, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      );

      // Calculate top diagnoses
      const diagCounts: Record<string, number> = {};
      encounters?.forEach((e) => {
        if (e.diagnosis) {
          e.diagnosis.forEach((d: string) => {
            diagCounts[d] = (diagCounts[d] || 0) + 1;
          });
        }
      });
      setTopDiagnoses(
        Object.entries(diagCounts)
          .map(([diagnosis, count]) => ({ diagnosis, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      );
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Comprehensive hospital performance metrics</p>
        </div>
        <div className="flex gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">New Patients</span>
            </div>
            <p className="text-2xl font-bold">{summaryStats.totalPatients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Appointments</span>
            </div>
            <p className="text-2xl font-bold">{summaryStats.totalAppointments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <span className="text-sm text-muted-foreground">Revenue</span>
            </div>
            <p className="text-2xl font-bold">KES {summaryStats.totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold">KES {summaryStats.totalPending.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Avg Wait Time</span>
            </div>
            <p className="text-2xl font-bold">{summaryStats.avgWaitTime} min</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-red-600" />
              <span className="text-sm text-muted-foreground">Bed Occupancy</span>
            </div>
            <p className="text-2xl font-bold">{summaryStats.bedOccupancy}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Patient Flow</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString("en", { month: "short", day: "numeric" })} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="patients" stroke="#8884d8" name="New Patients" />
                    <Line type="monotone" dataKey="appointments" stroke="#82ca9d" name="Appointments" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Department Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={departmentStats}
                      dataKey="patients"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {departmentStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString("en", { month: "short", day: "numeric" })} />
                  <YAxis tickFormatter={(val) => `KES ${(val / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [`KES ${Number(value).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Diagnoses</CardTitle>
            </CardHeader>
            <CardContent>
              {topDiagnoses.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No diagnosis data available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Diagnosis</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDiagnoses.map((d, index) => (
                      <TableRow key={d.diagnosis}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{d.diagnosis}</TableCell>
                        <TableCell className="text-right">{d.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pharmacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Prescribed Medications</CardTitle>
            </CardHeader>
            <CardContent>
              {topMedications.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No prescription data available</p>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={topMedications} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="medication" width={150} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" name="Prescriptions" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
