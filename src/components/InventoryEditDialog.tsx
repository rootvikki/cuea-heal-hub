import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { logAuditEvent } from "@/lib/auditLog";
import { FORMULATIONS } from "@/lib/rxFormat";
import { Lock } from "lucide-react";

export const PRICE_EDIT_ROLES = ["finance_officer", "admin", "super_admin"];

export function InventoryEditDialog({ item, onClose, onSaved }: { item: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { hasAnyRole } = useUser();
  const canEditPrice = hasAnyRole(PRICE_EDIT_ROLES);
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (item) setF({ ...item }); }, [item]);

  const save = async () => {
    setSaving(true);
    const update: any = {
      drug_name: f.drug_name, generic_name: f.generic_name || null, formulation: f.formulation || null,
      strength_size: f.strength_size || null, package: f.package || null,
      quantity: parseInt(f.quantity) || 0, reorder_level: parseInt(f.reorder_level) || 0,
      expiry_date: f.expiry_date || null, batch_number: f.batch_number || null,
    };
    if (canEditPrice) {
      update.unit_price = parseFloat(f.unit_price) || 0;
      update.insurance_price = f.insurance_price === "" || f.insurance_price == null ? null : parseFloat(f.insurance_price);
    }
    const { error } = await supabase.from("pharmacy_inventory").update(update).eq("id", item.id);
    setSaving(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    const changes = Object.fromEntries(Object.entries(update).filter(([k, v]) => String(item[k] ?? "") !== String(v ?? "")).map(([k, v]) => [k, { from: item[k], to: v }]));
    logAuditEvent({ action: "inventory_item_edited", module: "pharmacy", details: { inventory_id: item.id, drug: item.drug_name, changes } });
    toast({ title: "Saved", description: `${f.drug_name} updated.` });
    onSaved(); onClose();
  };

  const field = (key: string, label: string, type = "text") => (
    <div className="space-y-2"><Label className="text-sm font-semibold">{label}</Label>
      <Input type={type} className="h-12 text-base" value={f[key] ?? ""} onChange={e => setF({ ...f, [key]: e.target.value })} /></div>
  );

  return (
    <Dialog open={!!item} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit inventory item</DialogTitle>
          <DialogDescription>All changes are recorded in the activity log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{field("drug_name", "Drug name")}{field("generic_name", "Generic name")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-2"><Label className="text-sm font-semibold">Formulation</Label>
              <Select value={f.formulation || ""} onValueChange={v => setF({ ...f, formulation: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{FORMULATIONS.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
              </Select></div>
            {field("strength_size", "Strength")}{field("package", "Package")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">{field("quantity", "Stock level", "number")}{field("reorder_level", "Reorder level", "number")}{field("expiry_date", "Expiry", "date")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {field("batch_number", "Batch #")}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1">Selling price (KES) {!canEditPrice && <Lock className="h-3 w-3" />}</Label>
              <Input type="number" step="0.01" className="h-12 text-base" disabled={!canEditPrice} value={f.unit_price ?? ""} onChange={e => setF({ ...f, unit_price: e.target.value })} />
              {!canEditPrice && <p className="text-xs text-muted-foreground">Only finance or admin staff can change prices.</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1">Insurance price (KES) {!canEditPrice && <Lock className="h-3 w-3" />}</Label>
              <Input type="number" step="0.01" className="h-12 text-base" disabled={!canEditPrice} value={f.insurance_price ?? ""} placeholder="Same as selling price" onChange={e => setF({ ...f, insurance_price: e.target.value })} />
              <p className="text-xs text-muted-foreground">Leave empty to charge insurance patients the normal price.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || !f.drug_name}>Save changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
