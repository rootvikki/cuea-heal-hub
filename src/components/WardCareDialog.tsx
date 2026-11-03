import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, NotebookPen, Syringe } from "lucide-react";
import { NursingProcedures, PROCEDURE_OPTIONS, type SelectedProcedure } from "@/components/NursingProcedures";
import { Pager, usePaged } from "@/components/Pager";
import { WARD_NOTE_TYPES, WARD_SHIFTS, noteTypeLabel, shiftFor, shiftLabel } from "@/lib/wardCare";
import { formatKES } from "@/lib/pricing";
import { logAuditEvent } from "@/lib/auditLog";

export interface WardAdmission {
  id: string;
  patient_id: string;
  encounter_id?: string | null;
  patientName: string;
  patientNumber?: string;
  place?: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

/** Ward nursing record for one admission: shift notes and procedures done on the ward. */
export function WardCareDialog({ admission, open, onOpenChange, defaultTab = "notes" }: {
  admission: WardAdmission | null; open: boolean; onOpenChange: (o: boolean) => void; defaultTab?: "notes" | "procedures";
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState(defaultTab);
  const [notes, setNotes] = useState<any[]>([]);
  const [procs, setProcs] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [noteType, setNoteType] = useState<string>("progress");
  const [shift, setShift] = useState<string>(shiftFor());
  const [content, setContent] = useState("");
  const [vitalsTaken, setVitalsTaken] = useState(false);
  const [newProcs, setNewProcs] = useState<SelectedProcedure[]>([]);

  const notesPager = usePaged(notes, { size: 10, resetKey: admission?.id });
  const procsPager = usePaged(procs, { size: 10, resetKey: admission?.id });

  const load = async () => {
    if (!admission) return;
    setLoading(true);
    const [n, p, enc] = await Promise.all([
      supabase.from("nursing_notes").select("*").eq("admission_id", admission.id).order("created_at", { ascending: false }),
      supabase.from("nursing_procedures").select("*").eq("admission_id", admission.id).order("created_at", { ascending: false }),
      admission.encounter_id
        ? supabase.from("encounters").select("ticket_id").eq("id", admission.encounter_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);
    const noteRows = n.data || [], procRows = p.data || [];
    setNotes(noteRows); setProcs(procRows);
    setTicketId(enc.data?.ticket_id ?? null);
    // Writers are stored by sign-in id; older rows may hold a staff id — resolve both.
    const ids = [...new Set([...noteRows, ...procRows].map((r: any) => r.nurse_id).filter(Boolean))];
    if (ids.length) {
      const { data: staff } = await supabase.from("staff").select("id, user_id").in("id", ids);
      const userIds = [...new Set([...ids, ...(staff || []).map((s) => s.user_id)])];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const byUser = Object.fromEntries((profs || []).map((pr) => [pr.user_id, pr.full_name]));
      const map: Record<string, string> = { ...byUser };
      (staff || []).forEach((s) => { if (byUser[s.user_id]) map[s.id] = byUser[s.user_id]; });
      setNames(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open || !admission) return;
    setTab(defaultTab); setContent(""); setNewProcs([]); setVitalsTaken(false); setNoteType("progress"); setShift(shiftFor());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, admission?.id]);

  const saveNote = async () => {
    if (!admission || !content.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("nursing_notes").insert({
      admission_id: admission.id, patient_id: admission.patient_id, nurse_id: user!.id,
      note_type: noteType, shift, content: content.trim(), vitals_recorded: vitalsTaken,
    });
    setSaving(false);
    if (error) { toast({ title: "Note not saved", description: error.message, variant: "destructive" }); return; }
    logAuditEvent({ action: "ward_note_added", module: "inpatient", details: { admission_id: admission.id, note_type: noteType } });
    toast({ title: "Note saved" });
    setContent(""); setVitalsTaken(false);
    load();
  };

  const saveProcedures = async () => {
    if (!admission || newProcs.length === 0) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("nursing_procedures").insert(newProcs.map((p) => ({
        admission_id: admission.id, patient_id: admission.patient_id, encounter_id: admission.encounter_id ?? null,
        ticket_id: ticketId, nurse_id: user!.id, procedure_type: p.type, notes: p.notes || null, price: p.price,
      })));
      if (error) throw error;
      const { error: chErr } = await supabase.from("service_charges").insert(newProcs.map((p) => ({
        patient_id: admission.patient_id, encounter_id: admission.encounter_id ?? null, ticket_id: ticketId,
        service_type: "nursing_procedure", description: `Ward: ${p.label}`, amount: p.price, billing_stage: "inpatient",
      })));
      if (chErr) throw chErr;
      logAuditEvent({ action: "ward_procedures_recorded", module: "inpatient", details: { admission_id: admission.id, count: newProcs.length } });
      toast({ title: "Procedures recorded", description: `${newProcs.length} added to the patient's bill.` });
      setNewProcs([]);
      load();
    } catch (e: any) {
      toast({ title: "Procedures not saved", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const procLabel = (t: string) => PROCEDURE_OPTIONS.find((o) => o.value === t)?.label ?? t.replace(/_/g, " ");
  const procTotal = useMemo(() => procs.reduce((s, p) => s + Number(p.price || 0), 0), [procs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ward care — {admission?.patientName}</DialogTitle>
          <DialogDescription>{[admission?.patientNumber, admission?.place].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="notes"><NotebookPen className="h-4 w-4 mr-1" /> Nursing notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="procedures"><Syringe className="h-4 w-4 mr-1" /> Procedures done ({procs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="space-y-5">
            <div className="rounded-lg border p-4 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2"><Label>Type of note</Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{WARD_NOTE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="space-y-2"><Label>Shift</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{WARD_SHIFTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Note *</Label>
                <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)}
                  placeholder="Condition, observations, medication given, care provided, plan for next shift..." /></div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={vitalsTaken} onCheckedChange={(c) => setVitalsTaken(!!c)} /> Vitals taken this round
                </label>
                <Button onClick={saveNote} disabled={!content.trim() || saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save note
                </Button>
              </div>
            </div>

            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No ward notes yet.</p>
            ) : (
              <div className="space-y-2">
                {notesPager.pageItems.map((n) => (
                  <div key={n.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">{noteTypeLabel(n.note_type)}</Badge>
                      {n.shift && <Badge variant="outline">{shiftLabel(n.shift)}</Badge>}
                      {n.vitals_recorded && <Badge variant="outline">Vitals taken</Badge>}
                      <span className="text-muted-foreground ml-auto">{fmt(n.created_at)} · {names[n.nurse_id] || "Staff"}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
                <Pager pager={notesPager} label="notes" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="procedures" className="space-y-5">
            <div className="rounded-lg border p-4 space-y-4">
              <NursingProcedures procedures={newProcs} onChange={setNewProcs} />
              {!ticketId && newProcs.length > 0 && (
                <p className="text-sm text-muted-foreground">This admission isn't linked to a clinic visit, so the charge will need to be added at Billing.</p>
              )}
              <div className="flex justify-end">
                <Button onClick={saveProcedures} disabled={newProcs.length === 0 || saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record {newProcs.length || ""} procedure{newProcs.length === 1 ? "" : "s"} done
                </Button>
              </div>
            </div>

            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : procs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No procedures recorded on the ward yet.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Done on this admission</span><b>Total {formatKES(procTotal)}</b></div>
                {procsPager.pageItems.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-start gap-2 rounded-lg border p-3 text-sm">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-medium">{procLabel(p.procedure_type)}</p>
                      {p.notes && <p className="text-muted-foreground">{p.notes}</p>}
                    </div>
                    <Badge variant="outline">{formatKES(p.price)}</Badge>
                    <span className="text-muted-foreground w-full sm:w-auto">{fmt(p.created_at)} · {names[p.nurse_id] || "Staff"}</span>
                  </div>
                ))}
                <Pager pager={procsPager} label="procedures" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
