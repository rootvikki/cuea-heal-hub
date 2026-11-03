import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/auditLog";
import { PackagePlus } from "lucide-react";
import { ReceiveStockDialog } from "@/components/ReceiveStockDialog";
import { Pager, usePaged } from "@/components/Pager";

const OPEN = ["requested", "approved", "ordered"];

/** Reorder list: drugs someone noted as running out. Receiving stock needs no approval. */
export function ReplenishmentRequests({ refreshKey, onStockChanged }: { refreshKey?: number; onStockChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<{ item: any; request: any } | null>(null);
  const pages = usePaged(rows);

  const load = async () => {
    const { data } = await supabase.from("pharmacy_replenishment_requests").select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data || []);
  };
  useEffect(() => { void load(); }, [refreshKey]);

  const receive = async (r: any) => {
    if (r.inventory_id) {
      const { data: inv } = await supabase.from("pharmacy_inventory").select("*").eq("id", r.inventory_id).maybeSingle();
      if (inv) { setReceiving({ item: inv, request: r }); return; }
    }
    toast({ title: "This drug is not in the inventory", description: "Add it with “Add Drug”, then close this request.", variant: "destructive" });
  };

  const close = async (r: any) => {
    setBusy(r.id);
    const { error } = await supabase.from("pharmacy_replenishment_requests").update({ status: "cancelled" }).eq("id", r.id);
    setBusy(null);
    if (error) { toast({ title: "Could not update", description: error.message, variant: "destructive" }); return; }
    logAuditEvent({ action: "replenishment_status_changed", module: "pharmacy", details: { request_id: r.id, status: "cancelled" } });
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5" /> Reorder list</CardTitle>
        <CardDescription>Drugs noted as running low. When the stock arrives, click “Receive stock” — it goes straight into inventory, no approval needed.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-center py-8 text-muted-foreground">Nothing on the reorder list</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Medication</TableHead><TableHead>Qty</TableHead><TableHead>Urgency</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead>Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pages.pageItems.map((r) => {
                const open = OPEN.includes(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{r.medication_name}</TableCell>
                    <TableCell>{r.quantity_requested}{r.received_qty ? ` (received ${r.received_qty})` : ""}</TableCell>
                    <TableCell><Badge variant={r.urgency === "urgent" ? "destructive" : "outline"}>{r.urgency}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="capitalize">{open ? "waiting for stock" : r.status}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{r.notes || "-"}</TableCell>
                    <TableCell>
                      {open ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" disabled={busy === r.id} onClick={() => void receive(r)}><PackagePlus className="h-4 w-4 mr-1" /> Receive stock</Button>
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void close(r)}>Remove</Button>
                        </div>
                      ) : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pager pager={pages} label="requests" />
      </CardContent>
      <ReceiveStockDialog
        item={receiving?.item ?? null}
        requestId={receiving?.request?.id}
        suggestedQty={receiving?.request?.quantity_requested}
        onClose={() => setReceiving(null)}
        onDone={() => { void load(); onStockChanged?.(); }}
      />
    </Card>
  );
}
