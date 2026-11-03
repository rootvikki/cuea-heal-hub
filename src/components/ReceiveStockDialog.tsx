import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";

/** Receive stock straight into inventory — no approval step. Adds to the balance and writes a stock-card line. */
export function ReceiveStockDialog({ item, requestId, suggestedQty, onClose, onDone }: {
  item: any | null; requestId?: string | null; suggestedQty?: number; onClose: () => void; onDone?: () => void;
}) {
  const [qty, setQty] = useState("");
  const [from, setFrom] = useState("");
  const [invoice, setInvoice] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQty(suggestedQty ? String(suggestedQty) : ""); setFrom(""); setInvoice("");
    setBatch(item.batch_number || ""); setExpiry(item.expiry_date || "");
  }, [item, suggestedQty]);

  const q = parseInt(qty) || 0;
  const save = async () => {
    if (!item || q <= 0) { toast.error("Enter the quantity received"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("pharmacy_receive_stock", {
      _inventory_id: item.id, _qty: q, _received_from: from || undefined, _invoice_ref: invoice || undefined,
      _batch: batch || undefined, _expiry: expiry || undefined, _request_id: requestId || undefined,
    });
    setSaving(false);
    if (error) { toast.error("Could not receive stock", { description: error.message }); return; }
    toast.success(`${item.drug_name} restocked`, { description: `+${q} → new balance ${(item.quantity || 0) + q}` });
    onDone?.(); onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Receive stock</DialogTitle>
          <DialogDescription>
            {item?.drug_name}{item?.strength_size ? ` ${item.strength_size}` : ""} — in stock now: <b>{item?.quantity ?? 0}</b>. Saved straight to inventory and the stock card.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-semibold">Quantity received *</Label>
              <Input type="number" min={1} autoFocus className="h-12 text-base" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">New balance</Label>
              <div className="h-12 flex items-center rounded-md border bg-muted/40 px-3 text-base font-bold">{(item?.quantity || 0) + q}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="font-semibold">Received from</Label><Input className="h-12" placeholder="Supplier / main store" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-2"><Label className="font-semibold">Invoice / delivery note</Label><Input className="h-12" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label className="font-semibold">Batch #</Label><Input className="h-12" value={batch} onChange={(e) => setBatch(e.target.value)} /></div>
            <div className="space-y-2"><Label className="font-semibold">Expiry</Label><Input type="date" className="h-12" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || q <= 0}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add to stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
