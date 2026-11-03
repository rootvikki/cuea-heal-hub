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
import { Loader2, Lock } from "lucide-react";

/** Drug prices are a pharmacy matter: pharmacists (and admins) set them — no finance role needed. Finance roles read only. */
export const PRICE_EDIT_ROLES = ["pharmacist", "admin", "super_admin"];

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

export function InventoryEditDialog({ item, onClose, onSaved, categories = [] }: { item: any | null; onClose: () => void; onSaved: () => void; categories?: string[] }) {
  const { toast } = useToast();
  const { hasAnyRole } = useUser();
  const canEditPrice = hasAnyRole(PRICE_EDIT_ROLES);
  const [f, setF] = useState<any>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (item) { setF({ ...item }); setReason(""); } }, [item]);

  const newQty = parseInt(f.quantity);
  const qtyChanged = !!item && !isNaN(newQty) && newQty !== item.quantity;

  const save = async () => {
    if (qtyChanged && newQty < 0) { toast({ title: "Stock level cannot be negative", variant: "destructive" }); return; }
    setSaving(true);
    const update: any = {
      drug_name: (f.drug_name || "").trim(), generic_name: f.generic_name || null, formulation: f.formulation || null,
      strength_size: f.strength_size || null, package: f.package || null, category: f.category || null,
      reorder_level: parseInt(f.reorder_level) || 0, minimum_stock: num(f.minimum_stock), maximum_stock: num(f.maximum_stock),
      expiry_date: f.expiry_date || null, batch_number: f.batch_number || null,
    };
    if (canEditPrice) {
      update.unit_price = parseFloat(f.unit_price) || 0;
      update.insurance_price = num(f.insurance_price);
    }
    // Send only what this person changed, so a stock movement saved by someone else meanwhile isn't overwritten
    const changed = Object.fromEntries(Object.entries(update).filter(([k, v]) => String(item[k] ?? "") !== String(v ?? "")));
    if (Object.keys(changed).length) {
      const { error } = await supabase.from("pharmacy_inventory").update(changed).eq("id", item.id);
      if (error) { setSaving(false); toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
      const changes = Object.fromEntries(Object.keys(changed).map((k) => [k, { from: item[k], to: changed[k] }]));
      logAuditEvent({ action: "inventory_item_edited", module: "pharmacy", details: { inventory_id: item.id, drug: item.drug_name, changes } });
    }
    // Stock level changes go on the stock card as an adjustment (the balance is updated in one step)
    if (qtyChanged) {
      const { error } = await supabase.rpc("pharmacy_set_stock", { _inventory_id: item.id, _new_qty: newQty, _reason: reason || undefined });
      if (error) { setSaving(false); toast({ title: "Details saved, but stock level not changed", description: error.message, variant: "destructive" }); return; }
    }
    setSaving(false);
    if (!Object.keys(changed).length && !qtyChanged) { onClose(); return; }
    toast({ title: "Saved", description: `${update.drug_name} updated.` });
    onSaved(); onClose();
  };

  const field = (key: string, label: string, type = "text", extra: Record<string, unknown> = {}) => (
    <div className="space-y-2"><Label className="text-sm font-semibold">{label}</Label>
      <Input type={type} className="h-12 text-base" value={f[key] ?? ""} onChange={e => setF({ ...f, [key]: e.target.value })} {...extra} /></div>
  );

  return (
    <Dialog open={!!item} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit drug</DialogTitle>
          <DialogDescription>Change anything, including prices and stock. All changes are recorded in the activity log.</DialogDescription>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {field("category", "Category", "text", { list: "inventory-categories" })}
            {field("batch_number", "Batch #")}
            <datalist id="inventory-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="rounded-lg border p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {field("quantity", "Stock level (count on shelf)", "number", { min: 0 })}
              {field("expiry_date", "Expiry", "date")}
            </div>
            {qtyChanged && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Reason for the change ({newQty - item.quantity > 0 ? "+" : ""}{newQty - item.quantity})</Label>
                <Input className="h-12" placeholder="e.g. stock count, new delivery, damaged, expired removed" value={reason} onChange={(e) => setReason(e.target.value)} />
                <p className="text-xs text-muted-foreground">Recorded on the stock card as a stock count adjustment. For deliveries you can also use “Receive stock”.</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {field("minimum_stock", "Min stock", "number")}{field("maximum_stock", "Max stock", "number")}{field("reorder_level", "Reorder level", "number")}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1">Selling price (KES) {!canEditPrice && <Lock className="h-3 w-3" />}</Label>
              <Input type="number" step="0.01" className="h-12 text-base" disabled={!canEditPrice} value={f.unit_price ?? ""} onChange={e => setF({ ...f, unit_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1">Insurance price (KES) {!canEditPrice && <Lock className="h-3 w-3" />}</Label>
              <Input type="number" step="0.01" className="h-12 text-base" disabled={!canEditPrice} value={f.insurance_price ?? ""} placeholder="Same as selling price" onChange={e => setF({ ...f, insurance_price: e.target.value })} />
              <p className="text-xs text-muted-foreground">Leave empty to charge insurance patients the normal price.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !f.drug_name}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
