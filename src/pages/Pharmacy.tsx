import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { Pill, Plus, Package, AlertTriangle } from "lucide-react";

const Pharmacy = () => {
  const { toast } = useToast();
  const { getActiveTicket, onPrescriptionDispensed } = useQueueTransition();
  const [inventory, setInventory] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    drugName: "",
    genericName: "",
    batchNumber: "",
    quantity: "",
    unitPrice: "",
    expiryDate: "",
    reorderLevel: "50",
  });

  useEffect(() => {
    fetchInventory();
    fetchPrescriptions();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pharmacy_inventory")
      .select("*")
      .order("drug_name");

    setInventory(data || []);
    setLoading(false);
  };

  const fetchPrescriptions = async () => {
    const { data } = await supabase
      .from("prescriptions")
      .select("*")
      .eq("dispensed", false)
      .order("created_at", { ascending: false });

    if (data) {
      const prescWithDetails = await Promise.all(
        data.map(async (presc) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", presc.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient?.user_id)
            .single();

          const { data: encounter } = await supabase
            .from("encounters")
            .select("id")
            .eq("id", presc.encounter_id)
            .single();

          return { ...presc, patient: { ...patient, profile }, encounter };
        })
      );
      setPrescriptions(prescWithDetails);
    }
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
    });

    if (error) {
      toast({
        title: "Error adding item",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Inventory updated",
        description: "Drug added to inventory successfully",
      });
      setDialogOpen(false);
      setFormData({
        drugName: "",
        genericName: "",
        batchNumber: "",
        quantity: "",
        unitPrice: "",
        expiryDate: "",
        reorderLevel: "50",
      });
      fetchInventory();
    }
  };

  const handleDispense = async (prescription: any) => {
    const { id: prescriptionId, medication_name: medicationName, quantity, patient_id: patientId, encounter_id: encounterId } = prescription;
    
    // Find inventory item
    const inventoryItem = inventory.find(
      (item) => item.drug_name.toLowerCase() === medicationName.toLowerCase()
    );

    if (!inventoryItem) {
      toast({
        title: "Medication not found",
        description: "This medication is not in inventory",
        variant: "destructive",
      });
      return;
    }

    if (inventoryItem.quantity < quantity) {
      toast({
        title: "Insufficient stock",
        description: `Only ${inventoryItem.quantity} units available`,
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .single();

    // Update prescription
    const { error: prescError } = await supabase
      .from("prescriptions")
      .update({
        dispensed: true,
        dispensed_at: new Date().toISOString(),
        dispensed_by: staff?.id,
      })
      .eq("id", prescriptionId);

    // Update inventory
    const { error: invError } = await supabase
      .from("pharmacy_inventory")
      .update({
        quantity: inventoryItem.quantity - quantity,
      })
      .eq("id", inventoryItem.id);

    if (prescError || invError) {
      toast({
        title: "Error dispensing",
        description: prescError?.message || invError?.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Dispensed successfully",
        description: "Prescription dispensed and inventory updated",
      });

      // Auto-transition: Check if all prescriptions are dispensed
      const ticket = await getActiveTicket(patientId);
      if (ticket && ticket.status === "at_pharmacy" && encounterId) {
        await onPrescriptionDispensed({ ticketId: ticket.id, encounterId });
      }

      fetchInventory();
      fetchPrescriptions();
    }
  };

  const getLowStockItems = () => {
    return inventory.filter((item) => item.quantity <= item.reorder_level);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pharmacy</h1>
          <p className="text-muted-foreground mt-1">
            Manage inventory and dispense medications
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Inventory
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Medication to Inventory</DialogTitle>
              <DialogDescription>Enter medication details</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddInventory} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Drug Name *</Label>
                  <Input
                    value={formData.drugName}
                    onChange={(e) => setFormData({ ...formData, drugName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Generic Name</Label>
                  <Input
                    value={formData.genericName}
                    onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Batch Number</Label>
                  <Input
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Unit Price (KES) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reorder Level</Label>
                <Input
                  type="number"
                  value={formData.reorderLevel}
                  onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add to Inventory</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {getLowStockItems().length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {getLowStockItems().length} item(s) below reorder level:{" "}
              {getLowStockItems().map(i => i.drug_name).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Inventory ({inventory.length})
            </CardTitle>
            <CardDescription>Current stock levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Drug Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        No inventory items yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.drug_name}</p>
                            {item.generic_name && (
                              <p className="text-sm text-muted-foreground">{item.generic_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.quantity <= item.reorder_level ? "destructive" : "outline"}>
                            {item.quantity} units
                          </Badge>
                        </TableCell>
                        <TableCell>KES {item.unit_price}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Pending Prescriptions ({prescriptions.length})
            </CardTitle>
            <CardDescription>Awaiting dispensing</CardDescription>
          </CardHeader>
          <CardContent>
            {prescriptions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No pending prescriptions
              </p>
            ) : (
              <div className="space-y-3">
                {prescriptions.map((presc) => (
                  <div key={presc.id} className="p-4 border rounded-lg space-y-2">
                    <div>
                      <p className="font-medium">{presc.patient?.profile?.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {presc.patient?.patient_id}
                      </p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p><strong>Medication:</strong> {presc.medication_name}</p>
                      <p><strong>Dosage:</strong> {presc.dosage}</p>
                      <p><strong>Quantity:</strong> {presc.quantity}</p>
                      <p><strong>Instructions:</strong> {presc.instructions}</p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleDispense(presc)}
                    >
                      Dispense
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Pharmacy;
