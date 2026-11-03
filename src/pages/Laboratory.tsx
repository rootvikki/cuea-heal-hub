import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StationQueue, StationShell } from "@/components/StationQueue";
import { TestTube, Search, Printer, CheckCircle2, PackageCheck, Save, Send, ArrowLeft, Clock, BarChart3, Loader2, Ban, RotateCcw, Siren } from "lucide-react";
import { printVisitLabReport } from "@/lib/labReport";
import {
  STRUCTURED_FIELDS, CANNED_COMMENTS, REJECTION_REASONS, PANEL_RESULT, fieldFlag, flagLabel, getFlag, isCriticalFlag, isPanelTest,
  missingAnswers, orderFlag, refRangeFor, resultCategory, summaryText, visibleFields, type LabFieldDef,
} from "@/lib/labFields";
import { LabFieldInput } from "@/components/LabFieldInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLiveTable } from "@/lib/liveUpdates";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";
import { LabResultsTable } from "@/components/LabResultsTable";
import { SendToDialog } from "@/components/SendToDialog";
import { LabReport } from "@/components/StationReports";
import { useUser } from "@/contexts/UserContext";
import { authUserIdForStaff, notifyRoles, notifyUser } from "@/lib/notifications";
import { currentStaffId, type StationKey } from "@/lib/stations";
import { calculateAgeYears, cn } from "@/lib/utils";
import { paymentModeLabel } from "@/lib/pricing";

/** One lab "request" = every test ordered on one visit for one patient. */
interface LabVisit {
  key: string;
  encounterIds: string[];
  ticketId: string | null;
  orders: any[];
  patient: any;
  createdAt: string;
  status: "new" | "received" | "done";
  origin: "doctor" | "dental" | "direct";
}

/** Still being worked on (not completed and not rejected). */
const isOpen = (o: any) => o.status !== "completed" && o.status !== "rejected";

const visitStatus = (orders: any[]): LabVisit["status"] =>
  orders.every((o) => !isOpen(o)) ? "done" : orders.some((o) => o.status !== "pending") ? "received" : "new";

/** Result template for an order. Older results typed as free text (no saved lines) keep showing that text. */
const defsFor = (o: any): LabFieldDef[] | null => {
  const defs = STRUCTURED_FIELDS[o.test?.test_name || ""];
  if (!defs) return null;
  if (o.status === "completed" && !(o.lab_result_fields || []).length) return null;
  return defs;
};

interface CriticalAlert { id: string; lab_order_id: string | null; title: string; acknowledged: boolean | null; acknowledged_by: string | null; acknowledged_at: string | null; acknowledged_note: string | null; ackName?: string }

