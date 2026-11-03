import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileText, Download, Filter, Users, DollarSign, Activity } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PaymentsReport } from "@/components/PaymentsReport";
import { useUser } from "@/contexts/UserContext";

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

const DEPARTMENTS = ["All", "Laboratory", "Pharmacy", "Imaging", "Nursing", "Dental", "Financial"];

const Reports = () => {
  const { hasAnyRole } = useUser();
  // Finance staff (finance officer, cashier, accountant) only see the payments report
  const financeOnly = hasAnyRole(["finance_officer", "cashier", "accountant"]) && !hasAnyRole(["admin", "super_admin", "doctor", "clinical_officer", "records_officer", "auditor"]);
  const [loading, setLoading] = useState(false);
  const [department, setDepartment] = useState("All");
  const [filters, setFilters] = useState({
    ageGroup: "", gender: "", diagnosis: "", labTest: "", procedure: "", dateFrom: "", dateTo: "",
  });
  const [results, setResults] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>({ totalVisits: 0, totalRevenue: 0, genderBreakdown: [], ageBreakdown: [] });
  const [diagnoses, setDiagnoses] = useState<string[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [deptData, setDeptData] = useState<any[]>([]);

  useEffect(() => {
    if (financeOnly) return;
    fetchDropdownData();
    runReport();
  }, [financeOnly]);

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
      if (department === "All" || department === "Financial") {
        await runClinicalReport();
      }
      if (department === "Laboratory") await runLabReport();
      if (department === "Pharmacy") await runPharmacyReport();
      if (department === "Imaging") await runImagingReport();
      if (department === "Nursing" || department === "Dental") await runProcedureReport(department.toLowerCase());
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setLoading(false);
    }
  };

  const runClinicalReport = async () => {
    let query = supabase.from("encounters").select("*, patients!encounters_patient_id_fkey(patient_id, user_id)").order("encounter_date", { ascending: false });
    if (filters.dateFrom) query = query.gte("encounter_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("encounter_date", filters.dateTo + "T23:59:59");
    const { data: encounters } = await query;

    const enriched = await Promise.all(
      (encounters || []).map(async (enc) => {
        const patient = enc.patients as any;
        const { data: profile } = await supabase.from("profiles").select("full_name, gender, date_of_birth").eq("user_id", patient?.user_id).single();
        const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;
        return { ...enc, profile, age };
      })
    );

    let filtered = enriched;
    if (filters.gender && filters.gender !== "all") filtered = filtered.filter((r) => r.profile?.gender === filters.gender);
    if (filters.ageGroup && filters.ageGroup !== "all") {
      const ag = AGE_GROUPS.find((a) => a.label === filters.ageGroup);
      if (ag) filtered = filtered.filter((r) => r.age !== null && r.age >= ag.min && r.age <= ag.max);
    }
    if (filters.diagnosis && filters.diagnosis !== "all") filtered = filtered.filter((r) => r.diagnosis?.includes(filters.diagnosis));

    setResults(filtered);

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
      totalVisits: filtered.length, totalRevenue,
      genderBreakdown: Object.entries(genderMap).map(([name, value]) => ({ name, value })),
      ageBreakdown: AGE_GROUPS.map((ag) => ({ name: ag.label, count: ageMap[ag.label] || 0 })),
    });
  };

  const runLabReport = async () => {
    let query = supabase.from("lab_orders").select("*, lab_tests_catalog(test_name, category, price)").order("created_at", { ascending: false });
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");
    const { data } = await query;
    setDeptData(data || []);
    setResults((data || []).map(d => ({
      id: d.id, encounter_date: d.created_at, profile: { full_name: "-" },
      chief_complaint: d.lab_tests_catalog?.test_name, diagnosis: [d.status],
      age: null, test: d.lab_tests_catalog?.test_name, status: d.status
    })));
  };

  const runPharmacyReport = async () => {
    let query = supabase.from("prescriptions").select("*").order("created_at", { ascending: false });
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");
    const { data } = await query;
    setDeptData(data || []);
    setResults((data || []).map(d => ({
      id: d.id, encounter_date: d.created_at, profile: { full_name: "-" },
      chief_complaint: d.medication_name, diagnosis: [d.dispensed ? "Dispensed" : "Pending"],
      age: null
    })));
  };

  const runImagingReport = async () => {
    let query = supabase.from("imaging_orders").select("*, imaging_catalog(name, modality, price)").order("created_at", { ascending: false });
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");
    const { data } = await query;
    setDeptData(data || []);
    setResults((data || []).map(d => ({
      id: d.id, encounter_date: d.created_at, profile: { full_name: "-" },
      chief_complaint: d.imaging_catalog?.name, diagnosis: [d.status],
      age: null
    })));
  };

  const runProcedureReport = async (type: string) => {
    const table = type === "dental" ? "dental_procedures" : "nursing_procedures";
    let query = supabase.from(table).select("*").order("created_at", { ascending: false });
    if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
    if (filters.dateTo) query = query.lte("created_at", filters.dateTo + "T23:59:59");
    const { data } = await query;
    setDeptData(data || []);
    setResults((data || []).map((d: any) => ({
      id: d.id, encounter_date: d.created_at, profile: { full_name: "-" },
      chief_complaint: d.procedure_type || d.procedure_name, diagnosis: [],
      age: null
    })));
  };

  const getTableHeaders = () => {
    if (department === "Laboratory") return ["Date", "Test Name", "Status", "Flag"];
    if (department === "Pharmacy") return ["Date", "Medication", "Dosage", "Qty", "Status"];
    if (department === "Imaging") return ["Date", "Study", "Modality", "Status"];
    if (department === "Nursing" || department === "Dental") return ["Date", "Procedure", "Price", "Notes"];
    return ["Date", "Patient", "Gender", "Age", "Diagnosis", "Chief Complaint"];
  };

  const getTableRow = (r: any, idx: number) => {
    if (department === "Laboratory") {
      const d = deptData[idx];
      return [new Date(d?.created_at).toLocaleDateString(), d?.lab_tests_catalog?.test_name || "-", d?.status, d?.flag || "Normal"];
    }
    if (department === "Pharmacy") {
      const d = deptData[idx];
      return [new Date(d?.created_at).toLocaleDateString(), d?.medication_name, d?.dosage, String(d?.quantity), d?.dispensed ? "Dispensed" : "Pending"];
    }
    if (department === "Imaging") {
      const d = deptData[idx];
      return [new Date(d?.created_at).toLocaleDateString(), d?.imaging_catalog?.name || "-", d?.imaging_catalog?.modality || "-", d?.status];
    }
    if (department === "Nursing" || department === "Dental") {
      const d = deptData[idx];
      return [new Date(d?.created_at).toLocaleDateString(), d?.procedure_type || d?.procedure_name, d?.price ? `KES ${d.price}` : "-", d?.notes || "-"];
    }
    return [
      new Date(r.encounter_date).toLocaleDateString(),
      r.profile?.full_name || "",
      r.profile?.gender || "-",
      r.age ?? "-",
      (r.diagnosis || []).join("; "),
      r.chief_complaint || "-",
    ];
  };

  const exportCSV = () => {
    const headers = getTableHeaders();
    const rows = results.map((r, i) => getTableRow(r, i));
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${department}-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CUEA Infirmary", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("The Catholic University of Eastern Africa", pageWidth / 2, 27, { align: "center" });

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${department} Report`, pageWidth / 2, 38, { align: "center" });

    // Filters applied
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const filterText = [
      filters.dateFrom && `From: ${filters.dateFrom}`,
      filters.dateTo && `To: ${filters.dateTo}`,
      filters.gender && filters.gender !== "all" && `Gender: ${filters.gender}`,
      filters.ageGroup && filters.ageGroup !== "all" && `Age: ${filters.ageGroup}`,
      filters.diagnosis && filters.diagnosis !== "all" && `Diagnosis: ${filters.diagnosis}`,
    ].filter(Boolean).join(" | ");
    if (filterText) doc.text(filterText, 14, 45);

    // Summary
    doc.setFontSize(10);
    doc.text(`Total Records: ${results.length}`, 14, 52);
    if (department === "All" || department === "Financial") {
      doc.text(`Total Revenue: KES ${summaryData.totalRevenue.toLocaleString()}`, 14, 58);
    }

    // Table
    const headers = getTableHeaders();
    const rows = results.slice(0, 500).map((r, i) => getTableRow(r, i));

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: department === "All" || department === "Financial" ? 64 : 58,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    }

    doc.save(`${department}-report-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const u = (field: string, value: string) => setFilters((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground">Department and payment reporting with PDF, Excel & CSV export</p>
      </div>
      <Tabs defaultValue={financeOnly || new URLSearchParams(window.location.search).get("tab") === "payments" ? "payments" : "clinical"}>
        <TabsList>
          {!financeOnly && <TabsTrigger value="clinical">Department Reports</TabsTrigger>}
          <TabsTrigger value="payments">Payments Report</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-6"><PaymentsReport /></TabsContent>
        <TabsContent value="clinical" className="mt-6 space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> CSV</Button>
        <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" /> PDF</Button>
      </div>

      {/* Filter Panel */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" /> Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Records</p>
              <p className="text-2xl font-bold">{results.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">KES {summaryData.totalRevenue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="text-2xl font-bold">{department}</p>
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
                    {getTableHeaders().map(h => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow><TableCell colSpan={getTableHeaders().length} className="text-center py-8 text-muted-foreground">No results — adjust filters and generate</TableCell></TableRow>
                  ) : (
                    results.slice(0, 200).map((r, i) => (
                      <TableRow key={r.id || i}>
                        {getTableRow(r, i).map((cell, ci) => (
                          <TableCell key={ci} className={ci >= 4 ? "max-w-xs truncate" : ""}>{cell}</TableCell>
                        ))}
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
                    <Pie data={summaryData.genderBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
