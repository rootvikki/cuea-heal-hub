import { useState, useEffect, useMemo, useCallback } from "react";
import { InventoryEditDialog } from "@/components/InventoryEditDialog";
import { useUser } from "@/contexts/UserContext";
import { formatRx } from "@/lib/rxFormat";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { StationQueue, StationShell } from "@/components/StationQueue";
import {
  Pill, Plus, Package, AlertTriangle, Search, ClipboardList, PackagePlus, Pencil, Printer, Receipt, CheckCircle2, ArrowLeft, Loader2, Send, Clock,
} from "lucide-react";
import { findInventoryItem, remainingQty } from "@/lib/pharmacyStock";
import { ReplenishmentRequestDialog } from "@/components/ReplenishmentRequestDialog";
import { ReplenishmentRequests } from "@/components/ReplenishmentRequests";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";
import { MedicationInteractionCheck } from "@/components/MedicationInteractionCheck";
import { SendToDialog } from "@/components/SendToDialog";
import { authUserIdForStaff, notifyUser } from "@/lib/notifications";
import { currentStaffId, sendPatientTo } from "@/lib/stations";
import { formatKES, paymentModeLabel, priceFor } from "@/lib/pricing";
import { calculateAge, cn } from "@/lib/utils";

type Decision = "dispense" | "not_available" | "alternative";

interface Line {
  id: string;
  decision: Decision;
  qty: string;
  alternativeId: string;
  note: string;
}

/** One prescription sheet = every drug prescribed on one visit. */
interface RxSheet {
  key: string;
  ticketId: string | null;
  ticket: any | null;
  patient: any;
  items: any[];
  createdAt: string;
  stage: "new" | "billing" | "dispense" | "done";
}

