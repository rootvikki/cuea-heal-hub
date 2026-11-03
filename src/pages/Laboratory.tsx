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
import { TestTube, Search, Printer, CheckCircle2, PackageCheck, Save, Send, ArrowLeft, Clock, BarChart3, Loader2 } from "lucide-react";
import { printVisitLabReport } from "@/lib/labReport";
import { STRUCTURED_FIELDS, getFlag, refRangeFor, resultCategory } from "@/lib/labFields";
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

const visitStatus = (orders: any[]): LabVisit["status"] =>
  orders.every((o) => o.status === "completed") ? "done" : orders.some((o) => o.status !== "pending") ? "received" : "new";

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
  useEffect(() => {
    setQueueCollapsed(!!selectedTicket);
    if (selectedTicket) setOpenVisitKey(selectedTicket.id);
  }, [selectedTicket]);

  // Fill the entry form from what is already saved
  useEffect(() => {
    if (!openVisit) { setDraft({}); return; }
    const d: Draft = {};
    for (const o of openVisit.orders) {
      const saved: Record<string, string> = {};
      (o.lab_result_fields || []).forEach((f: any) => { saved[f.field_name] = f.field_value || ""; });
      const defs = STRUCTURED_FIELDS[o.test?.test_name || ""];
      d[o.id] = {
        fields: defs ? Object.fromEntries(defs.map((f) => [f.name, saved[f.name] || ""])) : {},
        value: o.result_value && o.result_value !== "See structured results" ? o.result_value : "",
        notes: o.result_notes || "",
      };
    }
    setDraft(d);
  }, [openVisitKey, openVisit?.orders.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Saves every test that has results typed in. */
  const saveResults = async (visit: LabVisit) => {
    const staffId = await currentStaffId();
    const now = new Date().toISOString();
    let abnormal = false;
    let saved = 0;
    for (const o of visit.orders) {
      if (o.status === "completed" || !hasEntry(o)) continue;
      const d = draft[o.id];
      const gender = o.patient?.profile?.gender;
      const defs = STRUCTURED_FIELDS[o.test?.test_name || ""];
      let flag: string | null = null;
      if (defs) {
        await supabase.from("lab_result_fields").delete().eq("lab_order_id", o.id);
        const rows = defs.map((def, idx) => {
          const value = d.fields[def.name] || "";
          const ref = refRangeFor(def, gender);
          const f = getFlag(value, ref);
          if (f) flag = "abnormal";
          return { lab_order_id: o.id, field_name: def.name, field_value: value, unit: def.unit || null, reference_range: ref || null, flag: f, sort_order: idx };
        });
        const { error } = await supabase.from("lab_result_fields").insert(rows);
        if (error) throw error;
      } else {
        const cat = resultCategory({ status: "completed", result_value: d.value });
        if (getFlag(d.value, o.test?.normal_range)) flag = "abnormal";
        else if (cat === "positive") flag = "positive";
        else if (cat === "negative") flag = "negative";
      }
      if (flag && flag !== "negative") abnormal = true;
      const { error } = await supabase.from("lab_orders").update({
        status: "completed", completed_at: now,
        received_at: o.received_at || now, sample_collected_at: o.sample_collected_at || now, processing_started_at: o.processing_started_at || now,
        result_value: defs ? "See structured results" : d.value.trim(),
        result_notes: d.notes.trim() || null, result_entered_by: staffId, result_entered_at: now, flag,
      }).eq("id", o.id);
      if (error) throw error;
      saved++;
    }
    if (saved) logAuditEvent({ action: "lab_results_entered", module: "laboratory", details: { visit: visit.key, tests: saved } });
    const remaining = visit.orders.filter((o) => o.status !== "completed" && !hasEntry(o)).length;
    return { saved, remaining, abnormal };
  };

  const handleSave = async () => {
    if (!openVisit) return;
    setBusy("save");
    try {
      const r = await saveResults(openVisit);
      toast.success(r.saved ? `Saved ${r.saved} result(s)` : "Nothing new to save", { description: r.remaining ? `${r.remaining} test(s) still without results` : undefined });
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
    if (r.remaining > 0) throw new Error(`${r.remaining} test(s) have no result yet. Enter them first.`);
    const name = openVisit.patient?.profile?.full_name || "a patient";
    await notifyOrderers(openVisit, r.abnormal ? "Abnormal lab results ready" : "Lab results ready", `Results for ${name} are ready${r.abnormal ? " — some values are abnormal" : ""}.`);
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
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-lab-field]"));
    const i = all.indexOf(e.currentTarget);
    const next = all[e.key === "ArrowUp" ? i - 1 : i + 1];
    next?.focus(); next?.select();
  };

  const setField = (orderId: string, patch: Partial<Draft[string]>) => setDraft((p) => ({ ...p, [orderId]: { ...p[orderId], ...patch } }));

  const renderVisitCard = (v: LabVisit) => {
    const st = STATUS_BADGE[v.status];
    const done = v.orders.filter((o) => o.status === "completed").length;
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
            <Badge key={o.id} variant={o.status === "completed" ? "default" : "secondary"} className="text-[11px] font-normal">
              {o.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}{o.test?.test_name}
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
              <div className="overflow-x-auto rounded-md">
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
              <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 backdrop-blur px-1 py-3 flex flex-wrap items-center justify-between gap-2">
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
