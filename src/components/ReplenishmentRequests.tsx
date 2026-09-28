import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/auditLog";
import { PackagePlus } from "lucide-react";

const NEXT: Record<string, { status: string; label: string } | null> = {
  requested: { status: "approved", label: "Approve" },
  approved: { status: "ordered", label: "Mark Ordered" },
  ordered: { status: "received", label: "Receive Stock" },
  received: null,
  cancelled: null,
};

export function ReplenishmentRequests({ refreshKey, onStockChanged }: { refreshKey?: number; onStockChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("pharmacy_replenishment_requests").select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data || []);
  };
  useEffect(() => { load(); }, [refreshKey]);

  const advance = async (r: any, cancel = false) => {
    const next = cancel ? { status: "cancelled" } : NEXT[r.status];
    if (!next) return;
    setBusy(r.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { status: next.status };
      if (next.status === "approved") { update.approved_at = now; update.approved_by = user?.id; }
      if (next.status === "ordered") update.ordered_at = now;
      if (next.status === "received") {
        const q = parseInt(receiveQty[r.id] || String(r.quantity_requested));
        if (!q || q <= 0) throw new Error("Enter the quantity received");
        update.received_at = now; update.received_qty = q;
        if (r.inventory_id) {
          const { data: inv } = await supabase.from("pharmacy_inventory").select("quantity, unit_price").eq("id", r.inventory_id).single();
          const newQty = (inv?.quantity || 0) + q;
          const { error: invErr } = await supabase.from("pharmacy_inventory").update({ quantity: newQty }).eq("id", r.inventory_id);
          if (invErr) throw invErr;
          const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle();
          await supabase.from("pharmacy_stock_transactions").insert({
            inventory_id: r.inventory_id, qty_received: q, balance: newQty,
            received_from: `Replenishment request`, unit_price: inv?.unit_price, recorded_by: staff?.id ?? null,
          });
        }
      }
      const { error } = await supabase.from("pharmacy_replenishment_requests").update(update).eq("id", r.id);
      if (error) throw error;
      logAuditEvent({ action: "replenishment_status_changed", module: "pharmacy", details: { request_id: r.id, status: next.status } });
      toast({ title: `Request ${next.status}` });
      load();
      if (next.status === "received") onStockChanged?.();
    } catch (e) {
      toast({ title: "Could not update request", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Replenishment Requests</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-center py-8 text-muted-foreground">No replenishment requests yet</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Medication</TableHead><TableHead>Qty</TableHead><TableHead>Urgency</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead>Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const next = NEXT[r.status];
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{r.medication_name}</TableCell>
                    <TableCell>{r.quantity_requested}{r.received_qty ? ` (recv ${r.received_qty})` : ""}</TableCell>
                    <TableCell><Badge variant={r.urgency === "urgent" ? "destructive" : "outline"}>{r.urgency}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{r.status}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{r.notes || "-"}</TableCell>
                    <TableCell>
                      {next ? (
                        <div className="flex items-center gap-2">
                          {r.status === "ordered" && (
                            <Input type="number" className="w-20 h-9" placeholder={String(r.quantity_requested)} value={receiveQty[r.id] || ""} onChange={(e) => setReceiveQty({ ...receiveQty, [r.id]: e.target.value })} />
                          )}
                          <Button size="sm" disabled={busy === r.id} onClick={() => advance(r)}>{next.label}</Button>
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => advance(r, true)}>Cancel</Button>
                        </div>
                      ) : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
