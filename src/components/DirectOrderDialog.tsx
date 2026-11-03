import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, Pill, Plus, X, Loader2, Search } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";
import { FORMULATIONS, FREQUENCIES, formatRx } from "@/lib/rxFormat";
import { priceFor, paymentModeLabel, formatKES } from "@/lib/pricing";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "lab" | "pharmacy";
  ticket: { id: string; patient_id: string; department_id: string; patientName?: string } | null;
  source: "reception" | "triage" | "dental";
  onDone?: () => void;
}

interface RxLine { formulation: string; medication_name: string; strength: string; frequency: string; duration: string; quantity: number }
const emptyRx: RxLine = { formulation: "Tabs", medication_name: "", strength: "", frequency: "BD", duration: "5 days", quantity: 1 };

/**
 * Lets reception / triage send a patient straight to the lab or pharmacy
 * (e.g. a patient who brings results or a prescription from a referral facility).
 * All tests are saved as ONE request on the patient's visit.
 */
export function DirectOrderDialog({ open, onOpenChange, mode, ticket, source, onDone }: Props) {
  const { toast } = useToast();
  const [tests, setTests] = useState<{ id: string; test_name: string; price: number; insurance_price?: number | null; category?: string | null }[]>([]);
  const [inventory, setInventory] = useState<{ id: string; drug_name: string; strength_size: string | null; formulation: string | null; quantity: number }[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [rxLines, setRxLines] = useState<RxLine[]>([]);
  const [rx, setRx] = useState<RxLine>(emptyRx);
  const [facility, setFacility] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("mpesa_school_fees");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedTests([]); setRxLines([]); setRx(emptyRx); setSearch(""); setFacility(""); setPrescriber("");
    if (ticket) {
      supabase.from("tickets").select("payment_mode").eq("id", ticket.id).maybeSingle()
        .then(({ data }) => setPaymentMode((data as any)?.payment_mode || "mpesa_school_fees"));
    }
    if (mode === "lab") {
      supabase.from("lab_tests_catalog").select("*").order("test_name").then(({ data }) => setTests((data as any[]) || []));
    } else {
      supabase.from("pharmacy_inventory").select("id, drug_name, strength_size, formulation, quantity").order("drug_name").then(({ data }) => setInventory(data || []));
    }
  }, [open, mode, ticket]);

  const filtered = useMemo(
    () => tests.filter(t => `${t.test_name} ${t.category ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [tests, search],
  );
  const drugMatches = useMemo(() => {
    const q = rx.medication_name.trim().toLowerCase();
    if (q.length < 2) return [];
    return inventory.filter(i => i.drug_name.toLowerCase().includes(q)).slice(0, 6);
  }, [inventory, rx.medication_name]);

  const selectedTotal = selectedTests.reduce((s, id) => s + priceFor(tests.find(t => t.id === id), paymentMode), 0);

  const submit = async () => {
    if (!ticket) return;
    // A drug typed but not yet added is included automatically
    const lines = rx.medication_name.trim() ? [...rxLines, rx] : rxLines;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle();
      const staffId = staff?.id ?? null;
      const origin = [facility && `from ${facility}`, prescriber && `by ${prescriber}`].filter(Boolean).join(" ");

      // One visit record per ticket — every direct request joins it
      let { data: enc } = await supabase.from("encounters").select("id").eq("ticket_id", ticket.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!enc) {
        const { data: created, error } = await supabase.from("encounters").insert({
          patient_id: ticket.patient_id, ticket_id: ticket.id, department_id: ticket.department_id,
          encounter_type: source === "dental" ? "dental" : `direct_${mode}`,
          chief_complaint: `Direct ${mode === "lab" ? "lab" : "pharmacy"} request from ${source}${origin ? ` (${origin})` : ""}`,
        }).select("id").single();
        if (error) throw new Error(`Visit record could not be created: ${error.message}`);
        enc = created;
      }
      const encounterId = enc!.id;

      if (mode === "lab") {
        const { error } = await supabase.from("lab_orders").insert(selectedTests.map(test_id => ({
          encounter_id: encounterId, patient_id: ticket.patient_id, doctor_id: staffId, test_id, status: "pending",
        })));
        if (error) throw new Error(error.message);
        const chosen = selectedTests.map(id => tests.find(t => t.id === id)!);
        await supabase.from("service_charges").insert({
          patient_id: ticket.patient_id, encounter_id: encounterId, ticket_id: ticket.id,
          service_type: "laboratory",
          description: `Lab request: ${chosen.map(t => t.test_name).join(", ")}`,
          amount: chosen.reduce((s, t) => s + priceFor(t, paymentMode), 0),
          billing_stage: "laboratory",
        });
      } else {
        const { error } = await supabase.from("prescriptions").insert(lines.map(l => ({
          encounter_id: encounterId, patient_id: ticket.patient_id, doctor_id: staffId,
          medication_name: l.medication_name, formulation: l.formulation, strength: l.strength,
          dosage: l.strength || l.formulation, frequency: l.frequency, duration: l.duration, quantity: l.quantity,
          instructions: origin ? `External prescription ${origin}` : null,
          status: "sent",
        })));
        if (error) throw new Error(error.message);
      }

      const stage = mode === "lab" ? "at_lab" : "at_pharmacy";
      const { error: tErr } = await supabase.from("tickets").update({ status: stage, workflow_stage: stage, assigned_to: null, claimed_at: null }).eq("id", ticket.id);
      if (tErr) throw new Error(tErr.message);

      const count = mode === "lab" ? selectedTests.length : lines.length;
      logAuditEvent({ action: `direct_${mode}_request`, module: source, details: { ticket_id: ticket.id, encounter_id: encounterId, count, origin } });
      await notifyRoles([mode === "lab" ? "lab_technician" : "pharmacist"], {
        title: mode === "lab" ? "New lab request" : "New prescription",
        message: `${ticket.patientName || "A patient"}: ${count} ${mode === "lab" ? "test(s)" : "item(s)"} sent from ${source}.`,
        category: mode === "lab" ? "lab" : "pharmacy",
        referenceId: ticket.id,
        link: mode === "lab" ? "/laboratory" : "/pharmacy",
      });
      toast({ title: mode === "lab" ? "Sent to Laboratory" : "Sent to Pharmacy", description: `${ticket.patientName || "Patient"} — one request with ${count} ${mode === "lab" ? "test(s)" : "item(s)"}.` });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "Could not send", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = mode === "lab" ? selectedTests.length > 0 : rxLines.length > 0 || !!rx.medication_name.trim();

  const addRxLine = () => {
    if (!rx.medication_name.trim()) return;
    setRxLines([...rxLines, rx]);
    setRx(emptyRx);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "lab" ? <FlaskConical className="h-5 w-5" /> : <Pill className="h-5 w-5" />}
            Send directly to {mode === "lab" ? "Laboratory" : "Pharmacy"}
          </DialogTitle>
          <DialogDescription>
            {ticket?.patientName} · <Badge variant="outline" className="text-[10px]">{paymentModeLabel(paymentMode)}</Badge> · skips triage and the doctor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Referring facility (optional)</Label>
            <Input className="h-11" value={facility} onChange={e => setFacility(e.target.value)} placeholder="e.g. Karen Hospital" />
          </div>
          <div className="space-y-1">
            <Label>Prescriber / doctor (optional)</Label>
            <Input className="h-11" value={prescriber} onChange={e => setPrescriber(e.target.value)} placeholder="e.g. Dr. Wanjiku" />
          </div>
        </div>

        {mode === "lab" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tests…" value={search} onChange={e => setSearch(e.target.value)} className="h-12 pl-9" />
            </div>
            <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
              {filtered.map(t => (
                <label key={t.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedTests.includes(t.id)} onCheckedChange={c => setSelectedTests(p => c ? [...p, t.id] : p.filter(x => x !== t.id))} />
                  <span className="flex-1 text-sm">{t.test_name}</span>
                  <Badge variant="outline">{formatKES(priceFor(t, paymentMode))}</Badge>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{selectedTests.length} test(s) — sent as one request</span>
              <span>{formatKES(selectedTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Formulation</Label>
                <Select value={rx.formulation} onValueChange={v => setRx({ ...rx, formulation: v })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMULATIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1 col-span-1 md:col-span-2 relative"><Label>Drug</Label>
                <Input className="h-12" value={rx.medication_name} onChange={e => setRx({ ...rx, medication_name: e.target.value })} placeholder="Type to search stock, e.g. Paracetamol" />
                {drugMatches.length > 0 && !drugMatches.some(d => d.drug_name === rx.medication_name) && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 border rounded-lg bg-popover shadow-md divide-y">
                    {drugMatches.map(d => (
                      <button key={d.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                        onClick={() => setRx({ ...rx, medication_name: d.drug_name, strength: d.strength_size || rx.strength, formulation: d.formulation || rx.formulation })}>
                        <span>{d.drug_name} {d.strength_size && <span className="text-muted-foreground">{d.strength_size}</span>}</span>
                        <span className={d.quantity > 0 ? "text-muted-foreground" : "text-destructive"}>{d.quantity > 0 ? `${d.quantity} in stock` : "Out of stock"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1"><Label>Strength</Label>
                <Input className="h-12" value={rx.strength} onChange={e => setRx({ ...rx, strength: e.target.value })} placeholder="e.g. 500mg" /></div>
              <div className="space-y-1"><Label>Frequency</Label>
                <Select value={rx.frequency} onValueChange={v => setRx({ ...rx, frequency: v })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Duration</Label>
                <Input className="h-12" value={rx.duration} onChange={e => setRx({ ...rx, duration: e.target.value })} /></div>
              <div className="space-y-1"><Label>Quantity</Label>
                <Input className="h-12" type="number" min={1} value={rx.quantity} onChange={e => setRx({ ...rx, quantity: parseInt(e.target.value) || 1 })} /></div>
            </div>
            <Button type="button" variant="outline" disabled={!rx.medication_name.trim()} onClick={addRxLine}>
              <Plus className="h-4 w-4 mr-1" /> Add drug
            </Button>
            {rxLines.map((l, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                <span>{formatRx(l)} <span className="text-muted-foreground">· Qty {l.quantity}</span></span>
                <Button variant="ghost" size="sm" onClick={() => setRxLines(rxLines.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send to {mode === "lab" ? "Laboratory" : "Pharmacy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
