import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BedDouble, FlaskConical, Loader2, Plus, Stethoscope, CheckCircle2, Printer } from "lucide-react";
import { LabResultsTable, groupByVisit } from "@/components/LabResultsTable";
import { printVisitLabReport } from "@/lib/labReport";
import { serviceFee } from "@/lib/pricing";
import { PROCEDURE_OPTIONS } from "@/components/NursingProcedures";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";

const getStaffId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle();
  return { userId: user!.id, staffId: data?.id ?? null };
};

// ─── Admit patient ───────────────────────────────────────────────
export function AdmitPatientDialog({ open, onOpenChange, patientId, encounterId, ticketId, patientName }: {
  open: boolean; onOpenChange: (o: boolean) => void; patientId: string; encounterId: string | null; ticketId: string; patientName: string;
}) {
  const { toast } = useToast();
  const [beds, setBeds] = useState<any[]>([]);
  const [bedId, setBedId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("beds").select("id, bed_number, status, ward:wards(name)").eq("status", "available").then(({ data }) => setBeds(data || []));
  }, [open]);

  const admit = async () => {
    setSaving(true);
    try {
      const { userId, staffId } = await getStaffId();
      const { data, error } = await supabase.from("admissions").insert({
        patient_id: patientId, encounter_id: encounterId, bed_id: bedId || null, admission_type: "emergency_opd",
        admitted_by: userId, attending_doctor_id: staffId, diagnosis_on_admission: reason ? [reason] : null,
        notes, status: "admitted",
      }).select("id").single();
      if (error) throw error;
      if (bedId) await supabase.from("beds").update({ status: "occupied", current_patient_id: patientId, current_admission_id: data.id }).eq("id", bedId);
      await supabase.from("service_charges").insert({ patient_id: patientId, encounter_id: encounterId, ticket_id: ticketId, service_type: "admission", description: "Admission", amount: serviceFee("admission"), billing_stage: "inpatient" });
      logAuditEvent({ action: "patient_admitted", module: "consultation", details: { admission_id: data.id, patient_id: patientId } });
      await notifyRoles(["nurse", "ward_manager"], { title: "New admission", message: `${patientName} has been admitted.`, category: "inpatient", link: "/inpatient" });
      toast({ title: "Patient admitted", description: "The patient now appears on the Inpatient page." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Admission failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5" /> Admit Patient</DialogTitle>
          <DialogDescription>{patientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2"><Label>Reason for admission *</Label>
            <Input className="h-12" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Severe dehydration" /></div>
          <div className="space-y-2"><Label>Ward / Bed</Label>
            <Select value={bedId} onValueChange={setBedId}>
              <SelectTrigger className="h-12"><SelectValue placeholder={beds.length ? "Select an available bed" : "No free beds — assign later"} /></SelectTrigger>
              <SelectContent>{beds.map(b => <SelectItem key={b.id} value={b.id}>{b.ward?.name} · Bed {b.bed_number}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={admit} disabled={!reason || saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Admit</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doctor orders nursing procedures ────────────────────────────
export function ProcedureOrderPanel({ patientId, ticketId, encounterId, patientName }: { patientId: string; ticketId: string; encounterId: string | null; patientName: string }) {
  const { toast } = useToast();
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState<any[]>([]);

  const load = () => supabase.from("procedure_orders").select("*").eq("ticket_id", ticketId).order("created_at").then(({ data }) => setOrders(data || []));
  useEffect(() => { load(); }, [ticketId]);

  const order = async () => {
    const opt = PROCEDURE_OPTIONS.find(p => p.value === type);
    if (!opt) return;
    const { userId } = await getStaffId();
    const { error } = await supabase.from("procedure_orders").insert({
      patient_id: patientId, ticket_id: ticketId, encounter_id: encounterId, procedure_type: opt.value, procedure_label: opt.label, price: opt.price, notes, ordered_by: userId,
    });
    if (error) { toast({ title: "Could not order", description: error.message, variant: "destructive" }); return; }
    logAuditEvent({ action: "procedure_ordered", module: "consultation", details: { ticket_id: ticketId, procedure: opt.value } });
    await notifyRoles(["nurse"], { title: "Procedure to perform", message: `${opt.label} for ${patientName}.`, category: "nursing", link: "/vitals" });
    setType(""); setNotes(""); load();
    toast({ title: "Procedure ordered", description: "Nurses will see it under Procedures to perform." });
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="px-4 pt-4 pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Order Nursing Procedures</CardTitle></CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-12 flex-1"><SelectValue placeholder="Select procedure..." /></SelectTrigger>
            <SelectContent>{PROCEDURE_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label} — KES {p.price}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-12 flex-1" placeholder="Instructions for the nurse" value={notes} onChange={e => setNotes(e.target.value)} />
          <Button className="h-12" onClick={order} disabled={!type}><Plus className="h-4 w-4 mr-1" /> Order</Button>
        </div>
        {orders.map(o => (
          <div key={o.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
            <span>{o.procedure_label}{o.notes ? ` — ${o.notes}` : ""}</span>
            <Badge variant={o.status === "done" ? "default" : "outline"}>{o.status === "done" ? "Done" : "Ordered"}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Nurse view: procedures to perform ───────────────────────────
export function ProceduresToPerform({ ticketId }: { ticketId?: string }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const load = () => {
    let q = supabase.from("procedure_orders").select("*, patient:patients(patient_id, profile:profiles(full_name))").eq("status", "ordered").order("created_at");
    if (ticketId) q = q.eq("ticket_id", ticketId);
    q.then(({ data }) => setOrders(data || []));
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`proc-orders-${ticketId ?? "all"}`).on("postgres_changes", { event: "*", schema: "public", table: "procedure_orders" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticketId]);

  const markDone = async (o: any) => {
    const { userId, staffId } = await getStaffId();
    const { error } = await supabase.from("procedure_orders").update({ status: "done", performed_by: userId, performed_at: new Date().toISOString() }).eq("id", o.id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    if (staffId) await supabase.from("nursing_procedures").insert({ patient_id: o.patient_id, ticket_id: o.ticket_id, encounter_id: o.encounter_id, nurse_id: staffId, procedure_type: o.procedure_type, notes: o.notes, price: o.price });
    await supabase.from("service_charges").insert({ patient_id: o.patient_id, ticket_id: o.ticket_id, encounter_id: o.encounter_id, service_type: "nursing", description: `Procedure: ${o.procedure_label}`, amount: o.price, billing_stage: "nursing" });
    logAuditEvent({ action: "procedure_performed", module: "nursing", details: { order_id: o.id } });
    toast({ title: "Procedure recorded", description: "Added to the patient's bill." });
    load();
  };

  if (orders.length === 0) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Procedures to perform ({orders.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {orders.map(o => (
          <div key={o.id} className="flex items-center justify-between p-3 border rounded-lg text-sm gap-3">
            <div>
              <p className="font-medium">{o.procedure_label}</p>
              <p className="text-xs text-muted-foreground">{o.patient?.profile?.full_name} · {o.patient?.patient_id}{o.notes ? ` · ${o.notes}` : ""}</p>
            </div>
            <Button size="sm" onClick={() => markDone(o)}><CheckCircle2 className="h-4 w-4 mr-1" /> Mark done</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Lab results tab (current + past) ────────────────────────────
export function LabResultsTab({ patientId, patient }: { patientId: string; patient?: { full_name?: string | null; patient_id?: string | null; gender?: string | null; date_of_birth?: string | null } }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    supabase.from("lab_orders")
      .select("id, status, created_at, completed_at, result_entered_at, result_value, result_notes, flag, encounter_id, test:lab_tests_catalog(test_name, unit, normal_range), fields:lab_result_fields(field_name, field_value, unit, reference_range, flag, sort_order)")
      .eq("patient_id", patientId).order("created_at", { ascending: false }).limit(150)
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [patientId]);

  const visits = groupByVisit(orders);

  return (
    <Card className="border-border/60">
      <CardHeader className="px-4 pt-4 pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Lab results (this and past visits)</CardTitle></CardHeader>
      <CardContent className="px-4 pb-4 space-y-5">
        {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : orders.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">No lab tests on record</p> :
          visits.map((v, i) => (
            <div key={v.encounterId} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold">
                  {i === 0 ? "Latest visit" : "Visit"} · {new Date(v.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · {v.orders.length} test(s)
                </p>
                {v.orders.some((o) => o.status === "completed") && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => printVisitLabReport(patient || {}, v.orders)}>
                    <Printer className="h-3.5 w-3.5 mr-1" /> Print
                  </Button>
                )}
              </div>
              <LabResultsTable orders={v.orders} />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
