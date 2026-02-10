import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { FileText, Download, Filter, Users, DollarSign, Activity } from "lucide-react";

const AGE_GROUPS = [
  { label: "0-5 years", min: 0, max: 5 },
  { label: "6-14 years", min: 6, max: 14 },
  { label: "15-24 years", min: 15, max: 24 },
  { label: "25-34 years", min: 25, max: 34 },
  { label: "35-44 years", min: 35, max: 44 },
  { label: "45-54 years", min: 45, max: 54 },
  { label: "55-64 years", min: 55, max: 64 },
  { label: "65+ years", min: 65, max: 200 },
];
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FF6B6B", "#4ECDC4"];

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    ageGroup: "", gender: "", diagnosis: "", labTest: "", procedure: "", dateFrom: "", dateTo: "",
  });
  const [results, setResults] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>({ totalVisits: 0, totalRevenue: 0, genderBreakdown: [], ageBreakdown: [] });
  const [diagnoses, setDiagnoses] = useState<string[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);

  useEffect(() => {
    fetchDropdownData();
    runReport();
  }, []);

  const fetchDropdownData = async () => {
    const { data: labs } = await supabase.from("lab_tests_catalog").select("id, test_name").order("test_name");
    setLabTests(labs || []);

    const { data: encounters } = await supabase.from("encounters").select("diagnosis").not("diagnosis", "is", null);
    const diagSet = new Set<string>();
    encounters?.forEach((e) => e.diagnosis?.forEach((d: string) => diagSet.add(d)));
    setDiagnoses(Array.from(diagSet).sort());
  };

  const runReport = async () => {
    setLoading(true);
    try {
      // Build query for encounters with patient profiles
      let query = supabase.from("encounters").select("*, patients!encounters_patient_id_fkey(patient_id, user_id)").order("encounter_date", { ascending: false });

      if (filters.dateFrom) query = query.gte("encounter_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("encounter_date", filters.dateTo + "T23:59:59");

      const { data: encounters } = await query;

      // Enrich with profile data
      const enriched = await Promise.all(
        (encounters || []).map(async (enc) => {
          const patient = enc.patients as any;
          const { data: profile } = await supabase.from("profiles").select("full_name, gender, date_of_birth").eq("user_id", patient?.user_id).single();
          const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;
          return { ...enc, profile, age };
        })
      );

      // Apply client-side filters
      let filtered = enriched;
      if (filters.gender) filtered = filtered.filter((r) => r.profile?.gender === filters.gender);
      if (filters.ageGroup) {
        const ag = AGE_GROUPS.find((a) => a.label === filters.ageGroup);
        if (ag) filtered = filtered.filter((r) => r.age !== null && r.age >= ag.min && r.age <= ag.max);
      }
      if (filters.diagnosis) filtered = filtered.filter((r) => r.diagnosis?.includes(filters.diagnosis));

      setResults(filtered);

      // Summary calculations
      const genderMap: Record<string, number> = {};
      const ageMap: Record<string, number> = {};
      filtered.forEach((r) => {
        const g = r.profile?.gender || "Unknown";
        genderMap[g] = (genderMap[g] || 0) + 1;
        const ag = AGE_GROUPS.find((a) => r.age !== null && r.age >= a.min && r.age <= a.max);
        if (ag) ageMap[ag.label] = (ageMap[ag.label] || 0) + 1;
      });

      const { data: invoices } = await supabase.from("invoices").select("amount_paid, created_at")
        .gte("created_at", filters.dateFrom || "2000-01-01")
        .lte("created_at", (filters.dateTo || "2099-12-31") + "T23:59:59");

      const totalRevenue = invoices?.reduce((s, i) => s + (i.amount_paid || 0), 0) || 0;

      setSummaryData({
        totalVisits: filtered.length,
        totalRevenue,
        genderBreakdown: Object.entries(genderMap).map(([name, value]) => ({ name, value })),
        ageBreakdown: AGE_GROUPS.map((ag) => ({ name: ag.label, count: ageMap[ag.label] || 0 })),
      });
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Date", "Patient", "Gender", "Age", "Diagnosis", "Chief Complaint"];
    const rows = results.map((r) => [
      new Date(r.encounter_date).toLocaleDateString(),
      r.profile?.full_name || "",
      r.profile?.gender || "",
      r.age || "",
      (r.diagnosis || []).join("; "),
      r.chief_complaint || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const u = (field: string, value: string) => setFilters((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Multi-filter clinical and financial reporting</p>
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>

      {/* Filter Panel */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Age Group</Label>
              <Select value={filters.ageGroup} onValueChange={(v) => u("ageGroup", v)}>
                <SelectTrigger><SelectValue placeholder="All ages" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ages</SelectItem>
                  {AGE_GROUPS.map((ag) => <SelectItem key={ag.label} value={ag.label}>{ag.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={filters.gender} onValueChange={(v) => u("gender", v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Diagnosis</Label>
              <Select value={filters.diagnosis} onValueChange={(v) => u("diagnosis", v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {diagnoses.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lab Test</Label>
              <Select value={filters.labTest} onValueChange={(v) => u("labTest", v)}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {labTests.map((t) => <SelectItem key={t.id} value={t.id}>{t.test_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div className="space-y-1">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={filters.dateFrom} onChange={(e) => u("dateFrom", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={filters.dateTo} onChange={(e) => u("dateTo", e.target.value)} />
            </div>
            <div className="col-span-2 flex items-end">
              <Button onClick={runReport} disabled={loading} className="w-full">{loading ? "Loading..." : "Generate Report"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-sm text-muted-foreground">Total Visits</p>
              <p className="text-2xl font-bold">{summaryData.totalVisits}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">KES {summaryData.totalRevenue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-8 w-8 text-purple-600" />
            <div>
              <p className="text-sm text-muted-foreground">Avg per Day</p>
              <p className="text-2xl font-bold">
                {filters.dateFrom && filters.dateTo
                  ? Math.round(summaryData.totalVisits / Math.max(1, Math.ceil((new Date(filters.dateTo).getTime() - new Date(filters.dateFrom).getTime()) / 86400000)))
                  : summaryData.totalVisits}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Data Table</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Chief Complaint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No results</TableCell></TableRow>
                  ) : (
                    results.slice(0, 100).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{new Date(r.encounter_date).toLocaleDateString()}</TableCell>
                        <TableCell>{r.profile?.full_name}</TableCell>
                        <TableCell>{r.profile?.gender || "-"}</TableCell>
                        <TableCell>{r.age ?? "-"}</TableCell>
                        <TableCell>{(r.diagnosis || []).join(", ") || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.chief_complaint || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Gender Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={summaryData.genderBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {summaryData.genderBreakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Age Group Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={summaryData.ageBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