const STATUS_BADGE: Record<LabVisit["status"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  received: { label: "In progress", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  done: { label: "Results ready", cls: "bg-green-100 text-green-800 border-green-300" },
};

type Draft = Record<string, { fields: Record<string, string>; value: string; notes: string }>;

const Laboratory = () => {
  const { hasAnyRole } = useUser();
  const canManageLab = hasAnyRole(["lab_technician", "admin", "super_admin"]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [openVisitKey, setOpenVisitKey] = useState<string | null>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<"receive" | "save" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [tab, setTab] = useState("requests");

  const fetchOrders = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("lab_orders")
      .select("*, encounters!inner(id, ticket_id, encounter_type, chief_complaint), patients!inner(id, patient_id, user_id, profiles!inner(full_name, gender, date_of_birth)), lab_tests_catalog!inner(test_name, test_code, normal_range, unit, category), lab_result_fields(*)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    setOrders((data || []).map((o: any) => ({
      ...o,
      test: o.lab_tests_catalog,
      patient: { id: o.patients?.id, patient_id: o.patients?.patient_id, user_id: o.patients?.user_id, profile: o.patients?.profiles },
      encounter: o.encounters,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders();
    const channel = supabase
      .channel("laboratory-lab-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => void fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  // Group every test of a visit into ONE request
  const visits = useMemo<LabVisit[]>(() => {
    const m = new Map<string, LabVisit>();
    for (const o of orders) {
      const key = o.encounter?.ticket_id || o.encounter_id;
      if (!m.has(key)) {
        m.set(key, { key, encounterIds: [], ticketId: o.encounter?.ticket_id ?? null, orders: [], patient: o.patient, createdAt: o.created_at, status: "new", origin: "doctor" });
      }
      const v = m.get(key)!;
      v.orders.push(o);
      if (!v.encounterIds.includes(o.encounter_id)) v.encounterIds.push(o.encounter_id);
      if (o.created_at < v.createdAt) v.createdAt = o.created_at;
      const type = o.encounter?.encounter_type || "";
      if (type === "dental" || /dental/i.test(o.encounter?.chief_complaint || "")) v.origin = "dental";
      else if (type.startsWith("direct_") && v.origin !== "dental") v.origin = "direct";
    }
    return [...m.values()].map((v) => ({ ...v, status: visitStatus(v.orders), orders: v.orders.sort((a, b) => (a.test?.test_name || "").localeCompare(b.test?.test_name || "")) }));
  }, [orders]);

  const openVisit = visits.find((v) => v.key === openVisitKey) || null;

  // Selecting from the queue opens that patient's request
  // Give the work area the full width while a patient is open
  useEffect(() => { setQueueCollapsed(!!openVisitKey); }, [openVisitKey]);

  useEffect(() => {
    if (selectedTicket) setOpenVisitKey(selectedTicket.id);
  }, [selectedTicket]);

  // Fill the entry form from what is already saved
  useEffect(() => {
    if (!openVisit) { setDraft({}); return; }
    const d: Draft = {};
    for (const o of openVisit.orders) {
      const saved: Record<string, string> = {};
      (o.lab_result_fields || []).forEach((f: any) => { saved[f.field_name] = f.field_value || ""; });
      const defs = defsFor(o);
      d[o.id] = {
        fields: defs ? Object.fromEntries(defs.map((f) => [f.name, saved[f.name] || ""])) : {},
        value: o.result_value && o.result_value !== PANEL_RESULT ? o.result_value : "",
        notes: o.result_notes || "",
      };
    }
    setDraft(d);
  }, [openVisitKey, openVisit?.orders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Critical-value alerts raised for the open request, with who acknowledged them
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const openOrderIds = openVisit?.orders.map((o) => o.id).join(",") || "";
  const loadAlerts = useCallback(async () => {
    if (!openOrderIds) { setAlerts([]); return; }
    const { data } = await supabase.from("critical_alerts")
      .select("id, lab_order_id, title, acknowledged, acknowledged_by, acknowledged_at, acknowledged_note")
      .in("lab_order_id", openOrderIds.split(",")).order("created_at", { ascending: false });
    const list = (data || []) as CriticalAlert[];
    const ids = [...new Set(list.map((a) => a.acknowledged_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      (profs || []).forEach((p) => names.set(p.user_id, p.full_name));
    }
    setAlerts(list.map((a) => ({ ...a, ackName: a.acknowledged_by ? names.get(a.acknowledged_by) : undefined })));
  }, [openOrderIds]);
  useEffect(() => { void loadAlerts(); }, [loadAlerts]);
  useLiveTable(["critical_alerts"], () => void loadAlerts());

  const s = searchTerm.toLowerCase();
  const match = (v: LabVisit) => !s || [v.patient?.profile?.full_name, v.patient?.patient_id, ...v.orders.map((o) => o.test?.test_name)].some((x) => x?.toLowerCase().includes(s));
  const pendingVisits = visits.filter((v) => v.status !== "done" && match(v));
  const doneVisits = visits.filter((v) => v.status === "done" && match(v));
  const today = new Date().toISOString().slice(0, 10);

  const notifyOrderers = async (visit: LabVisit, title: string, message: string) => {
    const doctorIds = [...new Set(visit.orders.map((o) => o.doctor_id).filter(Boolean))];
    for (const id of doctorIds) {
      const uid = await authUserIdForStaff(id);
      await notifyUser(uid, { title, message, category: "lab", referenceId: visit.orders[0]?.id, link: visit.origin === "dental" ? "/dental" : "/consultation" });
    }
    return doctorIds.length;
  };

  /** One click: sample received & collected & processing for every test in the request. */
  const receiveAll = async (visit: LabVisit) => {
    setBusy("receive");
    try {
      const staffId = await currentStaffId();
      const now = new Date().toISOString();
      const ids = visit.orders.filter((o) => ["pending", "received", "collected"].includes(o.status)).map((o) => o.id);
      if (ids.length) {
        const { error } = await supabase.from("lab_orders").update({
          status: "in_progress", received_at: now, received_by: staffId, sample_collected_at: now, collected_by: staffId, processing_started_at: now, processed_by: staffId,
        }).in("id", ids);
        if (error) throw error;
      }
      logAuditEvent({ action: "lab_request_received", module: "laboratory", details: { visit: visit.key, tests: ids.length } });
      toast.success("Sample received", { description: `${visit.orders.length} test(s) now in progress` });
      await fetchOrders();
    } catch (e) {
      toast.error("Could not update", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const hasEntry = (o: any) => {
    const d = draft[o.id];
    if (!d) return false;
    return !!d.value.trim() || Object.values(d.fields).some((v) => v.trim());
  };

  /** Alerts the doctor (and nurses) straight away about critical values; they must acknowledge. */
  const raiseCritical = async (visit: LabVisit, list: { order: any; text: string }[]) => {
    if (!list.length) return;
    const name = visit.patient?.profile?.full_name || "a patient";
    for (const c of list) {
      const { error } = await supabase.from("critical_alerts").insert({
        alert_type: "lab_critical", severity: "critical",
        title: `CRITICAL ${c.order.test?.test_name}: ${c.text}`,
        message: `${name} (${visit.patient?.patient_id || "—"}) — ${c.text}. Please act and acknowledge.`,
        patient_id: visit.patient?.id, reference_id: c.order.id, lab_order_id: c.order.id,
      });
      if (error) console.error("critical alert", error);
    }
    const summary = list.map((c) => c.text).join(", ");
    const title = `CRITICAL lab result — ${name}`;
    const sent = await notifyOrderers(visit, title, summary);
    await notifyRoles(sent ? ["nurse"] : ["doctor", "clinical_officer", "nurse"], { title, message: summary, category: "lab", link: "/consultation" });
    logAuditEvent({ action: "lab_critical_value", module: "laboratory", details: { visit: visit.key, values: list.map((c) => c.text) } });
    toast.error("Critical value — doctor alerted", { description: summary, duration: 10000 });
  };

  /** Saves every test whose answers are complete. Tests with missing answers are listed, not saved. */
  const saveResults = async (visit: LabVisit) => {
    const staffId = await currentStaffId();
    const now = new Date().toISOString();
    let abnormal = false;
    let critical = false;
    const savedIds = new Set<string>();
    const incomplete: string[] = [];
    const criticals: { order: any; text: string }[] = [];
    for (const o of visit.orders) {
      if (!isOpen(o) || !hasEntry(o)) continue;
      const d = draft[o.id];
      const testName = o.test?.test_name || "";
      const gender = o.patient?.profile?.gender;
      const age = calculateAgeYears(o.patient?.profile?.date_of_birth);
      const defs = defsFor(o);
      let flag: string | null = null;
      let resultValue = d.value.trim();
      if (defs) {
        const missing = missingAnswers(defs, d.fields);
        if (missing.length) { incomplete.push(`${testName}: ${missing.join(", ")}`); continue; }
        const rows = visibleFields(defs, d.fields)
          .filter((def) => (d.fields[def.name] || "").trim())
          .map((def) => {
            const value = d.fields[def.name].trim();
            const f = fieldFlag(def, value, gender, age);
            if (isCriticalFlag(f)) criticals.push({ order: o, text: `${def.name === "Result" ? testName : def.name} ${value}${def.unit ? ` ${def.unit}` : ""}` });
            return { lab_order_id: o.id, field_name: def.name, field_value: value, unit: def.unit || null, reference_range: refRangeFor(def, gender, age) || null, flag: f, sort_order: defs.indexOf(def) };
          });
        const { error: delErr } = await supabase.from("lab_result_fields").delete().eq("lab_order_id", o.id);
        if (delErr) throw delErr;
        const { error } = await supabase.from("lab_result_fields").insert(rows);
        if (error) throw error;
        flag = orderFlag(testName, rows.map((r) => r.flag), rows.map((r) => r.field_value));
        resultValue = isPanelTest(testName) ? PANEL_RESULT : summaryText(defs, d.fields);
      } else {
        const cat = resultCategory({ status: "completed", result_value: d.value });
        if (getFlag(d.value, o.test?.normal_range)) flag = "abnormal";
        else if (cat === "positive") flag = "positive";
        else if (cat === "negative") flag = "negative";
      }
      if (flag && flag !== "negative") abnormal = true;
      if (flag === "critical") critical = true;
      const { error } = await supabase.from("lab_orders").update({
        status: "completed", completed_at: now,
        received_at: o.received_at || now, sample_collected_at: o.sample_collected_at || now, processing_started_at: o.processing_started_at || now,
        result_value: resultValue,
        result_notes: d.notes.trim() || null, result_entered_by: staffId, result_entered_at: now, flag,
      }).eq("id", o.id);
      if (error) throw error;
      savedIds.add(o.id);
    }
    if (savedIds.size) logAuditEvent({ action: "lab_results_entered", module: "laboratory", details: { visit: visit.key, tests: savedIds.size } });
    await raiseCritical(visit, criticals);
    const remaining = visit.orders.filter((o) => isOpen(o) && !savedIds.has(o.id)).length;
    return { saved: savedIds.size, remaining, abnormal, critical, incomplete };
  };

  // Specimen rejection
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const rejectSample = async () => {
    if (!rejecting || !openVisit || !rejectReason) return;
    try {
      const staffId = await currentStaffId();
      const reason = rejectNote.trim() ? `${rejectReason} — ${rejectNote.trim()}` : rejectReason;
      const { error } = await supabase.from("lab_orders").update({ status: "rejected", rejection_reason: reason, rejected_at: new Date().toISOString(), rejected_by: staffId }).eq("id", rejecting.id);
      if (error) throw error;
      const name = openVisit.patient?.profile?.full_name || "a patient";
      await notifyOrderers(openVisit, "Lab sample rejected", `${rejecting.test?.test_name} for ${name}: ${reason}. A new sample is needed.`);
      logAuditEvent({ action: "lab_sample_rejected", module: "laboratory", details: { order: rejecting.id, test: rejecting.test?.test_name, reason } });
      toast.success("Sample rejected", { description: "The doctor has been told a new sample is needed." });
      setRejecting(null); setRejectReason(""); setRejectNote("");
      await fetchOrders();
    } catch (e) {
      toast.error("Could not reject", { description: e instanceof Error ? e.message : String(e) });
    }
  };
  const newSampleReceived = async (o: any) => {
    const staffId = await currentStaffId();
    const now = new Date().toISOString();
    const { error } = await supabase.from("lab_orders").update({
      status: "in_progress", rejection_reason: null, rejected_at: null, rejected_by: null,
      received_at: now, received_by: staffId, sample_collected_at: now, collected_by: staffId, processing_started_at: now, processed_by: staffId,
    }).eq("id", o.id);
    if (error) { toast.error("Could not update", { description: error.message }); return; }
    logAuditEvent({ action: "lab_sample_recollected", module: "laboratory", details: { order: o.id, previous_reason: o.rejection_reason } });
    toast.success("New sample received");
    await fetchOrders();
  };

  const handleSave = async () => {
    if (!openVisit) return;
    setBusy("save");
    try {
      const r = await saveResults(openVisit);
      if (r.incomplete.length) toast.warning("Some tests were not saved — answers missing", { description: r.incomplete.join(" · "), duration: 8000 });
      if (r.saved || !r.incomplete.length) toast.success(r.saved ? `Saved ${r.saved} result(s)` : "Nothing new to save", { description: r.remaining ? `${r.remaining} test(s) still without results` : undefined });
      await fetchOrders();
    } catch (e) {
      toast.error("Could not save results", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const recommended: StationKey = openVisit?.origin === "dental" ? "dental" : openVisit?.origin === "direct" ? "billing" : "doctor";

  const beforeSend = async () => {
    if (!openVisit) return;
    const r = await saveResults(openVisit);
    if (r.incomplete.length) throw new Error(`Answers missing — ${r.incomplete.join(" · ")}`);
    if (r.remaining > 0) throw new Error(`${r.remaining} test(s) have no result yet. Enter them first, or reject the sample.`);
    const name = openVisit.patient?.profile?.full_name || "a patient";
    const rejected = openVisit.orders.filter((o) => o.status === "rejected").length;
    await notifyOrderers(openVisit, r.abnormal ? "Abnormal lab results ready" : "Lab results ready", `Results for ${name} are ready${r.abnormal ? " — some values are abnormal" : ""}${rejected ? `. ${rejected} sample(s) rejected — new sample needed` : ""}.`);
    await notifyRoles(["nurse"], { title: "Lab results ready", message: `Results for ${name} are ready.`, category: "lab", link: "/vitals" });
  };

  const afterSent = () => {
    setSelectedTicket(null);
    setOpenVisitKey(null);
    void fetchOrders();
  };

  const visitTicketForSend = openVisit?.ticketId ? { id: openVisit.ticketId, patientName: openVisit.patient?.profile?.full_name } : null;

  // Keyboard: Enter / ↑ / ↓ move between result boxes
  const onResultKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-lab-field]")).filter((el) => el.offsetParent !== null);
    const i = all.indexOf(e.currentTarget);
    const next = all[e.key === "ArrowUp" ? i - 1 : i + 1];
    next?.focus(); next?.select();
  };

  const setField = (orderId: string, patch: Partial<Draft[string]>) => setDraft((p) => ({ ...p, [orderId]: { ...p[orderId], ...patch } }));

  const renderVisitCard = (v: LabVisit) => {
    const st = STATUS_BADGE[v.status];
    const done = v.orders.filter((o) => !isOpen(o)).length;
    return (
      <button key={v.key} type="button" onClick={() => setOpenVisitKey(v.key)}
        className="w-full text-left p-3 border rounded-lg hover:bg-muted/40 transition-colors space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{v.patient?.profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {v.patient?.patient_id} · {calculateAgeYears(v.patient?.profile?.date_of_birth) ?? "?"} yrs · <span className="capitalize">{v.patient?.profile?.gender || "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {v.origin !== "doctor" && <Badge variant="outline" className="text-[10px]">{v.origin === "dental" ? "From dental" : "Direct request"}</Badge>}
            <Badge variant="outline" className={cn("text-xs", st.cls)}>{st.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {v.orders.map((o) => (
            <Badge key={o.id} variant={o.status === "completed" ? "default" : "soft"} className="text-[11px] font-normal">
              {o.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}{o.status === "rejected" && <Ban className="h-3 w-3 mr-1" />}{o.test?.test_name}
            </Badge>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" /> {new Date(v.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {done}/{v.orders.length} done
        </p>
      </button>
    );
  };

  return (
    <StationShell
      queue={
        <StationQueue
          stationStages={["at_lab"]}
          nextStage="waiting_for_doctor"
          title="Lab Queue"
          onSelectPatient={setSelectedTicket}
          selectedTicketId={selectedTicket?.id}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
        />
      }
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><TestTube className="h-7 w-7 text-primary" /> Laboratory</h1>
        <p className="text-muted-foreground text-sm mt-1">Receive → enter results → send. One request per patient.</p>
      </div>

      {openVisit ? (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setOpenVisitKey(null); setSelectedTicket(null); }} aria-label="Back to requests"><ArrowLeft className="h-4 w-4" /></Button>
                <div>
                  <CardTitle className="text-lg">{openVisit.patient?.profile?.full_name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {openVisit.patient?.patient_id} · {calculateAgeYears(openVisit.patient?.profile?.date_of_birth) ?? "?"} yrs · <span className="capitalize">{openVisit.patient?.profile?.gender || "—"}</span> · {openVisit.orders.length} test(s)
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className={STATUS_BADGE[openVisit.status].cls}>{STATUS_BADGE[openVisit.status].label}</Badge>
                    {selectedTicket?.payment_mode && <Badge variant="outline">{paymentModeLabel(selectedTicket.payment_mode)}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {openVisit.ticketId && <InterimPayment ticketId={openVisit.ticketId} patientId={openVisit.patient?.id} />}
                <Button variant="outline" size="sm" className="h-8" onClick={() => printVisitLabReport({ ...openVisit.patient?.profile, patient_id: openVisit.patient?.patient_id }, openVisit.orders)}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Step 1 — receive */}
            <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3", openVisit.status === "new" ? "border-yellow-300 bg-yellow-50" : "bg-muted/30")}>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                {openVisit.status === "new" ? "Receive the patient & collect the sample" : <span className="flex items-center gap-1 text-[hsl(var(--success))] font-medium"><CheckCircle2 className="h-4 w-4" /> Sample received</span>}
              </div>
              {openVisit.status === "new" && canManageLab && (
                <Button onClick={() => receiveAll(openVisit)} disabled={busy === "receive"}>
                  {busy === "receive" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />} Receive sample
                </Button>
              )}
            </div>

            {/* Step 2 — results, all tests in one bordered table */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Enter results <span className="text-muted-foreground text-xs hidden sm:inline">(Enter / ↑ ↓ move between boxes)</span>
              </div>
              {/* Phones: one card per test, one box per line */}
              <div className="md:hidden space-y-3">
                {openVisit.orders.map((o) => {
                  const defs = STRUCTURED_FIELDS[o.test?.test_name || ""];
                  const d = draft[o.id] || { fields: {}, value: "", notes: "" };
                  const locked = !canManageLab || o.status === "completed";
                  const gender = o.patient?.profile?.gender;
                  return (
                    <div key={o.id} className="rounded-lg border">
                      <p className="px-3 py-2 border-b bg-muted/40 font-semibold text-sm flex items-center gap-1">
                        {o.test?.test_name}
                        {o.status === "completed" && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />}
                      </p>
                      <div className="divide-y">
                        {defs ? defs.map((def) => {
                          const ref = refRangeFor(def, gender);
                          const val = d.fields[def.name] || "";
                          const flag = getFlag(val, ref);
                          return (
                            <div key={def.name} className={cn("flex items-center gap-2 px-3 py-1.5", flag && "bg-destructive/5")}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{def.name} {flag && <span className="text-destructive font-bold">{flag === "H" ? "↑" : "↓"}</span>}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{[ref, def.unit].filter(Boolean).join(" · ")}</p>
                              </div>
                              <Input data-lab-field inputMode="decimal" value={val} disabled={locked} onKeyDown={onResultKey}
                                onChange={(e) => setField(o.id, { fields: { ...d.fields, [def.name]: e.target.value } })}
                                className={cn("h-11 w-28 text-base", flag && "border-destructive font-bold text-destructive")} />
                            </div>
                          );
                        }) : (
                          <div className="px-3 py-2 space-y-2">
                            <Input data-lab-field value={d.value} disabled={locked} onKeyDown={onResultKey} placeholder="Type result"
                              onChange={(e) => setField(o.id, { value: e.target.value })} className="h-11 text-base" />
                            {!locked && (
                              <div className="grid grid-cols-2 gap-2">
                                {["Positive", "Negative"].map((q) => (
                                  <Button key={q} type="button" variant={d.value === q ? "default" : "outline"} className="h-10" onClick={() => setField(o.id, { value: q })}>
                                    {q === "Positive" ? "+ve Positive" : "-ve Negative"}
                                  </Button>
                                ))}
                              </div>
                            )}
                            {o.test?.normal_range && <p className="text-[11px] text-muted-foreground">Normal: {o.test.normal_range} {o.test.unit || ""}</p>}
                          </div>
                        )}
                        <div className="px-3 py-2">
                          <Textarea rows={2} placeholder="Comment (optional)" value={d.notes} disabled={locked}
                            onChange={(e) => setField(o.id, { notes: e.target.value })} className="text-sm" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto rounded-md">
                <table className="w-full border-collapse border border-border text-sm min-w-[640px]">
                  <thead>
                    <tr>{["Test", "Parameter", "Result", "Unit", "Reference range", "Flag"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {openVisit.orders.map((o) => {
                      const defs = STRUCTURED_FIELDS[o.test?.test_name || ""];
                      const d = draft[o.id] || { fields: {}, value: "", notes: "" };
                      const locked = !canManageLab || o.status === "completed";
                      const gender = o.patient?.profile?.gender;
                      const testCell = (span: number) => (
                        <td rowSpan={span} className="border px-2 py-1.5 align-top font-semibold bg-muted/30 min-w-[150px]">
                          {o.test?.test_name}
                          {o.status === "completed" && <CheckCircle2 className="inline h-4 w-4 ml-1 text-[hsl(var(--success))]" />}
                          <Textarea rows={2} placeholder="Comment (optional)" value={d.notes} disabled={locked}
                            onChange={(e) => setField(o.id, { notes: e.target.value })}
                            className="mt-2 text-xs font-normal min-h-[48px]" />
                        </td>
                      );
                      if (defs) {
                        return (
                          <Fragment key={o.id}>
                            {defs.map((def, i) => {
                              const ref = refRangeFor(def, gender);
                              const val = d.fields[def.name] || "";
                              const flag = getFlag(val, ref);
                              return (
                                <tr key={def.name} className={flag ? "bg-destructive/5" : undefined}>
                                  {i === 0 && testCell(defs.length)}
                                  <td className="border px-2 py-1">{def.name}</td>
                                  <td className="border px-1 py-0.5">
                                    <Input data-lab-field value={val} disabled={locked} onKeyDown={onResultKey}
                                      onChange={(e) => setField(o.id, { fields: { ...d.fields, [def.name]: e.target.value } })}
                                      className={cn("h-9 w-28 text-sm", flag && "border-destructive font-bold text-destructive")} />
                                  </td>
                                  <td className="border px-2 py-1 text-muted-foreground">{def.unit}</td>
                                  <td className="border px-2 py-1 text-muted-foreground">{ref || ""}</td>
                                  <td className="border px-2 py-1 text-center font-bold text-destructive">{flag === "H" ? "↑ H" : flag === "L" ? "↓ L" : ""}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        );
                      }
                      const flag = getFlag(d.value, o.test?.normal_range);
                      return (
                        <tr key={o.id}>
                          {testCell(1)}
                          <td className="border px-2 py-1">Result</td>
                          <td className="border px-1 py-1">
                            <Input data-lab-field value={d.value} disabled={locked} onKeyDown={onResultKey}
                              onChange={(e) => setField(o.id, { value: e.target.value })}
                              placeholder="Type result" className={cn("h-9 w-full min-w-[9rem] text-sm", flag && "border-destructive font-bold text-destructive")} />
                            {!locked && (
                              <div className="flex gap-1 mt-1">
                                {["Positive", "Negative"].map((q) => (
                                  <Button key={q} type="button" size="sm" variant={d.value === q ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setField(o.id, { value: q })}>
                                    {q === "Positive" ? "+ve" : "-ve"}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="border px-2 py-1 text-muted-foreground">{o.test?.unit || ""}</td>
                          <td className="border px-2 py-1 text-muted-foreground">{o.test?.normal_range || ""}</td>
                          <td className="border px-2 py-1 text-center font-bold text-destructive">{flag === "H" ? "↑ H" : flag === "L" ? "↓ L" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 3 — send */}
            {canManageLab && (
              <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-1 border-t bg-background/95 backdrop-blur px-4 sm:px-1 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  Send the patient on
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-11" onClick={handleSave} disabled={busy === "save"}>
                    {busy === "save" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
                  </Button>
                  <Button className="h-11 px-6" onClick={() => setSendOpen(true)} disabled={!visitTicketForSend}>
                    <Send className="h-4 w-4 mr-2" /> Save & send results
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="requests">To do ({pendingVisits.length})</TabsTrigger>
              <TabsTrigger value="done">Results ready ({doneVisits.length})</TabsTrigger>
              <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-4 w-4" /> Reports</TabsTrigger>
            </TabsList>
            {tab !== "reports" && (
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patient or test…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11" />
              </div>
            )}
          </div>

          <TabsContent value="requests" className="space-y-3">
            <div className="grid gap-3 grid-cols-3">
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">New</p><p className="text-2xl font-bold">{visits.filter((v) => v.status === "new").length}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">In progress</p><p className="text-2xl font-bold">{visits.filter((v) => v.status === "received").length}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Done today</p><p className="text-2xl font-bold">{visits.filter((v) => v.status === "done" && v.orders.some((o) => o.completed_at?.startsWith(today))).length}</p></CardContent></Card>
            </div>
            {loading ? <p className="text-center py-8 text-muted-foreground">Loading…</p>
              : pendingVisits.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No lab requests waiting</CardContent></Card>
              : <div className="grid gap-2 xl:grid-cols-2">{pendingVisits.map(renderVisitCard)}</div>}
          </TabsContent>

          <TabsContent value="done" className="space-y-4">
            {doneVisits.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No completed results</CardContent></Card> : doneVisits.slice(0, 40).map((v) => (
              <Card key={v.key}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{v.patient?.profile?.full_name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{v.patient?.patient_id} · {new Date(v.createdAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => printVisitLabReport({ ...v.patient?.profile, patient_id: v.patient?.patient_id }, v.orders)}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                  </div>
                </CardHeader>
                <CardContent><LabResultsTable orders={v.orders} compact /></CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="reports">
            <Card><CardContent className="pt-6"><LabReport /></CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      <SendToDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        ticket={visitTicketForSend}
        from="Laboratory"
        exclude={["lab"]}
        recommended={recommended}
        beforeSend={beforeSend}
        onSent={afterSent}
      />
    </StationShell>
  );
};

export default Laboratory;
