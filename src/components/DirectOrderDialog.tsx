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
import { FlaskConical, Pill, Plus, X, Loader2 } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";
import { FORMULATIONS, FREQUENCIES, formatRx } from "@/lib/rxFormat";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "lab" | "pharmacy";
  ticket: { id: string; patient_id: string; department_id: string; patientName?: string } | null;
  source: "reception" | "triage";
  onDone?: () => void;
}

interface RxLine { formulation: string; medication_name: string; strength: string; frequency: string; duration: string; quantity: number }
const emptyRx: RxLine = { formulation: "Tabs", medication_name: "", strength: "", frequency: "BD", duration: "5 days", quantity: 1 };

/** Lets reception / triage send a patient straight to the lab or pharmacy. */
export function DirectOrderDialog({ open, onOpenChange, mode, ticket, source, onDone }: Props) {
  const { toast } = useToast();
  const [tests, setTests] = useState<{ id: string; test_name: string; price: number }[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [rxLines, setRxLines] = useState<RxLine[]>([]);
  const [rx, setRx] = useState<RxLine>(emptyRx);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedTests([]); setRxLines([]); setRx(emptyRx); setSearch("");
    if (mode === "lab") {
      supabase.from("lab_tests_catalog").select("id, test_name, price").order("test_name").then(({ data }) => setTests(data || []));
    }
  }, [open, mode]);

  const filtered = useMemo(() => tests.filter(t => t.test_name.toLowerCase().includes(search.toLowerCase())), [tests, search]);

  const submit = async () => {
    if (!ticket) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle();
      const staffId = staff?.id ?? null;

      let { data: enc } = await supabase.from("encounters").select("id").eq("ticket_id", ticket.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!enc) {
        const { data: created, error } = await supabase.from("encounters").insert({
          patient_id: ticket.patient_id, ticket_id: ticket.id, department_id: ticket.department_id,
          encounter_type: `direct_${mode}`, chief_complaint: `Direct ${mode === "lab" ? "lab" : "pharmacy"} request from ${source}`,
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
        const charges = selectedTests.map(id => tests.find(t => t.id === id)!).map(t => ({
          patient_id: ticket.patient_id, encounter_id: encounterId, ticket_id: ticket.id,
          service_type: "laboratory", description: `Lab: ${t.test_name}`, amount: t.price, billing_stage: "laboratory",
        }));
        await supabase.from("service_charges").insert(charges);
      } else {
        const { error } = await supabase.from("prescriptions").insert(rxLines.map(l => ({
          encounter_id: encounterId, patient_id: ticket.patient_id, doctor_id: staffId,
          medication_name: l.medication_name, formulation: l.formulation, strength: l.strength,
          dosage: l.strength || l.formulation, frequency: l.frequency, duration: l.duration, quantity: l.quantity,
          status: "sent",
        })));
        if (error) throw new Error(error.message);
      }

      const stage = mode === "lab" ? "at_lab" : "at_pharmacy";
      const { error: tErr } = await supabase.from("tickets").update({ status: stage, workflow_stage: stage }).eq("id", ticket.id);
      if (tErr) throw new Error(tErr.message);

      const count = mode === "lab" ? selectedTests.length : rxLines.length;
      logAuditEvent({ action: `direct_${mode}_request`, module: source, details: { ticket_id: ticket.id, encounter_id: encounterId, count } });
      await notifyRoles([mode === "lab" ? "lab_technician" : "pharmacist"], {
        title: mode === "lab" ? "Direct lab request" : "Direct pharmacy request",
        message: `${count} item(s) for ${ticket.patientName || "a patient"} sent from ${source}.`,
        category: mode === "lab" ? "lab" : "pharmacy",
        link: mode === "lab" ? "/laboratory" : "/pharmacy",
      });
      toast({ title: mode === "lab" ? "Sent to Laboratory" : "Sent to Pharmacy", description: `${count} item(s) sent.` });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "Could not send", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = mode === "lab" ? selectedTests.length > 0 : rxLines.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "lab" ? <FlaskConical className="h-5 w-5" /> : <Pill className="h-5 w-5" />}
            Send directly to {mode === "lab" ? "Laboratory" : "Pharmacy"}
          </DialogTitle>
          <DialogDescription>{ticket?.patientName} — skips the doctor for this request.</DialogDescription>
        </DialogHeader>

        {mode === "lab" ? (
          <div className="space-y-3">
            <Input placeholder="Search tests..." value={search} onChange={e => setSearch(e.target.value)} className="h-12" />
            <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
              {filtered.map(t => (
                <label key={t.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selectedTests.includes(t.id)} onCheckedChange={c => setSelectedTests(p => c ? [...p, t.id] : p.filter(x => x !== t.id))} />
                  <span className="flex-1 text-sm">{t.test_name}</span>
                  <Badge variant="outline">KES {t.price}</Badge>
                </label>
              ))}
            </div>
            <p className="text-sm font-medium">{selectedTests.length} test(s) selected</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Formulation</Label>
                <Select value={rx.formulation} onValueChange={v => setRx({ ...rx, formulation: v })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMULATIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1 col-span-1 md:col-span-2"><Label>Drug</Label>
                <Input className="h-12" value={rx.medication_name} onChange={e => setRx({ ...rx, medication_name: e.target.value })} placeholder="e.g. Paracetamol" /></div>
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
            <Button type="button" variant="outline" disabled={!rx.medication_name} onClick={() => { setRxLines([...rxLines, rx]); setRx(emptyRx); }}>
              <Plus className="h-4 w-4 mr-1" /> Add drug
            </Button>
            {rxLines.map((l, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                <span>{formatRx(l)} <span className="text-muted-foreground">· Qty {l.quantity}</span></span>
                <Button variant="ghost" size="sm" onClick={() => setRxLines(rxLines.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send to {mode === "lab" ? "Laboratory" : "Pharmacy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
