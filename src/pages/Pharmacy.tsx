import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { StationQueue } from "@/components/StationQueue";
import { Pill, Plus, Package, AlertTriangle, Search, ClipboardList } from "lucide-react";

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
  const [formData, setFormData] = useState({
    drugName: "", genericName: "", batchNumber: "", quantity: "", unitPrice: "",
    expiryDate: "", reorderLevel: "50", strengthSize: "", packageType: "",
    minimumStock: "", maximumStock: "",
  });

  useEffect(() => {
    fetchInventory();
    fetchPrescriptions();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    const { data } = await supabase.from("pharmacy_inventory").select("*").order("drug_name");
    setInventory(data || []);
    setLoading(false);
  };

  const fetchPrescriptions = async () => {
    const { data } = await supabase.from("prescriptions").select("*").eq("dispensed", false).order("created_at", { ascending: false });
    if (data) {
      const prescWithDetails = await Promise.all(
        data.map(async (presc) => {
          const { data: patient } = await supabase.from("patients").select("patient_id, user_id").eq("id", presc.patient_id).single();
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", patient?.user_id).single();
          return { ...presc, patient: { ...patient, profile } };
        })
      );
      setPrescriptions(prescWithDetails);
    }
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

  const handleDispense = async (prescription: any) => {
    const { id: prescriptionId, medication_name: medicationName, quantity, patient_id: patientId, encounter_id: encounterId } = prescription;
    
    const inventoryItem = inventory.find((item) => item.drug_name.toLowerCase() === medicationName.toLowerCase());
    if (!inventoryItem) {
      toast({ title: "Not found", description: "Medication not in inventory", variant: "destructive" });
      return;
    }
    if (inventoryItem.quantity < quantity) {
      toast({ title: "Insufficient stock", description: `Only ${inventoryItem.quantity} available`, variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user.id).single();

    // Update prescription
    await supabase.from("prescriptions").update({
      dispensed: true, dispensed_at: new Date().toISOString(), dispensed_by: staff?.id,
    }).eq("id", prescriptionId);

    // Update inventory
    const newQty = inventoryItem.quantity - quantity;
    await supabase.from("pharmacy_inventory").update({ quantity: newQty }).eq("id", inventoryItem.id);

    // Record stock transaction
    await supabase.from("pharmacy_stock_transactions").insert({
      inventory_id: inventoryItem.id,
      qty_issued: quantity,
      balance: newQty,
      issued_to: `Patient: ${prescription.patient?.profile?.full_name || patientId}`,
      recorded_by: staff?.id,
      unit_price: inventoryItem.unit_price,
    });

    // Generate service charge for pharmacy
    await supabase.from("service_charges").insert({
      patient_id: patientId,
      encounter_id: encounterId,
      service_type: "pharmacy",
      description: `Pharmacy: ${medicationName} x${quantity}`,
      amount: inventoryItem.unit_price * quantity,
      billing_stage: "pharmacy",
    });

    toast({ title: "Dispensed", description: "Prescription dispensed, stock updated, charge recorded" });

    // Auto-transition
    const ticket = await getActiveTicket(patientId);
    if (ticket && (ticket.status === "at_pharmacy" || ticket.workflow_stage === "at_pharmacy") && encounterId) {
      await onPrescriptionDispensed({ ticketId: ticket.id, encounterId });
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
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pharmacy</h1>
            <p className="text-muted-foreground">Manage inventory, dispense & stock cards</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search drugs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-64" />
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Add Drug</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Add Medication to Inventory</DialogTitle></DialogHeader>
                <form onSubmit={handleAddInventory} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Drug Name *</Label><Input value={formData.drugName} onChange={(e) => setFormData({ ...formData, drugName: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Generic Name</Label><Input value={formData.genericName} onChange={(e) => setFormData({ ...formData, genericName: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Strength/Size</Label><Input value={formData.strengthSize} onChange={(e) => setFormData({ ...formData, strengthSize: e.target.value })} placeholder="e.g., 500mg" /></div>
                    <div className="space-y-2"><Label>Package</Label><Input value={formData.packageType} onChange={(e) => setFormData({ ...formData, packageType: e.target.value })} placeholder="e.g., Box/100" /></div>
                    <div className="space-y-2"><Label>Batch #</Label><Input value={formData.batchNumber} onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Quantity *</Label><Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Unit Price (KES) *</Label><Input type="number" step="0.01" value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={formData.expiryDate} onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Min Stock</Label><Input type="number" value={formData.minimumStock} onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Max Stock</Label><Input type="number" value={formData.maximumStock} onChange={(e) => setFormData({ ...formData, maximumStock: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" value={formData.reorderLevel} onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })} /></div>
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
          </TabsList>

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
                          <TableCell className="font-medium">{presc.medication_name}</TableCell>
                          <TableCell>{presc.dosage}</TableCell>
                          <TableCell>{presc.quantity}</TableCell>
                          <TableCell className="max-w-xs truncate">{presc.instructions || "-"}</TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => handleDispense(presc)}>Dispense</Button>
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
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openStockCard(item)}>
                            <ClipboardList className="h-4 w-4 mr-1" /> Card
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
    </div>
  );
};

export default Pharmacy;
