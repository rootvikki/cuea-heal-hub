import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, FileText, Download } from "lucide-react";

const MODULES = [
  "all", "patient_registration", "queue", "vitals", "consultation",
  "laboratory", "pharmacy", "imaging", "billing", "dental",
  "staff_onboarding", "role_management", "system",
];

const AuditLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { fetchLogs(); }, [moduleFilter, dateFrom, dateTo]);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (moduleFilter !== "all") query = query.eq("module", moduleFilter);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  const filtered = logs.filter(log => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action?.toLowerCase().includes(s) ||
      log.module?.toLowerCase().includes(s) ||
      log.payroll_number?.toLowerCase().includes(s) ||
      log.staff_id?.toLowerCase().includes(s) ||
      JSON.stringify(log.details)?.toLowerCase().includes(s)
    );
  });

  const exportCSV = () => {
    const headers = ["Timestamp", "Action", "Module", "Staff ID", "Payroll No", "User ID", "Details"];
    const rows = filtered.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.action, l.module, l.staff_id || "", l.payroll_number || "",
      l.user_id || "", JSON.stringify(l.details || {}),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" /> Audit Logs
          </h1>
          <p className="text-muted-foreground">Complete system activity trail with timestamps and staff IDs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search actions, staff ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent>
                {MODULES.map(m => (
                  <SelectItem key={m} value={m}>{m === "all" ? "All Modules" : m.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Payroll No</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audit logs found</TableCell></TableRow>
                ) : (
                  filtered.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.module?.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-sm font-mono">{log.staff_id || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{log.payroll_number || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {log.details ? JSON.stringify(log.details).slice(0, 100) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 text-sm text-muted-foreground">
            Showing {filtered.length} of {logs.length} entries
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;
