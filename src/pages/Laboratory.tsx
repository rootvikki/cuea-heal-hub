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
import { TestTube, Search, Printer } from "lucide-react";
import { printLabReport } from "@/lib/labReport";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import { LabOrderTimeline, labOrderStatusLabel, nextLabOrderStatus, type LabOrderStatus } from "@/components/LabOrderTimeline";
import { useUser } from "@/contexts/UserContext";
import { authUserIdForStaff, notifyRoles, notifyUser } from "@/lib/notifications";

const advanceActionLabel = (status: LabOrderStatus) => {
  switch (status) {
    case "received": return "Mark Received";
    case "collected": return "Mark Sample Collected";
    case "in_progress": return "Start Processing";
    default: return "Advance";
  }
};

// Structured result field definitions per test type
const STRUCTURED_FIELDS: Record<string, { name: string; unit?: string; ref?: string; refMale?: string; refFemale?: string }[]> = {
  "Full Hemogram": [
    { name: "WBC", unit: "10^3/µL", ref: "3.50-9.50" },
    { name: "NEU#", unit: "10^3/µL", ref: "1.80-6.30" },
    { name: "NEU%", unit: "%", ref: "40.0-75.0" },
    { name: "LYM#", unit: "10^3/µL", ref: "1.10-3.20" },
    { name: "LYM%", unit: "%", ref: "20.0-50.0" },
    { name: "MON#", unit: "10^3/µL", ref: "0.10-0.60" },
    { name: "MON%", unit: "%", ref: "3.0-10.0" },
    { name: "EOS#", unit: "10^3/µL", ref: "0.02-0.52" },
    { name: "EOS%", unit: "%", ref: "0.4-8.0" },
    { name: "BAS#", unit: "10^3/µL", ref: "0.00-0.06" },
    { name: "BAS%", unit: "%", ref: "0.0-1.0" },
    { name: "RBC", unit: "10^6/µL", ref: "3.80-5.80" },
    { name: "HGB", unit: "g/dL", ref: "11.5-17.5" },
    { name: "HCT", unit: "%", ref: "35.0-50.0" },
    { name: "MCV", unit: "fL", ref: "82.0-100.0" },
    { name: "MCH", unit: "pg", ref: "27.0-34.0" },
    { name: "MCHC", unit: "g/dL", ref: "31.6-35.4" },
    { name: "RDW_CV", unit: "%", ref: "10.0-15.0" },
    { name: "RDW_SD", unit: "fL", ref: "35.0-56.0" },
    { name: "PLT", unit: "10^3/µL", ref: "125-350" },
    { name: "MPV", unit: "fL", ref: "6.5-12.0" },
    { name: "PDW", unit: "", ref: "9.0-17.0" },
    { name: "PCT", unit: "%", ref: "0.17-0.35" },
    { name: "P_LCR", unit: "%", ref: "11.0-45.0" },
    { name: "P_LCC", unit: "10^3/µL", ref: "30-90" },
    { name: "*ALY#", unit: "10^3/µL" },
    { name: "*ALY%", unit: "%" },
    { name: "*LIC#", unit: "10^3/µL" },
    { name: "*LIC%", unit: "%" },
    { name: "*NLR", unit: "" },
    { name: "*PLR", unit: "" },
    { name: "*NRBC#", unit: "10^9/L" },
    { name: "*NRBC%", unit: "%" },
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
  "UECs (Renal Function)": [
    { name: "Creatinine", unit: "µmol/L", refMale: "62-115", refFemale: "44-97" },
    { name: "Urea", unit: "mmol/L", ref: "2.5-7.1" },
    { name: "K+", unit: "mmol/L", ref: "3.5-5.0" },
    { name: "Na+", unit: "mmol/L", ref: "136-145" },
    { name: "Cl-", unit: "mmol/L", ref: "98-106" },
    { name: "PHOS", unit: "mmol/L", ref: "0.8-1.5" },
    { name: "tCO2", unit: "mmol/L", ref: "22-29" },
    { name: "Ca", unit: "mmol/L", ref: "2.1-2.6" },
    { name: "Uric Acid", unit: "µmol/L", refMale: "200-420", refFemale: "140-360" },
    { name: "Mg", unit: "mmol/L", ref: "0.7-1.0" },
    { name: "eGFR", unit: "mL/min", ref: ">90" },
  ],
  "Liver Function Test": [
    { name: "Albumin", unit: "g/L", ref: "35-50" },
    { name: "Globulin", unit: "g/L", ref: "23-35" },
    { name: "Total Protein", unit: "g/L", ref: "60-83" },
    { name: "Total Bilirubin", unit: "µmol/L", ref: "2-17" },
    { name: "Direct Bilirubin", unit: "µmol/L", ref: "0-5" },
    { name: "GGT", unit: "U/L", refMale: "8-61", refFemale: "5-36" },
    { name: "ALT", unit: "U/L", ref: "7-56" },
    { name: "AST", unit: "U/L", ref: "10-40" },
    { name: "Amylase", unit: "U/L", ref: "28-100" },
    { name: "Lipase", unit: "U/L", ref: "0-160" },
    { name: "ALP", unit: "U/L", ref: "44-147" },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mmol/L", ref: "<5.2" },
    { name: "Triglycerides", unit: "mmol/L", ref: "<1.7" },
    { name: "HDL", unit: "mmol/L", ref: ">1.0" },
    { name: "LDL", unit: "mmol/L", ref: "<2.6" },
    { name: "VLDL", unit: "mmol/L", ref: "<0.7" },
    { name: "TC/HDL Ratio", unit: "", ref: "<5.0" },
  ],
  "Stool for Ova & Cysts": [
    { name: "Color", unit: "" },
    { name: "Consistency", unit: "" },
    { name: "Appearance", unit: "" },
    { name: "Mucus", unit: "" },
    { name: "Blood (Occult)", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Ova", unit: "" },
    { name: "Cysts", unit: "" },
    { name: "Trophozoites", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Fat Globules", unit: "" },
    { name: "Charcot-Leyden Crystals", unit: "" },
  ],
  "HVS Wet Prep": [
    { name: "Epithelial Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Trichomonas", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Clue Cells", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "HVS Gram Stain": [
    { name: "Gram +ve Cocci", unit: "" },
    { name: "Gram -ve Cocci", unit: "" },
    { name: "Gram +ve Bacilli", unit: "" },
    { name: "Gram -ve Bacilli", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "Epithelial Cells", unit: "" },
  ],
  "Urethral Swab Wet Prep": [
    { name: "Epithelial Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Trichomonas", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "Urethral Swab Gram Stain": [
    { name: "Gram +ve Cocci", unit: "" },
    { name: "Gram -ve Cocci", unit: "" },
    { name: "Gram +ve Bacilli", unit: "" },
    { name: "Gram -ve Bacilli", unit: "" },
    { name: "Intracellular Diplococci", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
  ],
  "Blood Group & Rhesus": [
    { name: "ABO Group", unit: "" },
    { name: "Rhesus (D)", unit: "" },
  ],
  "ESR": [
    { name: "ESR (1hr)", unit: "mm/hr", refMale: "0-15", refFemale: "0-20" },
  ],
  "FBS (Fasting Blood Sugar)": [
    { name: "Fasting Blood Sugar", unit: "mmol/L", ref: "3.9-5.6" },
  ],
  "RBS (Random Blood Sugar)": [
    { name: "Random Blood Sugar", unit: "mmol/L", ref: "3.9-7.8" },
  ],
  "HB Levels": [
    { name: "Haemoglobin", unit: "g/dL", refMale: "13.0-17.0", refFemale: "12.0-16.0" },
  ],
};

const Laboratory = () => {
  const { toast } = useToast();
  const { hasAnyRole } = useUser();
  const canManageLab = hasAnyRole(["lab_technician"]);
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
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);

  const announceLabUpdate = async (order: any, title: string, message: string) => {
    const doctorUserId = await authUserIdForStaff(order.doctor_id);
    await notifyUser(doctorUserId, { title, message, category: "lab", referenceId: order.id, link: "/consultation" });
    await notifyRoles(["nurse"], { title, message, category: "lab", referenceId: order.id, link: "/laboratory" });
  };

  const advanceLabOrder = async (order: any, next: LabOrderStatus) => {
    setAdvancingOrderId(order.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = user
        ? await supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle()
        : { data: null };

      const now = new Date().toISOString();
      const update: Record<string, unknown> = { status: next };
      if (next === "received") { update.received_at = now; update.received_by = staff?.id ?? null; }
      if (next === "collected") { update.sample_collected_at = now; update.collected_by = staff?.id ?? null; }
      if (next === "in_progress") { update.processing_started_at = now; update.processed_by = staff?.id ?? null; }

      const { error } = await supabase.from("lab_orders").update(update).eq("id", order.id);
      if (error) throw error;

      logAuditEvent({
        action: "lab_order_status_changed",
        module: "laboratory",
        details: { lab_order_id: order.id, status: next, patient_id: order.patient_id },
      });
      await announceLabUpdate(
        order,
        `Lab order ${labOrderStatusLabel(next).toLowerCase()}`,
        `${order.test?.test_name || "Lab test"} for ${order.patient?.profile?.full_name || "a patient"} is now ${labOrderStatusLabel(next).toLowerCase()}.`,
      );
      toast({ title: labOrderStatusLabel(next), description: `${order.test?.test_name || "Lab order"} marked as ${labOrderStatusLabel(next).toLowerCase()}.` });
      fetchLabOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update this lab order.";
      toast({ title: "Could not update lab order", description: message, variant: "destructive" });
    } finally {
      setAdvancingOrderId(null);
    }
  };


  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);

  useEffect(() => {
    fetchLabOrders();
    const channel = supabase
      .channel("laboratory-lab-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => fetchLabOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
        completed_at: new Date().toISOString(),
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
      await announceLabUpdate(
        selectedOrder,
        overallFlag === "abnormal" ? "Abnormal lab result ready" : "Lab result ready",
        `${testName || "Lab test"} for ${selectedOrder.patient?.profile?.full_name || "a patient"} is complete${overallFlag === "abnormal" ? " with abnormal values" : ""}.`,
      );


      // When every lab order for this visit is complete, return the patient to the doctor
      const { data: pendingLabs } = await supabase
        .from("lab_orders")
        .select("id")
        .eq("encounter_id", selectedOrder.encounter_id)
        .neq("status", "completed");

      const remaining = pendingLabs?.length || 0;
      if (remaining === 0) {
        const ticket = await getActiveTicket(selectedOrder.patient_id);
        if (ticket && (ticket.status === "at_lab" || ticket.workflow_stage === "at_lab")) {
          await onLabComplete({ ticketId: ticket.id, encounterId: selectedOrder.encounter_id }, true);
        }
        await announceLabUpdate(
          selectedOrder,
          "Lab results ready for review",
          `Lab results ready for ${selectedOrder.patient?.profile?.full_name || "a patient"} — returned to you for review.`,
        );
      } else {
        toast({ title: "Results saved", description: `${remaining} test(s) still pending; the patient returns to the doctor when all are done.` });
      }

      setResultDialogOpen(false);
      fetchLabOrders();
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", received: "bg-sky-100 text-sky-800", collected: "bg-blue-100 text-blue-800", in_progress: "bg-purple-100 text-purple-800", completed: "bg-green-100 text-green-800" };
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

        {selectedTicket && <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />}

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
                      {pendingOrders.map((order) => {
                        const next = nextLabOrderStatus(order.status);
                        return (
                        <TableRow key={order.id}>
                          <TableCell>
                            <p className="font-medium">{order.patient?.profile?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{order.test?.test_name}</p>
                            <p className="text-sm text-muted-foreground">{order.test?.test_code}</p>
                          </TableCell>
                          <TableCell className="min-w-[380px]">
                            <Badge className={getStatusColor(order.status)}>{labOrderStatusLabel(order.status)}</Badge>
                            <LabOrderTimeline order={order} className="mt-2" />
                          </TableCell>
                          <TableCell>{new Date(order.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              {canManageLab ? (
                                <>
                                  {next && next !== "completed" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={advancingOrderId === order.id}
                                      onClick={() => advanceLabOrder(order, next)}
                                    >
                                      {advanceActionLabel(next)}
                                    </Button>
                                  )}
                                  <Button size="sm" onClick={() => openResultEntry(order)}>Enter Result</Button>
                                </>
                              ) : (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => openResultEntry(order)}>View Progress</Button>
                                  <span className="text-[11px] text-muted-foreground">Lab staff update these steps</span>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
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
                              data-lab-field
                              className="h-11 w-32 text-sm"
                              value={resultFields[field.name] || ""}
                              onChange={(e) => setResultFields({ ...resultFields, [field.name]: e.target.value })}
                              onKeyDown={(e) => {
                                if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
                                e.preventDefault();
                                const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-lab-field]"));
                                const i = all.indexOf(e.currentTarget);
                                const next = all[e.key === "ArrowUp" ? i - 1 : i + 1];
                                next?.focus(); next?.select();
                              }}
                              disabled={!canManageLab || selectedOrder.status === "completed"}
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
                  disabled={!canManageLab || selectedOrder?.status === "completed"}
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
                disabled={!canManageLab || selectedOrder?.status === "completed"}
                className="text-base"
              />
            </div>

            <div className="flex justify-end gap-2">
              {selectedOrder && (
                <Button
                  variant="outline"
                  onClick={() => printLabReport(selectedOrder, STRUCTURED_FIELDS[selectedOrder.test?.test_name] || null, resultFields, resultValue, resultNotes)}
                >
                  <Printer className="h-4 w-4 mr-1" /> Print results
                </Button>
              )}
              {canManageLab && selectedOrder?.status !== "completed" && (
                <>
                  <Button variant="outline" onClick={() => setResultDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSaveResult}>Send Results to Doctor</Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Laboratory;
