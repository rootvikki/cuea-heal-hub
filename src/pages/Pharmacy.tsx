import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { StationQueue } from "@/components/StationQueue";
import { Pill, Plus, Package, AlertTriangle, Search, ClipboardList, PackagePlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { findInventoryItem, remainingQty, stockCheck, STOCK_LABELS } from "@/lib/pharmacyStock";
import { ReplenishmentRequestDialog } from "@/components/ReplenishmentRequestDialog";
import { ReplenishmentRequests } from "@/components/ReplenishmentRequests";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";
import { WorkflowTimeline } from "@/components/WorkflowTimeline";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import { PrescriptionTimeline, PRESCRIPTION_ACTION_LABELS, nextPrescriptionStatus, prescriptionStatus, PRESCRIPTION_STATUS_LABELS, type PrescriptionStatus } from "@/components/PrescriptionTimeline";
import { MedicationInteractionCheck } from "@/components/MedicationInteractionCheck";
import { authUserIdForStaff, notifyUser } from "@/lib/notifications";

const Pharmacy = () => {
  const { toast } = useToast();
  const { getActiveTicket, onPrescriptionDispensed } = useQueueTransition();
  const [inventory, setInventory] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [stockTransactions, setStockTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockCardItem, setStockCardItem] = useState<any>(null);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [dispenseConfirm, setDispenseConfirm] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [dispenseForm, setDispenseForm] = useState<{ mode: "full" | "partial" | "substitute"; qty: string; substituteId: string; reason: string }>({ mode: "full", qty: "", substituteId: "", reason: "" });
  const [dispensing, setDispensing] = useState(false);
  const [replenish, setReplenish] = useState<{ medicationName: string; inventoryId?: string; prescriptionId?: string; qty?: number } | null>(null);
  const [replenishKey, setReplenishKey] = useState(0);

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);
  const [formData, setFormData] = useState({
    drugName: "", genericName: "", batchNumber: "", quantity: "", unitPrice: "",
    expiryDate: "", reorderLevel: "50", strengthSize: "", packageType: "",
    minimumStock: "", maximumStock: "",
  });

  useEffect(() => {
    fetchInventory();
    fetchPrescriptions();
    const channel = supabase
      .channel("pharmacy-prescriptions")
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, () => fetchPrescriptions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    const { data } = await supabase.from("pharmacy_inventory").select("*").order("drug_name");
    setInventory(data || []);
    setLoading(false);
  };

  const fetchPrescriptions = async () => {
    const { data } = await supabase
      .from("prescriptions")
      .select("*, patients!inner(patient_id, user_id, profiles!inner(full_name))")
      .neq("status", "collected")
      .order("created_at", { ascending: false });

    if (data) {
      const mapped = (data as any[]).map((presc) => ({
        ...presc,
        patient: {
          patient_id: presc.patients?.patient_id,
          user_id: presc.patients?.user_id,
          profile: { full_name: presc.patients?.profiles?.full_name },
        },
      }));
      setPrescriptions(mapped);
    }
  };

  const advancePrescription = async (presc: any, next: PrescriptionStatus) => {
    setAdvancingId(presc.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = user
        ? await supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle()
        : { data: null };

      const now = new Date().toISOString();
      const update: Record<string, unknown> = { status: next };
      if (next === "received") { update.received_at = now; update.received_by = staff?.id ?? null; }
      if (next === "reviewed") { update.reviewed_at = now; update.reviewed_by = staff?.id ?? null; }
      if (next === "dispensing") { update.dispensing_started_at = now; }
      if (next === "collected") { update.collected_at = now; update.collected_by = staff?.id ?? null; }

      const { error } = await supabase.from("prescriptions").update(update).eq("id", presc.id);
      if (error) throw error;

      logAuditEvent({
        action: "prescription_status_changed",
        module: "pharmacy",
        details: { prescription_id: presc.id, status: next, patient_id: presc.patient_id },
      });
      await notifyOrderingDoctor(presc, next);
      toast({ title: PRESCRIPTION_STATUS_LABELS[next], description: `${presc.medication_name} is now ${PRESCRIPTION_STATUS_LABELS[next].toLowerCase()}.` });
      fetchPrescriptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update this prescription.";
      toast({ title: "Could not update prescription", description: message, variant: "destructive" });
    } finally {
      setAdvancingId(null);
    }
  };

  const notifyOrderingDoctor = async (presc: any, status: PrescriptionStatus) => {
    const doctorUserId = await authUserIdForStaff(presc.doctor_id);
    await notifyUser(doctorUserId, {
      title: `Pharmacy: ${PRESCRIPTION_STATUS_LABELS[status].toLowerCase()}`,
      message: `${presc.medication_name} for ${presc.patient?.profile?.full_name || "a patient"} is now ${PRESCRIPTION_STATUS_LABELS[status].toLowerCase()}.`,
      category: "pharmacy",
      referenceId: presc.id,
      link: "/consultation",
    });
  };

  const fetchStockCard = async (inventoryId: string) => {
    const { data } = await supabase.from("pharmacy_stock_transactions").select("*").eq("inventory_id", inventoryId).order("transaction_date", { ascending: false }).limit(50);
    setStockTransactions(data || []);
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("pharmacy_inventory").insert({
      drug_name: formData.drugName,
      generic_name: formData.genericName || null,
      batch_number: formData.batchNumber || null,
      quantity: parseInt(formData.quantity),
      unit_price: parseFloat(formData.unitPrice),
      expiry_date: formData.expiryDate || null,
      reorder_level: parseInt(formData.reorderLevel),
      strength_size: formData.strengthSize || null,
      package: formData.packageType || null,
      minimum_stock: formData.minimumStock ? parseInt(formData.minimumStock) : null,
      maximum_stock: formData.maximumStock ? parseInt(formData.maximumStock) : null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added", description: "Drug added to inventory" });
      setDialogOpen(false);
      setFormData({ drugName: "", genericName: "", batchNumber: "", quantity: "", unitPrice: "", expiryDate: "", reorderLevel: "50", strengthSize: "", packageType: "", minimumStock: "", maximumStock: "" });
      fetchInventory();
    }
  };

  const confirmDispense = async () => {
    if (!dispenseConfirm) return;
    const presc = dispenseConfirm.prescription;
    const need = remainingQty(presc);
    const mode = dispenseForm.mode;
    const item = mode === "substitute" ? inventory.find((i) => i.id === dispenseForm.substituteId) : dispenseConfirm.inventoryItem;
    const qty = mode === "full" ? need : parseInt(dispenseForm.qty);
    if (!item) { toast({ title: mode === "substitute" ? "Choose a substitute" : "Medication not in inventory", description: "Use Substitute or request replenishment.", variant: "destructive" }); return; }
    if (!qty || qty <= 0) { toast({ title: "Enter a quantity", variant: "destructive" }); return; }
    if (qty > item.quantity) { toast({ title: "Insufficient stock", description: `Only ${item.quantity} available`, variant: "destructive" }); return; }
    if (mode !== "substitute" && qty > need) { toast({ title: "Too many", description: `Only ${need} still to dispense`, variant: "destructive" }); return; }
    if (mode === "substitute" && !dispenseForm.reason.trim()) { toast({ title: "Enter a reason for the substitution", variant: "destructive" }); return; }

    setDispensing(true);
    try {
      await performDispense(presc, item, qty, mode === "substitute" ? { name: item.drug_name, reason: dispenseForm.reason.trim() } : undefined);
      setDispenseConfirm(null);
    } catch (e) {
      toast({ title: "Could not dispense", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setDispensing(false); }
  };

  const performDispense = async (prescription: any, inventoryItem: any, qty: number, substitution?: { name: string; reason: string }) => {
    const { id: prescriptionId, medication_name: medicationName, patient_id: patientId, encounter_id: encounterId } = prescription;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle();

    // Substitution satisfies the whole prescription; otherwise accumulate
    const totalGiven = substitution ? prescription.quantity : (prescription.quantity_dispensed || 0) + qty;
    const complete = totalGiven >= prescription.quantity;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      quantity_dispensed: totalGiven,
      status: complete ? "dispensed" : "partially_dispensed",
      dispensed_by: staff?.id,
    };
    if (complete) { update.dispensed = true; update.dispensed_at = now; }
    if (!prescription.dispensing_started_at) update.dispensing_started_at = now;
    if (substitution) { update.substituted_with = `${substitution.name} x${qty}`; update.substitution_reason = substitution.reason; }
    const { error: pErr } = await supabase.from("prescriptions").update(update).eq("id", prescriptionId);
    if (pErr) throw pErr;

    const newQty = inventoryItem.quantity - qty;
    const { error: iErr } = await supabase.from("pharmacy_inventory").update({ quantity: newQty }).eq("id", inventoryItem.id);
    if (iErr) throw iErr;

    await supabase.from("pharmacy_stock_transactions").insert({
      inventory_id: inventoryItem.id,
      qty_issued: qty,
      balance: newQty,
      issued_to: `Patient: ${prescription.patient?.profile?.full_name || patientId}${substitution ? " (substitute)" : ""}`,
      recorded_by: staff?.id,
      unit_price: inventoryItem.unit_price,
    });

    const activeTicket = await getActiveTicket(patientId);
    await supabase.from("service_charges").insert({
      patient_id: patientId,
      encounter_id: encounterId,
      ticket_id: activeTicket?.id || null,
      service_type: "pharmacy",
      description: `Pharmacy: ${substitution ? `${substitution.name} (sub. for ${medicationName})` : medicationName} x${qty}${!complete ? " (partial)" : ""}`,
      amount: inventoryItem.unit_price * qty,
      billing_stage: "pharmacy",
    });

    logAuditEvent({
      action: substitution ? "prescription_substituted" : complete ? "prescription_dispensed" : "prescription_partially_dispensed",
      module: "pharmacy",
      details: { prescription_id: prescriptionId, medication: medicationName, dispensed_item: inventoryItem.drug_name, quantity: qty, total_given: totalGiven, patient_id: patientId, reason: substitution?.reason },
    });

    const doctorUserId = await authUserIdForStaff(prescription.doctor_id);
    if (substitution || !complete) {
      await notifyUser(doctorUserId, {
        title: substitution ? "Pharmacy substitution" : "Partial fill",
        message: substitution
          ? `${medicationName} for ${prescription.patient?.profile?.full_name || "a patient"} was substituted with ${substitution.name} x${qty}. Reason: ${substitution.reason}`
          : `${medicationName} for ${prescription.patient?.profile?.full_name || "a patient"}: ${totalGiven} of ${prescription.quantity} given; ${prescription.quantity - totalGiven} still owed.`,
        category: "pharmacy", referenceId: prescriptionId, link: "/consultation",
      });
    } else {
      await notifyOrderingDoctor(prescription, "dispensed");
    }

    toast({
      title: complete ? "Dispensed" : "Partially dispensed",
      description: complete ? "Stock updated and charge recorded." : `${prescription.quantity - totalGiven} still owed — use "Dispense remaining" when stock arrives.`,
    });

    if (complete) {
      const ticket = await getActiveTicket(patientId);
      if (ticket && (ticket.status === "at_pharmacy" || ticket.workflow_stage === "at_pharmacy") && encounterId) {
        await onPrescriptionDispensed({ ticketId: ticket.id, encounterId });
      }
    }

    fetchInventory();
    fetchPrescriptions();
  };

  const openStockCard = (item: any) => {
    setStockCardItem(item);
    fetchStockCard(item.id);
  };

  const lowStockItems = inventory.filter((item) => item.quantity <= (item.reorder_level || 50));
  const filteredInventory = inventory.filter(i =>
    i.drug_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.generic_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["at_pharmacy"]}
        nextStage="at_billing"
        title="Pharmacy Queue"
        onSelectPatient={setSelectedTicket}
        selectedTicketId={selectedTicket?.id}
        collapsed={queueCollapsed}
        onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Pill className="h-7 w-7 text-primary" /> Pharmacy</h1>
            <p className="text-muted-foreground mt-1">Manage inventory, dispense & stock cards</p>
          </div>
          <div className="flex gap-2 items-center">
            {selectedTicket && <MedicationInteractionCheck patientId={selectedTicket.patient_id} patientName={selectedTicket.patient?.profile?.full_name} />}
            {selectedTicket && <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />}
            {selectedTicket && <WorkflowTimeline currentStage={selectedTicket.workflow_stage || selectedTicket.status} />}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search drugs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-64 h-12 text-base" />
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Add Drug</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Add Medication to Inventory</DialogTitle></DialogHeader>
                <form onSubmit={handleAddInventory} className="space-y-5">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2"><Label className="text-sm font-semibold">Drug Name *</Label><Input value={formData.drugName} onChange={(e) => setFormData({ ...formData, drugName: e.target.value })} required className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Generic Name</Label><Input value={formData.genericName} onChange={(e) => setFormData({ ...formData, genericName: e.target.value })} className="h-12 text-base" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <div className="space-y-2"><Label className="text-sm font-semibold">Strength/Size</Label><Input value={formData.strengthSize} onChange={(e) => setFormData({ ...formData, strengthSize: e.target.value })} placeholder="e.g., 500mg" className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Package</Label><Input value={formData.packageType} onChange={(e) => setFormData({ ...formData, packageType: e.target.value })} placeholder="e.g., Box/100" className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Batch #</Label><Input value={formData.batchNumber} onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })} className="h-12 text-base" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <div className="space-y-2"><Label className="text-sm font-semibold">Quantity *</Label><Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Unit Price (KES) *</Label><Input type="number" step="0.01" value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })} required className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Expiry Date</Label><Input type="date" value={formData.expiryDate} onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })} className="h-12 text-base" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <div className="space-y-2"><Label className="text-sm font-semibold">Min Stock</Label><Input type="number" value={formData.minimumStock} onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })} className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Max Stock</Label><Input type="number" value={formData.maximumStock} onChange={(e) => setFormData({ ...formData, maximumStock: e.target.value })} className="h-12 text-base" /></div>
                    <div className="space-y-2"><Label className="text-sm font-semibold">Reorder Level</Label><Input type="number" value={formData.reorderLevel} onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })} className="h-12 text-base" /></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Add to Inventory</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {lowStockItems.length > 0 && (
          <Card className="border-orange-300">
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <p className="text-sm"><strong>{lowStockItems.length} item(s)</strong> below reorder level: {lowStockItems.slice(0, 5).map(i => i.drug_name).join(", ")}{lowStockItems.length > 5 ? "..." : ""}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="prescriptions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="prescriptions">Pending Rx ({prescriptions.length})</TabsTrigger>
            <TabsTrigger value="inventory">Inventory ({inventory.length})</TabsTrigger>
            <TabsTrigger value="stockcard">Stock Card</TabsTrigger>
            <TabsTrigger value="replenishment">Replenishment</TabsTrigger>
          </TabsList>

          <TabsContent value="replenishment">
            <ReplenishmentRequests refreshKey={replenishKey} onStockChanged={fetchInventory} />
          </TabsContent>

          {selectedTicket && <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />}

          <TabsContent value="prescriptions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5" /> Pending Prescriptions</CardTitle>
              </CardHeader>
              <CardContent>
                {prescriptions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No pending prescriptions</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Medication</TableHead>
                        <TableHead>Dosage</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Instructions</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescriptions.map((presc) => (
                        <TableRow key={presc.id}>
                          <TableCell>
                            <p className="font-medium">{presc.patient?.profile?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{presc.patient?.patient_id}</p>
                          </TableCell>
                          <TableCell className="font-medium">
                            {presc.medication_name}
                            {(() => {
                              const need = remainingQty(presc);
                              if (need <= 0) return null;
                              const s = stockCheck(inventory, presc.medication_name, need);
                              const cls = s.state === "in_stock" ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-transparent" : s.state === "partial" ? "bg-orange-100 text-orange-800 border-transparent" : "";
                              return (
                                <div className="mt-1">
                                  <Badge variant={s.state === "in_stock" || s.state === "partial" ? "outline" : "destructive"} className={cls}>
                                    {s.state === "partial" ? `Partial (${s.available} of ${need})` : STOCK_LABELS[s.state]}
                                  </Badge>
                                </div>
                              );
                            })()}
                            {presc.substituted_with && <p className="text-xs text-muted-foreground mt-1">Substituted: {presc.substituted_with}</p>}
                          </TableCell>
                          <TableCell>{presc.dosage}</TableCell>
                          <TableCell>
                            {presc.quantity}
                            {presc.status === "partially_dispensed" && <p className="text-xs text-orange-700">Given {presc.quantity_dispensed} of {presc.quantity}</p>}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{presc.instructions || "-"}</TableCell>
                          <TableCell className="min-w-[240px]">
                            <PrescriptionTimeline prescription={presc} />
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const next = nextPrescriptionStatus(presc);
                              return (
                                <div className="flex flex-col gap-2">
                                  {next === "dispensed" ? (
                                    <Button size="sm" onClick={() => {
                                      const inventoryItem = findInventoryItem(inventory, presc.medication_name);
                                      const need = remainingQty(presc);
                                      setDispenseForm({ mode: (inventoryItem?.quantity || 0) >= need ? "full" : "partial", qty: String(Math.min(inventoryItem?.quantity || 0, need)), substituteId: "", reason: "" });
                                      setDispenseConfirm({ prescription: presc, inventoryItem });
                                    }}>{presc.status === "partially_dispensed" ? "Dispense remaining" : "Dispense"}</Button>
                                  ) : next ? (
                                    <Button
                                      size="sm"
                                      variant={next === "collected" ? "default" : "outline"}
                                      disabled={advancingId === presc.id}
                                      onClick={() => advancePrescription(presc, next)}
                                    >
                                      {PRESCRIPTION_ACTION_LABELS[next]}
                                    </Button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">Completed</span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Inventory ({filteredInventory.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Drug Name</TableHead>
                      <TableHead>Strength</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.drug_name}</p>
                          {item.generic_name && <p className="text-sm text-muted-foreground">{item.generic_name}</p>}
                        </TableCell>
                        <TableCell>{item.strength_size || "-"}</TableCell>
                        <TableCell>{item.package || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.quantity <= (item.reorder_level || 50) ? "destructive" : "outline"}>
                            {item.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell>KES {item.unit_price}</TableCell>
                        <TableCell>{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openStockCard(item)}>
                            <ClipboardList className="h-4 w-4 mr-1" /> Card
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setReplenish({ medicationName: item.drug_name, inventoryId: item.id, qty: Math.max((item.maximum_stock || item.reorder_level || 50) - item.quantity, 1) })}>
                            <PackagePlus className="h-4 w-4 mr-1" /> Restock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stockcard">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> Stock Card
                  {stockCardItem && <span className="text-muted-foreground font-normal">— {stockCardItem.drug_name}</span>}
                </CardTitle>
                <CardDescription>
                  {stockCardItem ? (
                    <span>Strength: {stockCardItem.strength_size || "-"} | Package: {stockCardItem.package || "-"} | Min: {stockCardItem.minimum_stock || "-"} | Max: {stockCardItem.maximum_stock || "-"} | Reorder: {stockCardItem.reorder_level || "-"}</span>
                  ) : "Select a drug from inventory to view its stock card"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!stockCardItem ? (
                  <p className="text-center py-8 text-muted-foreground">Click "Card" on any inventory item to view its transaction log</p>
                ) : stockTransactions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No transactions recorded for this item</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Received From / Issued To</TableHead>
                        <TableHead>Invoice Ref</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{new Date(tx.transaction_date).toLocaleDateString()}</TableCell>
                          <TableCell>{tx.received_from || tx.issued_to || "-"}</TableCell>
                          <TableCell>{tx.invoice_ref || "-"}</TableCell>
                          <TableCell>{tx.expiry_date ? new Date(tx.expiry_date).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>{tx.unit_price ? `KES ${tx.unit_price}` : "-"}</TableCell>
                          <TableCell>{tx.qty_received || "-"}</TableCell>
                          <TableCell>{tx.qty_issued || "-"}</TableCell>
                          <TableCell className="font-bold">{tx.balance}</TableCell>
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

      {/* Dispense Dialog: full / partial / substitute */}
      <Dialog open={!!dispenseConfirm} onOpenChange={(open) => !open && setDispenseConfirm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Dispense medication</DialogTitle>
            <DialogDescription>Stock is checked before anything is deducted.</DialogDescription>
          </DialogHeader>
          {dispenseConfirm && (() => {
            const p = dispenseConfirm.prescription;
            const need = remainingQty(p);
            const item = dispenseConfirm.inventoryItem;
            const avail = item?.quantity || 0;
            const subItem = inventory.find((i) => i.id === dispenseForm.substituteId);
            return (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  <p><strong>Patient:</strong> {p.patient?.profile?.full_name}</p>
                  <p><strong>Medication:</strong> {p.medication_name}</p>
                  <p><strong>Still to dispense:</strong> {need}{p.quantity_dispensed ? ` (of ${p.quantity}, ${p.quantity_dispensed} already given)` : ""}</p>
                  <p><strong>In stock:</strong> {item ? `${avail} (${item.drug_name})` : "Not in inventory"}</p>
                </div>
                {avail < need && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                    <span>This prescription cannot be fully dispensed from stock. Give a partial fill, substitute, or request replenishment.</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {(["full", "partial", "substitute"] as const).map((m) => (
                    <Button key={m} type="button" variant={dispenseForm.mode === m ? "default" : "outline"}
                      disabled={m === "full" && avail < need}
                      onClick={() => setDispenseForm({ ...dispenseForm, mode: m, qty: String(m === "partial" ? Math.min(avail, need) : need) })}>
                      {m === "full" ? "Full" : m === "partial" ? "Partial fill" : "Substitute"}
                    </Button>
                  ))}
                </div>
                {dispenseForm.mode === "partial" && (
                  <div className="space-y-2">
                    <Label>Quantity to give now (max {Math.min(avail, need)})</Label>
                    <Input type="number" min={1} max={Math.min(avail, need)} value={dispenseForm.qty} onChange={(e) => setDispenseForm({ ...dispenseForm, qty: e.target.value })} className="h-12" />
                  </div>
                )}
                {dispenseForm.mode === "substitute" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Substitute with</Label>
                      <Select value={dispenseForm.substituteId} onValueChange={(v) => setDispenseForm({ ...dispenseForm, substituteId: v })}>
                        <SelectTrigger className="h-12"><SelectValue placeholder="Choose an in-stock item" /></SelectTrigger>
                        <SelectContent>
                          {inventory.filter((i) => i.quantity > 0 && i.id !== item?.id).map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.drug_name}{i.strength_size ? ` ${i.strength_size}` : ""}{i.generic_name ? ` (${i.generic_name})` : ""} — {i.quantity} in stock</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} value={dispenseForm.qty} onChange={(e) => setDispenseForm({ ...dispenseForm, qty: e.target.value })} className="h-12" /></div>
                      <div className="space-y-2"><Label>Reason</Label><Input value={dispenseForm.reason} onChange={(e) => setDispenseForm({ ...dispenseForm, reason: e.target.value })} placeholder="e.g. Out of stock" className="h-12" /></div>
                    </div>
                    {subItem && parseInt(dispenseForm.qty) > subItem.quantity && <p className="text-sm text-destructive">Only {subItem.quantity} of the substitute available.</p>}
                  </div>
                )}
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="ghost" onClick={() => { setReplenish({ medicationName: p.medication_name, inventoryId: item?.id, prescriptionId: p.id, qty: Math.max(need - avail, need) }); }}>
                    <PackagePlus className="h-4 w-4 mr-1" /> Request replenishment
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setDispenseConfirm(null)}>Cancel</Button>
                    <Button disabled={dispensing} onClick={confirmDispense}>{dispensing ? "Dispensing..." : "Confirm"}</Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {replenish && (
        <ReplenishmentRequestDialog
          open={!!replenish}
          onOpenChange={(o) => !o && setReplenish(null)}
          medicationName={replenish.medicationName}
          inventoryId={replenish.inventoryId}
          prescriptionId={replenish.prescriptionId}
          suggestedQty={replenish.qty}
          onCreated={() => setReplenishKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

export default Pharmacy;
