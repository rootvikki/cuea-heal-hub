import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { StationQueue } from "@/components/StationQueue";
import { TestTube, Search } from "lucide-react";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";

// Structured result field definitions per test type
const STRUCTURED_FIELDS: Record<string, { name: string; unit?: string; ref?: string; refMale?: string; refFemale?: string }[]> = {
  "Full Hemogram": [
    { name: "WBC", unit: "x10³/µL", ref: "4.0-10.0" },
    { name: "NEU#", unit: "x10³/µL", ref: "2.0-7.0" },
    { name: "LYM#", unit: "x10³/µL", ref: "1.0-3.0" },
    { name: "MON#", unit: "x10³/µL", ref: "0.2-1.0" },
    { name: "EOS#", unit: "x10³/µL", ref: "0.02-0.5" },
    { name: "BAS#", unit: "x10³/µL", ref: "0.0-0.1" },
    { name: "RBC", unit: "x10⁶/µL", refMale: "4.5-5.5", refFemale: "3.8-4.8" },
    { name: "HGB", unit: "g/dL", refMale: "13.0-17.0", refFemale: "12.0-16.0" },
    { name: "HCT", unit: "%", refMale: "40-54", refFemale: "36-48" },
    { name: "MCV", unit: "fL", ref: "80-100" },
    { name: "MCH", unit: "pg", ref: "27-33" },
    { name: "MCHC", unit: "g/dL", ref: "32-36" },
    { name: "RDW", unit: "%", ref: "11.5-14.5" },
    { name: "PLT", unit: "x10³/µL", ref: "150-400" },
    { name: "MPV", unit: "fL", ref: "7.5-11.5" },
    { name: "PDW", unit: "%", ref: "9.0-17.0" },
    { name: "PCT", unit: "%", ref: "0.1-0.5" },
  ],
  "Urinalysis": [
    { name: "Color", unit: "" },
    { name: "Appearance", unit: "" },
    { name: "pH", unit: "", ref: "4.5-8.0" },
    { name: "Specific Gravity", unit: "", ref: "1.005-1.030" },
    { name: "Leukocytes", unit: "" },
    { name: "Nitrites", unit: "" },
    { name: "Blood", unit: "" },
    { name: "Bilirubin", unit: "" },
    { name: "Urobilinogen", unit: "" },
    { name: "Protein", unit: "" },
    { name: "Glucose", unit: "" },
    { name: "Ketones", unit: "" },
    { name: "Pus Cells", unit: "/HPF", ref: "0-5" },
    { name: "RBCs", unit: "/HPF", ref: "0-2" },
    { name: "Epithelial Cells", unit: "/HPF" },
    { name: "Casts", unit: "" },
    { name: "Crystals", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "UECs": [
    { name: "Creatinine", unit: "mg/dL", refMale: "0.7-1.3", refFemale: "0.6-1.1" },
    { name: "Urea", unit: "mg/dL", ref: "7-20" },
    { name: "K+", unit: "mmol/L", ref: "3.5-5.0" },
    { name: "Na+", unit: "mmol/L", ref: "136-145" },
    { name: "Cl-", unit: "mmol/L", ref: "98-106" },
    { name: "PHOS", unit: "mg/dL", ref: "2.5-4.5" },
    { name: "tCO2", unit: "mmol/L", ref: "22-29" },
    { name: "Ca", unit: "mg/dL", ref: "8.5-10.5" },
    { name: "Uric Acid", unit: "mg/dL", refMale: "3.4-7.0", refFemale: "2.4-6.0" },
    { name: "Mg", unit: "mg/dL", ref: "1.7-2.2" },
    { name: "eGFR", unit: "mL/min", ref: ">90" },
  ],
  "LFTs": [
    { name: "Albumin", unit: "g/dL", ref: "3.5-5.0" },
    { name: "Globulin", unit: "g/dL", ref: "2.3-3.5" },
    { name: "Total Protein", unit: "g/dL", ref: "6.0-8.3" },
    { name: "Total Bilirubin", unit: "mg/dL", ref: "0.1-1.2" },
    { name: "Direct Bilirubin", unit: "mg/dL", ref: "0.0-0.3" },
    { name: "GGT", unit: "U/L", refMale: "8-61", refFemale: "5-36" },
    { name: "ALT", unit: "U/L", ref: "7-56" },
    { name: "AST", unit: "U/L", ref: "10-40" },
    { name: "Amylase", unit: "U/L", ref: "28-100" },
    { name: "Lipase", unit: "U/L", ref: "0-160" },
    { name: "ALP", unit: "U/L", ref: "44-147" },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mg/dL", ref: "<200" },
    { name: "Triglycerides", unit: "mg/dL", ref: "<150" },
    { name: "HDL", unit: "mg/dL", ref: ">40" },
    { name: "LDL", unit: "mg/dL", ref: "<100" },
    { name: "VLDL", unit: "mg/dL", ref: "<30" },
  ],
};

const Laboratory = () => {
  const { toast } = useToast();
  const { getActiveTicket, onLabComplete } = useQueueTransition();
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [resultFields, setResultFields] = useState<Record<string, string>>({});
  const [resultValue, setResultValue] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);

  useEffect(() => {
    fetchLabOrders();
  }, []);

  const fetchLabOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lab_orders")
      .select("*, patients!inner(patient_id, user_id, profiles!inner(full_name, gender)), lab_tests_catalog!inner(test_name, test_code, normal_range, result_fields, gender_specific_ranges), lab_result_fields(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const orders = (data as any[]).map((order) => ({
        ...order,
        patient: {
          patient_id: order.patients?.patient_id,
          user_id: order.patients?.user_id,
          profile: { full_name: order.patients?.profiles?.full_name, gender: order.patients?.profiles?.gender },
        },
        test: order.lab_tests_catalog,
        result_fields_data: order.lab_result_fields || [],
      }));
      setLabOrders(orders);
    }
    setLoading(false);
  };

  const openResultEntry = (order: any) => {
    setSelectedOrder(order);
    setResultValue(order.result_value || "");
    setResultNotes(order.result_notes || "");

    // Initialize structured fields
    const testName = order.test?.test_name || "";
    const structuredDef = STRUCTURED_FIELDS[testName];
    if (structuredDef) {
      const existing: Record<string, string> = {};
      (order.result_fields_data || []).forEach((f: any) => { existing[f.field_name] = f.field_value || ""; });
      const fields: Record<string, string> = {};
      structuredDef.forEach(f => { fields[f.name] = existing[f.name] || ""; });
      setResultFields(fields);
    } else {
      setResultFields({});
    }
    setResultDialogOpen(true);
  };

  const getFlag = (value: string, refRange: string | undefined): string | null => {
    if (!refRange || !value) return null;
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return null;

    if (refRange.startsWith("<")) {
      const limit = parseFloat(refRange.slice(1));
      return numVal >= limit ? "H" : null;
    }
    if (refRange.startsWith(">")) {
      const limit = parseFloat(refRange.slice(1));
      return numVal <= limit ? "L" : null;
    }
    const match = refRange.match(/([\d.]+)-([\d.]+)/);
    if (match) {
      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      if (numVal < low) return "L";
      if (numVal > high) return "H";
    }
    return null;
  };

  const handleSaveResult = async () => {
    if (!selectedOrder) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user.id).single();

    const testName = selectedOrder.test?.test_name || "";
    const structuredDef = STRUCTURED_FIELDS[testName];
    const gender = selectedOrder.patient?.profile?.gender?.toLowerCase();

    // Save structured fields
    if (structuredDef && Object.keys(resultFields).length > 0) {
      // Delete existing fields
      await supabase.from("lab_result_fields").delete().eq("lab_order_id", selectedOrder.id);

      const fieldsToInsert = structuredDef.map((def, idx) => {
        const value = resultFields[def.name] || "";
        const refRange = (gender === "female" && def.refFemale) ? def.refFemale : (gender === "male" && def.refMale) ? def.refMale : def.ref;
        return {
          lab_order_id: selectedOrder.id,
          field_name: def.name,
          field_value: value,
          unit: def.unit || null,
          reference_range: refRange || null,
          flag: getFlag(value, refRange) || null,
          sort_order: idx,
        };
      });

      await supabase.from("lab_result_fields").insert(fieldsToInsert);
    }

    // Determine overall flag
    let overallFlag: string | null = null;
    if (structuredDef) {
      for (const def of structuredDef) {
        const value = resultFields[def.name] || "";
        const refRange = (gender === "female" && def.refFemale) ? def.refFemale : (gender === "male" && def.refMale) ? def.refMale : def.ref;
        const f = getFlag(value, refRange);
        if (f) { overallFlag = "abnormal"; break; }
      }
    }

    // Update the main lab order
    const { error } = await supabase
      .from("lab_orders")
      .update({
        status: "completed",
        result_value: resultValue || (structuredDef ? "See structured results" : ""),
        result_notes: resultNotes,
        result_entered_by: staff?.id,
        result_entered_at: new Date().toISOString(),
        flag: overallFlag,
      })
      .eq("id", selectedOrder.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Result saved", description: "Lab result recorded successfully" });
      logAuditEvent({ action: "lab_result_entered", module: "laboratory", details: { lab_order_id: selectedOrder.id, test: testName, patient_id: selectedOrder.patient_id } });

      // Check if all lab orders for this encounter are complete
      const { data: pendingLabs } = await supabase
        .from("lab_orders")
        .select("id")
        .eq("encounter_id", selectedOrder.encounter_id)
        .neq("status", "completed");

      if ((pendingLabs?.length || 0) === 0) {
        const ticket = await getActiveTicket(selectedOrder.patient_id);
        if (ticket && (ticket.status === "at_lab" || ticket.workflow_stage === "at_lab")) {
          await onLabComplete({ ticketId: ticket.id, encounterId: selectedOrder.encounter_id });
        }
      }

      setResultDialogOpen(false);
      fetchLabOrders();
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", collected: "bg-blue-100 text-blue-800", in_progress: "bg-purple-100 text-purple-800", completed: "bg-green-100 text-green-800" };
    return colors[status] || "bg-muted";
  };

  const filteredOrders = labOrders.filter(o =>
    o.patient?.profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.patient?.patient_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.test?.test_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingOrders = filteredOrders.filter(o => o.status !== "completed");
  const completedOrders = filteredOrders.filter(o => o.status === "completed");

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["at_lab"]}
        nextStage="at_pharmacy"
        title="Lab Queue"
        onSelectPatient={setSelectedTicket}
        selectedTicketId={selectedTicket?.id}
        collapsed={queueCollapsed}
        onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><TestTube className="h-7 w-7 text-primary" /> Laboratory</h1>
            <p className="text-muted-foreground mt-1">Manage lab orders and enter structured results</p>
          </div>
          <div className="flex gap-2 items-center">
            {selectedTicket && <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />}
            {selectedTicket && <WorkflowTimeline currentStage={selectedTicket.workflow_stage || selectedTicket.status} />}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by patient, test..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-64 h-12 text-base" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-yellow-100"><TestTube className="h-6 w-6 text-yellow-600" /></div><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{pendingOrders.length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-green-100"><TestTube className="h-6 w-6 text-green-600" /></div><div><p className="text-sm text-muted-foreground">Completed Today</p><p className="text-2xl font-bold">{completedOrders.filter(o => o.result_entered_at?.startsWith(new Date().toISOString().split('T')[0])).length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-red-100"><TestTube className="h-6 w-6 text-red-600" /></div><div><p className="text-sm text-muted-foreground">Abnormal Results</p><p className="text-2xl font-bold text-destructive">{completedOrders.filter(o => o.flag === "abnormal").length}</p></div></CardContent></Card>
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pendingOrders.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedOrders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <p className="text-center py-8 text-muted-foreground">Loading...</p>
                ) : pendingOrders.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No pending lab orders</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Test</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <p className="font-medium">{order.patient?.profile?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{order.test?.test_name}</p>
                            <p className="text-sm text-muted-foreground">{order.test?.test_code}</p>
                          </TableCell>
                          <TableCell><Badge className={getStatusColor(order.status)}>{order.status}</Badge></TableCell>
                          <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => openResultEntry(order)}>Enter Result</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card>
              <CardContent className="pt-6">
                {completedOrders.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No completed results</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Test</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Flag</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <p className="font-medium">{order.patient?.profile?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                          </TableCell>
                          <TableCell>{order.test?.test_name}</TableCell>
                          <TableCell className="max-w-xs truncate">{order.result_value}</TableCell>
                          <TableCell>
                            {order.flag === "abnormal" ? (
                              <Badge variant="destructive">Abnormal</Badge>
                            ) : (
                              <Badge variant="outline">Normal</Badge>
                            )}
                          </TableCell>
                          <TableCell>{order.result_entered_at ? new Date(order.result_entered_at).toLocaleString() : "-"}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openResultEntry(order)}>View</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Structured Result Entry Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lab Result: {selectedOrder?.test?.test_name}</DialogTitle>
            <DialogDescription>
              Patient: {selectedOrder?.patient?.profile?.full_name} ({selectedOrder?.patient?.patient_id}) •
              Gender: {selectedOrder?.patient?.profile?.gender || "N/A"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Structured fields if available */}
            {selectedOrder?.test?.test_name && STRUCTURED_FIELDS[selectedOrder.test.test_name] ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Reference Range</TableHead>
                      <TableHead>Flag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STRUCTURED_FIELDS[selectedOrder.test.test_name].map((field) => {
                      const gender = selectedOrder?.patient?.profile?.gender?.toLowerCase();
                      const refRange = (gender === "female" && field.refFemale) ? field.refFemale : (gender === "male" && field.refMale) ? field.refMale : field.ref;
                      const flag = getFlag(resultFields[field.name] || "", refRange);
                      return (
                        <TableRow key={field.name}>
                          <TableCell className="font-medium">{field.name}</TableCell>
                          <TableCell>
                            <Input
                              className="h-11 w-32 text-sm"
                              value={resultFields[field.name] || ""}
                              onChange={(e) => setResultFields({ ...resultFields, [field.name]: e.target.value })}
                              disabled={selectedOrder.status === "completed"}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{field.unit}</TableCell>
                          <TableCell className="text-sm">{refRange || "-"}</TableCell>
                          <TableCell>
                            {flag && (
                              <Badge variant={flag === "H" ? "destructive" : "secondary"} className="text-xs">
                                {flag === "H" ? "↑ High" : "↓ Low"}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Result Value *</Label>
                <Input
                  value={resultValue}
                  onChange={(e) => setResultValue(e.target.value)}
                  placeholder="e.g., Positive, 5.2 mmol/L"
                  disabled={selectedOrder?.status === "completed"}
                  className="h-12 text-base"
                />
                {selectedOrder?.test?.normal_range && (
                  <p className="text-sm text-muted-foreground">Normal Range: {selectedOrder.test.normal_range}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Notes</Label>
              <Textarea
                value={resultNotes}
                onChange={(e) => setResultNotes(e.target.value)}
                placeholder="Additional observations..."
                rows={4}
                disabled={selectedOrder?.status === "completed"}
                className="text-base"
              />
            </div>

            {selectedOrder?.status !== "completed" && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setResultDialogOpen(false)}>Cancel</Button>
                <Button variant="secondary" onClick={async () => {
                  await handleSaveResult();
                  // After saving, check if all labs done and offer return to doctor
                  const { data: pendingLabs } = await supabase
                    .from("lab_orders").select("id").eq("encounter_id", selectedOrder.encounter_id).neq("status", "completed");
                  if ((pendingLabs?.length || 0) <= 1) {
                    const ticket = await getActiveTicket(selectedOrder.patient_id);
                    if (ticket && (ticket.status === "at_lab" || ticket.workflow_stage === "at_lab")) {
                      await onLabComplete({ ticketId: ticket.id, encounterId: selectedOrder.encounter_id }, true);
                    }
                  }
                }}>Save & Return to Doctor</Button>
                <Button onClick={handleSaveResult}>Save & Advance</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Laboratory;