const STAGE_INFO: Record<RxSheet["stage"], { label: string; cls: string }> = {
  new: { label: "New — check stock", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  billing: { label: "At billing", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  dispense: { label: "Paid — dispense", cls: "bg-green-100 text-green-800 border-green-300" },
  done: { label: "Done", cls: "bg-muted text-muted-foreground" },
};

const sheetStage = (items: any[], ticket: any): RxSheet["stage"] => {
  const open = items.filter((i) => !["dispensed", "not_dispensed", "collected"].includes(i.status));
  if (open.length === 0) return "done";
  if (open.some((i) => i.status === "billed")) return ticket?.workflow_stage === "at_billing" ? "billing" : "dispense";
  return "new";
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const Pharmacy = () => {
  const { hasAnyRole } = useUser();
  const canEditInventory = hasAnyRole(["pharmacist", "admin", "super_admin"]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [tickets, setTickets] = useState<Record<string, any>>({});
  const [stockTransactions, setStockTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [rxSearch, setRxSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockCardItem, setStockCardItem] = useState<any>(null);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [busy, setBusy] = useState<"bill" | "dispense" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [replenish, setReplenish] = useState<{ medicationName: string; inventoryId?: string; prescriptionId?: string; qty?: number } | null>(null);
  const [replenishKey, setReplenishKey] = useState(0);
  const [editItem, setEditItem] = useState<any>(null);
  const [tab, setTab] = useState("prescriptions");
  const [showOlderRx, setShowOlderRx] = useState(false);
  const [formData, setFormData] = useState({
    drugName: "", genericName: "", batchNumber: "", quantity: "", unitPrice: "",
    expiryDate: "", reorderLevel: "50", strengthSize: "", packageType: "",
    minimumStock: "", maximumStock: "",
  });

  const fetchInventory = useCallback(async () => {
    const { data } = await supabase.from("pharmacy_inventory").select("*").order("drug_name");
    setInventory(data || []);
    setLoading(false);
  }, []);

  const fetchPrescriptions = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("prescriptions")
      .select("*, encounters!inner(ticket_id, chief_complaint), patients!inner(id, patient_id, user_id, allergies, profiles!inner(full_name, gender, date_of_birth))")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    const rows = (data || []).map((p: any) => ({
      ...p,
      ticket_id: p.encounters?.ticket_id ?? null,
      patient: { id: p.patients?.id, patient_id: p.patients?.patient_id, user_id: p.patients?.user_id, allergies: p.patients?.allergies, profile: p.patients?.profiles },
    }));
    setPrescriptions(rows);
    const ids = [...new Set(rows.map((r) => r.ticket_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: t } = await supabase.from("tickets").select("id, ticket_number, workflow_stage, payment_mode, department_id").in("id", ids);
      setTickets(Object.fromEntries((t || []).map((x: any) => [x.id, x])));
    }
  }, []);

  useEffect(() => {
    void fetchInventory();
    void fetchPrescriptions();
    const channel = supabase
      .channel("pharmacy-rx")
      .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, () => void fetchPrescriptions())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets" }, () => void fetchPrescriptions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchInventory, fetchPrescriptions]);

  const sheets = useMemo<RxSheet[]>(() => {
    const m = new Map<string, RxSheet>();
    for (const p of prescriptions) {
      const key = p.ticket_id || p.encounter_id;
      if (!m.has(key)) m.set(key, { key, ticketId: p.ticket_id, ticket: tickets[p.ticket_id] ?? null, patient: p.patient, items: [], createdAt: p.created_at, stage: "new" });
      m.get(key)!.items.push(p);
    }
    return [...m.values()].map((s) => ({ ...s, ticket: s.ticketId ? tickets[s.ticketId] ?? null : null, stage: sheetStage(s.items, s.ticketId ? tickets[s.ticketId] : null) }));
  }, [prescriptions, tickets]);

  const sheet = sheets.find((s) => s.key === openKey) || null;
  const paymentMode = sheet?.ticket?.payment_mode || selectedTicket?.payment_mode;

  // Give the work area the full width while a patient is open
  useEffect(() => { setQueueCollapsed(!!openKey); }, [openKey]);

  useEffect(() => {
    if (selectedTicket) setOpenKey(selectedTicket.id);
  }, [selectedTicket]);

  // Receive: opening a sheet marks new prescriptions as received
  useEffect(() => {
    if (!sheet) return;
    const fresh = sheet.items.filter((i) => i.status === "sent");
    if (fresh.length) {
      (async () => {
        const staffId = await currentStaffId();
        await supabase.from("prescriptions").update({ status: "received", received_at: new Date().toISOString(), received_by: staffId }).in("id", fresh.map((f) => f.id));
        void fetchPrescriptions();
      })();
    }
    // Default decisions from stock
    const next: Record<string, Line> = {};
    for (const i of sheet.items) {
      const need = remainingQty(i) || i.quantity;
      const inv = findInventoryItem(inventory, i.medication_name);
      const saved = i.pharmacy_decision as Decision | null;
      const decision: Decision = saved || (!inv || inv.quantity <= 0 ? "not_available" : "dispense");
      next[i.id] = {
        id: i.id,
        decision,
        qty: String(i.planned_qty ?? (inv ? Math.min(inv.quantity, need) || need : need)),
        alternativeId: i.alternative_inventory_id || "",
        note: i.pharmacy_notes || "",
      };
    }
    setLines(next);
  }, [openKey, sheet?.items.length, inventory.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemFor = (rx: any, line?: Line) =>
    line?.decision === "alternative" ? inventory.find((i) => i.id === line.alternativeId) : findInventoryItem(inventory, rx.medication_name);

  const lineTotal = (rx: any) => {
    const l = lines[rx.id];
    if (!l || l.decision === "not_available") return 0;
    const item = itemFor(rx, l);
    return priceFor(item, paymentMode) * (parseInt(l.qty) || 0);
  };
  const sheetTotal = sheet ? sheet.items.filter((i) => !["dispensed", "not_dispensed", "collected"].includes(i.status)).reduce((s, rx) => s + lineTotal(rx), 0) : 0;

  const setLine = (id: string, patch: Partial<Line>) => setLines((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  /** Validates the ticks; returns an error message or null. */
  const checkLines = (items: any[]) => {
    for (const rx of items) {
      const l = lines[rx.id];
      if (!l) continue;
      if (l.decision === "not_available") continue;
      const q = parseInt(l.qty);
      if (!q || q <= 0) return `Enter the quantity for ${rx.medication_name}`;
      const item = itemFor(rx, l);
      if (!item) return l.decision === "alternative" ? `Choose the alternative for ${rx.medication_name}` : `${rx.medication_name} is not in stock — mark it "Not available" or choose an alternative`;
      if (q > item.quantity) return `Only ${item.quantity} of ${item.drug_name} in stock`;
    }
    return null;
  };

  /** Step 2: price the ticked items and send the patient to billing. */
  const sendToBilling = async () => {
    if (!sheet) return;
    const open = sheet.items.filter((i) => !["billed", "dispensed", "not_dispensed", "collected"].includes(i.status));
    const problem = checkLines(open);
    if (problem) return toast.error(problem);
    if (!sheet.ticketId) return toast.error("This prescription is not linked to a visit");
    setBusy("bill");
    try {
      const now = new Date().toISOString();
      for (const rx of open) {
        const l = lines[rx.id];
        const item = itemFor(rx, l);
        const unit = priceFor(item, paymentMode);
        const qty = parseInt(l.qty) || 0;
        if (l.decision === "not_available") {
          await supabase.from("prescriptions").update({ status: "not_dispensed", pharmacy_decision: "not_available", pharmacy_notes: l.note || null, reviewed_at: now } as any).eq("id", rx.id);
          continue;
        }
        await supabase.from("prescriptions").update({
          status: "billed", pharmacy_decision: l.decision, planned_qty: qty, unit_price: unit,
          alternative_inventory_id: l.decision === "alternative" ? l.alternativeId : null,
          pharmacy_notes: l.note || null, billed_at: now, reviewed_at: now,
        } as any).eq("id", rx.id);
        await supabase.from("service_charges").insert({
          patient_id: rx.patient_id, encounter_id: rx.encounter_id, ticket_id: sheet.ticketId,
          service_type: "pharmacy",
          description: `Pharmacy: ${l.decision === "alternative" ? `${item?.drug_name} (alt. for ${rx.medication_name})` : rx.medication_name} x${qty}`,
          amount: unit * qty, billing_stage: "pharmacy",
        });
      }
      await sendPatientTo({ ticketId: sheet.ticketId, patientName: sheet.patient?.profile?.full_name, to: "billing", from: "Pharmacy" });
      logAuditEvent({ action: "pharmacy_sent_to_billing", module: "pharmacy", details: { ticket_id: sheet.ticketId, items: open.length, total: sheetTotal } });
      toast.success("Sent to billing", { description: `${formatKES(sheetTotal)} — the patient returns here after paying` });
      setSelectedTicket(null);
      setOpenKey(null);
      void fetchPrescriptions();
    } catch (e) {
      toast.error("Could not send to billing", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  /** Step 3: give the drugs, deduct stock, print the ticked prescription and check the patient out. */
  const dispenseAll = async () => {
    if (!sheet) return;
    const billed = sheet.items.filter((i) => i.status === "billed");
    if (billed.length === 0) return toast.info("Nothing waiting to be dispensed");
    setBusy("dispense");
    try {
      const staffId = await currentStaffId();
      const now = new Date().toISOString();
      for (const rx of billed) {
        const isAlt = rx.pharmacy_decision === "alternative";
        const item = isAlt ? inventory.find((i) => i.id === rx.alternative_inventory_id) : findInventoryItem(inventory, rx.medication_name);
        const qty = rx.planned_qty || remainingQty(rx);
        if (!item) throw new Error(`${rx.medication_name}: item no longer in inventory`);
        if (qty > item.quantity) throw new Error(`Only ${item.quantity} of ${item.drug_name} left in stock`);
        const newQty = item.quantity - qty;
        const { error: iErr } = await supabase.from("pharmacy_inventory").update({ quantity: newQty }).eq("id", item.id);
        if (iErr) throw iErr;
        item.quantity = newQty;
        await supabase.from("pharmacy_stock_transactions").insert({
          inventory_id: item.id, qty_issued: qty, balance: newQty, recorded_by: staffId, unit_price: rx.unit_price ?? item.unit_price,
          issued_to: `Patient: ${sheet.patient?.profile?.full_name || rx.patient_id}${isAlt ? " (alternative)" : ""}`,
        });
        const { error } = await supabase.from("prescriptions").update({
          status: "dispensed", dispensed: true, dispensed_at: now, dispensed_by: staffId,
          dispensing_started_at: rx.dispensing_started_at || now,
          quantity_dispensed: (rx.quantity_dispensed || 0) + qty,
          ...(isAlt ? { substituted_with: `${item.drug_name}${item.strength_size ? ` ${item.strength_size}` : ""} x${qty}`, substitution_reason: rx.pharmacy_notes || "Alternative given" } : {}),
        }).eq("id", rx.id);
        if (error) throw error;
        if (isAlt || qty < rx.quantity) {
          const uid = await authUserIdForStaff(rx.doctor_id);
          await notifyUser(uid, {
            title: isAlt ? "Alternative given" : "Partly dispensed",
            message: `${rx.medication_name} for ${sheet.patient?.profile?.full_name || "a patient"}: ${isAlt ? `gave ${item.drug_name} x${qty}` : `${qty} of ${rx.quantity} given`}.`,
            category: "pharmacy", referenceId: rx.id, link: "/consultation",
          });
        }
      }
      logAuditEvent({ action: "prescriptions_dispensed", module: "pharmacy", details: { ticket_id: sheet.ticketId, items: billed.length } });
      await fetchPrescriptions();
      printSheet({ ...sheet, items: sheet.items.map((i) => (billed.some((b) => b.id === i.id) ? { ...i, status: "dispensed" } : i)) });
      if (sheet.ticketId && sheet.ticket?.workflow_stage === "at_pharmacy") {
        await sendPatientTo({ ticketId: sheet.ticketId, patientName: sheet.patient?.profile?.full_name, to: "checkout", from: "Pharmacy" });
      }
      toast.success("Dispensed", { description: "Stock updated and patient checked out" });
      setSelectedTicket(null);
      setOpenKey(null);
      void fetchInventory();
    } catch (e) {
      toast.error("Could not dispense", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  /** Prints the full prescription with what was / was not dispensed and alternatives. */
  const printSheet = (s: RxSheet) => {
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to print");
    const rows = s.items.map((rx, i) => {
      const l = lines[rx.id];
      const decision = (rx.pharmacy_decision || l?.decision || "") as string;
      const given = rx.status === "dispensed" || rx.status === "collected";
      const notGiven = rx.status === "not_dispensed" || decision === "not_available";
      const altItem = decision === "alternative" ? inventory.find((x) => x.id === (rx.alternative_inventory_id || l?.alternativeId)) : null;
      const alt = rx.substituted_with || (altItem ? `${altItem.drug_name}${altItem.strength_size ? ` ${altItem.strength_size}` : ""}` : "");
      const qtyGiven = given ? rx.quantity_dispensed || rx.planned_qty : rx.planned_qty ?? (l && decision !== "not_available" ? l.qty : "");
      return `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(formatRx(rx))}</b>${rx.instructions ? `<br/><small>${esc(rx.instructions)}</small>` : ""}</td>
        <td class="c">${esc(rx.quantity)}</td>
        <td class="c">${esc(qtyGiven ?? "")}</td>
        <td class="c big">${given ? "&#9745;" : notGiven ? "&#9746;" : "&#9744;"}</td>
        <td>${esc(alt)}</td>
        <td>${esc(rx.pharmacy_notes || l?.note || "")}</td>
      </tr>`;
    }).join("");
    const p = s.patient || {};
    w.document.write(`<html><head><title>Prescription — ${esc(p.profile?.full_name)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;max-width:900px;margin:auto}
        h1{font-size:16px;text-align:center;margin:0}h2{font-size:13px;text-align:center;margin:4px 0 16px;font-weight:normal}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:12px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #555;padding:6px;vertical-align:top}
        th{background:#eee;text-align:left}.c{text-align:center}.big{font-size:18px}
        .key{font-size:11px;margin-top:8px}.sign{display:flex;justify-content:space-between;margin-top:36px;font-size:12px}
      </style></head><body>
      <h1>THE CATHOLIC UNIVERSITY OF EASTERN AFRICA — UNIVERSITY INFIRMARY</h1>
      <h2>PRESCRIPTION &amp; DISPENSING RECORD</h2>
      <div class="meta">
        <div><b>Patient:</b> ${esc(p.profile?.full_name)}</div><div><b>Date:</b> ${new Date().toLocaleString()}</div>
        <div><b>OPD No.:</b> ${esc(p.patient_id)}</div><div><b>Age / Sex:</b> ${esc(calculateAge(p.profile?.date_of_birth))} / ${esc(p.profile?.gender || "")}</div>
        <div><b>Payment mode:</b> ${esc(paymentModeLabel(s.ticket?.payment_mode))}</div><div><b>Ticket:</b> ${esc(s.ticket?.ticket_number || "")}</div>
      </div>
      <table><thead><tr><th>#</th><th>Medication</th><th>Qty prescribed</th><th>Qty given</th><th>Dispensed</th><th>Alternative given</th><th>Pharmacist note</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="key">&#9745; dispensed &nbsp; &#9746; not dispensed (not available) &nbsp; &#9744; pending</p>
      <div class="sign"><span>Pharmacist: ____________________</span><span>Patient signature: ____________________</span></div>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
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
      toast.error(error.message);
    } else {
      toast.success("Drug added to inventory");
      setDialogOpen(false);
      setFormData({ drugName: "", genericName: "", batchNumber: "", quantity: "", unitPrice: "", expiryDate: "", reorderLevel: "50", strengthSize: "", packageType: "", minimumStock: "", maximumStock: "" });
      fetchInventory();
    }
  };


  const openStockCard = (item: any) => {
    setStockCardItem(item);
    void fetchStockCard(item.id);
    setTab("stockcard");
  };

  const lowStockItems = inventory.filter((item) => item.quantity <= (item.reorder_level || 50));
  const filteredInventory = inventory.filter((i) =>
    i.drug_name.toLowerCase().includes(searchTerm.toLowerCase()) || (i.generic_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const rq = rxSearch.toLowerCase();
  // Today's work first: sheets for patients at pharmacy/billing now, or prescribed in the last 18 hours
  const isCurrentSheet = (s: RxSheet) =>
    ["at_pharmacy", "at_billing"].includes(s.ticket?.workflow_stage) || Date.now() - new Date(s.createdAt).getTime() < 18 * 3600 * 1000;
  const olderSheets = sheets.filter((s) => s.stage !== "done" && !isCurrentSheet(s));
  const visibleSheets = sheets.filter((s) => s.stage !== "done" && (showOlderRx || isCurrentSheet(s)) && (!rq || [s.patient?.profile?.full_name, s.patient?.patient_id, ...s.items.map((i) => i.medication_name)].some((x) => x?.toLowerCase().includes(rq))));
  const openItems = sheet ? sheet.items.filter((i) => !["dispensed", "not_dispensed", "collected"].includes(i.status)) : [];
  const editable = sheet?.stage === "new";

  return (
    <StationShell
      queue={
        <StationQueue
          stationStages={["at_pharmacy"]}
          nextStage="at_billing"
          title="Pharmacy Queue"
          onSelectPatient={setSelectedTicket}
          selectedTicketId={selectedTicket?.id}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Pill className="h-7 w-7 text-primary" /> Pharmacy</h1>
          <p className="text-muted-foreground text-sm mt-1">Receive → tick what you have → send to billing → dispense &amp; print</p>
        </div>
      </div>

      {sheet ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setOpenKey(null); setSelectedTicket(null); }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                  <CardTitle className="text-lg">{sheet.patient?.profile?.full_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{sheet.patient?.patient_id} · {calculateAge(sheet.patient?.profile?.date_of_birth)} · <span className="capitalize">{sheet.patient?.profile?.gender || "—"}</span></p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className={STAGE_INFO[sheet.stage].cls}>{STAGE_INFO[sheet.stage].label}</Badge>
                    <Badge variant="outline">{paymentModeLabel(paymentMode)}</Badge>
                    {sheet.patient?.allergies?.length > 0 && <Badge variant="destructive">Allergies: {sheet.patient.allergies.join(", ")}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <MedicationInteractionCheck patientId={sheet.patient?.id} patientName={sheet.patient?.profile?.full_name} />
                {sheet.ticketId && <InterimPayment ticketId={sheet.ticketId} patientId={sheet.patient?.id} />}
                <Button variant="outline" size="sm" className="h-8" onClick={() => printSheet(sheet)}><Printer className="h-4 w-4 mr-1" /> Print prescription</Button>
                {sheet.ticketId && <Button variant="outline" size="sm" className="h-8" onClick={() => setSendOpen(true)}><Send className="h-4 w-4 mr-1" /> Send to…</Button>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sheet.stage === "billing" && (
              <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><Clock className="h-4 w-4" /> Waiting for payment at billing. The patient comes back here to collect.</p>
            )}

            {/* Desktop / tablet table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse border text-sm min-w-[760px]">
                <thead>
                  <tr>{["Medication", "Prescribed", "In stock", "Decision", "Qty to give", "Price", "Note"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sheet.items.map((rx) => {
                    const l = lines[rx.id];
                    const inv = findInventoryItem(inventory, rx.medication_name);
                    const closed = ["dispensed", "not_dispensed", "collected"].includes(rx.status);
                    const locked = !editable || closed || rx.status === "billed";
                    return (
                      <tr key={rx.id} className={cn(closed && "bg-muted/40")}>
                        <td className="border px-2 py-1.5 min-w-[180px]">
                          <p className="font-semibold">{rx.medication_name} {rx.strength && <span className="font-normal text-muted-foreground">{rx.strength}</span>}</p>
                          <p className="text-xs text-muted-foreground">{[rx.formulation, rx.frequency, rx.duration && `x ${rx.duration}`].filter(Boolean).join(" · ")}</p>
                          {rx.instructions && <p className="text-xs text-muted-foreground">{rx.instructions}</p>}
                        </td>
                        <td className="border px-2 py-1.5 text-center">{rx.quantity}</td>
                        <td className="border px-2 py-1.5 text-center">
                          {inv ? <span className={inv.quantity < (remainingQty(rx) || rx.quantity) ? "text-destructive font-semibold" : ""}>{inv.quantity}</span> : <span className="text-destructive text-xs">Not stocked</span>}
                        </td>
                        <td className="border px-2 py-1.5 min-w-[250px]">
                          {closed ? (
                            <Badge variant={rx.status === "not_dispensed" ? "destructive" : "default"}>{rx.status === "not_dispensed" ? "Not dispensed" : "Dispensed"}</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {([["dispense", "Give"], ["not_available", "Not available"], ["alternative", "Alternative"]] as [Decision, string][]).map(([d, label]) => (
                                <Button key={d} type="button" size="sm" disabled={locked} variant={l?.decision === d ? (d === "not_available" ? "destructive" : "default") : "outline"} className="h-8 px-2 text-xs" onClick={() => setLine(rx.id, { decision: d })}>
                                  {label}
                                </Button>
                              ))}
                            </div>
                          )}
                          {l?.decision === "alternative" && !closed && (
                            <Select value={l.alternativeId} onValueChange={(v) => setLine(rx.id, { alternativeId: v })} disabled={locked}>
                              <SelectTrigger className="h-9 mt-1.5"><SelectValue placeholder="Choose alternative" /></SelectTrigger>
                              <SelectContent className="max-h-72">
                                {inventory.filter((i) => i.quantity > 0 && i.id !== inv?.id).map((i) => (
                                  <SelectItem key={i.id} value={i.id}>{i.drug_name}{i.strength_size ? ` ${i.strength_size}` : ""} — {i.quantity} left</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {l?.decision === "not_available" && !closed && editable && (
                            <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-xs" onClick={() => setReplenish({ medicationName: rx.medication_name, inventoryId: inv?.id, prescriptionId: rx.id, qty: rx.quantity })}>
                              <PackagePlus className="h-3 w-3 mr-1" /> Request stock
                            </Button>
                          )}
                        </td>
                        <td className="border px-2 py-1.5 min-w-[5.5rem]">
                          {l?.decision !== "not_available" && !closed ? (
                            <Input type="number" min={1} className="h-9" disabled={locked} value={l?.qty ?? ""} onChange={(e) => setLine(rx.id, { qty: e.target.value })} />
                          ) : closed ? <span className="text-center block">{rx.quantity_dispensed || "—"}</span> : "—"}
                        </td>
                        <td className="border px-2 py-1.5 whitespace-nowrap">{closed ? "" : formatKES(rx.status === "billed" ? (rx.unit_price || 0) * (rx.planned_qty || 0) : lineTotal(rx))}</td>
                        <td className="border px-2 py-1.5">
                          {closed ? <span className="text-xs">{rx.substituted_with ? `Gave ${rx.substituted_with}. ` : ""}{rx.pharmacy_notes || ""}</span> : (
                            <Input className="h-9 min-w-[8rem]" disabled={locked} placeholder="Optional" value={l?.note ?? ""} onChange={(e) => setLine(rx.id, { note: e.target.value })} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phone layout */}
            <div className="md:hidden space-y-2">
              {sheet.items.map((rx) => {
                const l = lines[rx.id];
                const inv = findInventoryItem(inventory, rx.medication_name);
                const closed = ["dispensed", "not_dispensed", "collected"].includes(rx.status);
                const locked = !editable || closed || rx.status === "billed";
                return (
                  <div key={rx.id} className="rounded-lg border p-3 space-y-2">
                    <p className="font-semibold text-sm">{rx.medication_name} <span className="font-normal text-muted-foreground">{[rx.strength, rx.frequency, rx.duration && `x ${rx.duration}`].filter(Boolean).join(" · ")}</span></p>
                    <p className="text-xs text-muted-foreground">Prescribed {rx.quantity} · In stock {inv ? inv.quantity : "—"}</p>
                    {closed ? <Badge variant={rx.status === "not_dispensed" ? "destructive" : "default"}>{rx.status === "not_dispensed" ? "Not dispensed" : "Dispensed"}</Badge> : (
                      <>
                        <div className="grid grid-cols-3 gap-1">
                          {([["dispense", "Give"], ["not_available", "None"], ["alternative", "Alt."]] as [Decision, string][]).map(([d, label]) => (
                            <Button key={d} size="sm" disabled={locked} variant={l?.decision === d ? (d === "not_available" ? "destructive" : "default") : "outline"} className="h-9" onClick={() => setLine(rx.id, { decision: d })}>{label}</Button>
                          ))}
                        </div>
                        {l?.decision === "alternative" && (
                          <Select value={l.alternativeId} onValueChange={(v) => setLine(rx.id, { alternativeId: v })} disabled={locked}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Choose alternative" /></SelectTrigger>
                            <SelectContent className="max-h-72">{inventory.filter((i) => i.quantity > 0).map((i) => <SelectItem key={i.id} value={i.id}>{i.drug_name} — {i.quantity}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                        {l?.decision !== "not_available" && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Qty</Label>
                            <Input type="number" className="h-10 w-24" disabled={locked} value={l?.qty ?? ""} onChange={(e) => setLine(rx.id, { qty: e.target.value })} />
                            <span className="ml-auto text-sm font-medium">{formatKES(lineTotal(rx))}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 backdrop-blur px-1 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {openItems.length} item(s) open · <strong>{formatKES(sheet.stage === "new" ? sheetTotal : openItems.reduce((s, rx) => s + (rx.unit_price || 0) * (rx.planned_qty || 0), 0))}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {sheet.stage === "new" && (
                  <Button className="h-11 px-6" onClick={sendToBilling} disabled={busy === "bill"}>
                    {busy === "bill" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />} Send to billing
                  </Button>
                )}
                {sheet.stage === "dispense" && (
                  <Button className="h-11 px-6 bg-green-600 hover:bg-green-700 text-white" onClick={dispenseAll} disabled={busy === "dispense"}>
                    {busy === "dispense" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Dispense &amp; print
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : selectedTicket ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setOpenKey(null); setSelectedTicket(null); }} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                  <CardTitle className="text-lg">{selectedTicket.patient?.profile?.full_name || "Patient"}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedTicket.patient?.patient_id} · {selectedTicket.ticket_number} · {calculateAge(selectedTicket.patient?.profile?.date_of_birth)} · <span className="capitalize">{selectedTicket.patient?.profile?.gender || "—"}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Being served</Badge>
                    <Badge variant="outline">{paymentModeLabel(selectedTicket.payment_mode)}</Badge>
                    {selectedTicket.patient?.allergies?.length > 0 && <Badge variant="destructive">Allergies: {selectedTicket.patient.allergies.join(", ")}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient?.id || selectedTicket.patient_id} />
                <Button variant="outline" size="sm" className="h-8" onClick={() => setSendOpen(true)}><Send className="h-4 w-4 mr-1" /> Send to…</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {lookingUpRx ? (
              <p className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Looking for this patient's prescription…</p>
            ) : (
              <div className="py-8 text-center space-y-3">
                <Pill className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-medium">No prescription has been sent for this patient yet</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  They were sent to the pharmacy without a prescription (for example from triage). Enter the drugs from their prescription paper, or send them to the right department.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Button className="h-11 px-6" onClick={() => setAddRxOpen(true)}><Plus className="h-4 w-4 mr-2" /> Enter prescription</Button>
                  <Button variant="outline" className="h-11" onClick={() => setSendOpen(true)}><Send className="h-4 w-4 mr-2" /> Send to…</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {lowStockItems.length > 0 && (
            <Card className="border-orange-300">
              <CardContent className="py-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                <p className="text-sm"><strong>{lowStockItems.length} item(s)</strong> below reorder level: {lowStockItems.slice(0, 5).map((i) => i.drug_name).join(", ")}{lowStockItems.length > 5 ? "…" : ""}</p>
              </CardContent>
            </Card>
          )}

          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="prescriptions">Prescriptions ({visibleSheets.length})</TabsTrigger>
                <TabsTrigger value="inventory">Inventory ({inventory.length})</TabsTrigger>
                <TabsTrigger value="stockcard">Stock card</TabsTrigger>
                <TabsTrigger value="replenishment">Restock requests</TabsTrigger>
              </TabsList>
              <div className="flex gap-2 items-center w-full sm:w-auto">
                {tab === "prescriptions" ? (
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search patient or drug…" value={rxSearch} onChange={(e) => setRxSearch(e.target.value)} className="pl-9 h-11" />
                  </div>
                ) : (
                  <>
                    <div className="relative flex-1 sm:w-56">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search drugs…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11" />
                    </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!canEditInventory}><Plus className="h-4 w-4" /> Add Drug</Button>
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

                  </>
                )}
              </div>
            </div>

            <TabsContent value="prescriptions" className="space-y-2">
              {olderSheets.length > 0 && (
                <button type="button" onClick={() => setShowOlderRx((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  {showOlderRx ? "Hide" : "Show"} {olderSheets.length} older prescription{olderSheets.length > 1 ? "s" : ""} not collected on previous days
                </button>
              )}
              {visibleSheets.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No prescriptions waiting</CardContent></Card>
              ) : (
                <div className="grid gap-2 xl:grid-cols-2">
                  {visibleSheets.map((s) => (
                    <button key={s.key} type="button" onClick={() => setOpenKey(s.key)} className="w-full text-left p-3 border rounded-lg hover:bg-muted/40 transition-colors space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{s.patient?.profile?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{s.patient?.patient_id} · {s.items.length} item(s) · {paymentModeLabel(s.ticket?.payment_mode)}</p>
                        </div>
                        <Badge variant="outline" className={STAGE_INFO[s.stage].cls}>{STAGE_INFO[s.stage].label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{s.items.map((i) => i.medication_name).join(" · ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="replenishment">
              <ReplenishmentRequests refreshKey={replenishKey} onStockChanged={fetchInventory} />
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
                        <TableCell>{[item.formulation, item.strength_size].filter(Boolean).join(" · ") || "-"}</TableCell>
                        <TableCell>{item.package || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.quantity <= (item.reorder_level || 50) ? "destructive" : "outline"}>
                            {item.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell>KES {item.unit_price}</TableCell>
                        <TableCell>{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="flex gap-2">
                          {canEditInventory && <Button size="sm" variant="outline" onClick={() => setEditItem(item)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>}
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
        </>
      )}

      <InventoryEditDialog item={editItem} onClose={() => setEditItem(null)} onSaved={fetchInventory} />

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

      <SendToDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        ticket={sheet?.ticketId ? { id: sheet.ticketId, patientName: sheet.patient?.profile?.full_name } : selectedTicket ? { id: selectedTicket.id, patientName: selectedTicket.patient?.profile?.full_name } : null}
        from="Pharmacy"
        exclude={["pharmacy"]}
        recommended="billing"
        onSent={() => { setSelectedTicket(null); setOpenKey(null); void fetchPrescriptions(); }}
      />

      <DirectOrderDialog
        open={addRxOpen}
        onOpenChange={setAddRxOpen}
        mode="pharmacy"
        source="pharmacy"
        ticket={selectedTicket ? { id: selectedTicket.id, patient_id: selectedTicket.patient?.id || selectedTicket.patient_id, department_id: selectedTicket.department_id, patientName: selectedTicket.patient?.profile?.full_name } : null}
        onDone={() => void fetchPrescriptions()}
      />
    </StationShell>
  );
};

export default Pharmacy;
