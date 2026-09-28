import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  medicationName: string;
  inventoryId?: string | null;
  prescriptionId?: string | null;
  suggestedQty?: number;
  onCreated?: () => void;
}

export function ReplenishmentRequestDialog({ open, onOpenChange, medicationName, inventoryId, prescriptionId, suggestedQty, onCreated }: Props) {
  const { toast } = useToast();
  const [qty, setQty] = useState(String(suggestedQty || ""));
  const [urgency, setUrgency] = useState("normal");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const q = parseInt(qty);
    if (!q || q <= 0) { toast({ title: "Enter a quantity", variant: "destructive" }); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("pharmacy_replenishment_requests").insert({
      medication_name: medicationName, inventory_id: inventoryId || null, prescription_id: prescriptionId || null,
      quantity_requested: q, urgency, notes: notes || null, requested_by: user?.id,
    }).select("id").single();
    setSaving(false);
    if (error) { toast({ title: "Could not create request", description: error.message, variant: "destructive" }); return; }
    logAuditEvent({ action: "replenishment_requested", module: "pharmacy", details: { request_id: data.id, medication: medicationName, quantity: q, urgency } });
    await notifyRoles(["admin", "super_admin"], {
      title: urgency === "urgent" ? "URGENT stock replenishment" : "Stock replenishment requested",
      message: `${medicationName} × ${q} requested by pharmacy.`,
      category: "pharmacy", referenceId: data.id, link: "/pharmacy",
    });
    toast({ title: "Replenishment requested", description: `${medicationName} × ${q}` });
    setNotes(""); onOpenChange(false); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request replenishment</DialogTitle>
          <DialogDescription>{medicationName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2"><Label>Quantity needed</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="h-12" /></div>
          <div className="space-y-2"><Label>Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier, reason, etc." /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Sending..." : "Send request"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
