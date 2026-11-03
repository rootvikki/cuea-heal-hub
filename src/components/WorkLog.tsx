import { useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/Pager";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardList, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PERIOD_LABELS, nairobiParts, queryBounds, rangeFor } from "@/lib/paymentsQuery";
import { currentStaffId, stageLabel } from "@/lib/stations";
import { openPdfWindow } from "@/lib/letterhead";
import { tableCsv, tablePdf, type Col } from "@/lib/tableExport";
import { logAuditEvent } from "@/lib/auditLog";
import {
  GROUPS, STATION_TITLE, WORK_STATIONS, filterWork, groupOf, isMine, statusLabel, summarizeWork,
  type WorkRow, type WorkStation,
} from "@/lib/workLog";
import { cn } from "@/lib/utils";

const PERIODS = ["today", "yesterday", "this_week", "last_7", "this_month", "last_month", "custom"] as const;
const ddmm = (s: string) => s.split("-").reverse().join("/");
const kes = (n: number) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
/** Stations where the system records who did each step, so "only mine" is meaningful. */
const TRACKED: WorkStation[] = ["pharmacy", "laboratory", "imaging", "triage", "consultation", "dental", "billing"];

// deno-lint-ignore no-explicit-any
type Raw = any;

async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) { const { data } = await run(ids.slice(i, i + 100)); out.push(...(data || [])); }
  return out;
}
/** "Tabs Paracetamol 500mg" without repeating a form or strength already in the drug name. */
const rxName = (r: Raw) => {
  const name = String(r.medication_name || "").trim(), low = name.toLowerCase();
  const form = r.formulation && !low.startsWith(String(r.formulation).toLowerCase()) ? r.formulation : "";
  const strength = r.strength && !low.includes(String(r.strength).toLowerCase()) ? r.strength : "";
  return [form, name, strength].filter(Boolean).join(" ");
};
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];

/** Loads one station's work in the period and turns it into WorkRows (patients, tickets and names looked up in bulk). */
async function loadWork(station: WorkStation, from: string, to: string): Promise<WorkRow[]> {
  const [lo, hi] = queryBounds(from, to);
  const range = <Q extends { gte: Raw; lte: Raw }>(q: Q, col = "created_at") => (q as Raw).gte(col, lo).lte(col, hi).order(col, { ascending: false }).limit(3000);
  let raw: Raw[] = [];
  let map: (r: Raw) => Omit<WorkRow, "patient" | "opd" | "ticket" | "byNames"> & { patientId: string; ticketId?: string | null; encounterId?: string | null };

  switch (station) {
    case "pharmacy":
      raw = (await range(supabase.from("prescriptions").select("id, created_at, status, medication_name, formulation, strength, dosage, frequency, duration, quantity, quantity_dispensed, patient_id, encounter_id, received_by, reviewed_by, dispensed_by, collected_by"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: rxName(r), detail: `${r.dosage || ""} ${r.frequency || ""} × ${r.duration || ""} · qty ${r.quantity}${r.quantity_dispensed ? ` (given ${r.quantity_dispensed})` : ""}`.trim(), status: r.status || "sent", byIds: uniq([r.received_by, r.reviewed_by, r.dispensed_by, r.collected_by]), patientId: r.patient_id, encounterId: r.encounter_id });
      break;
    case "laboratory":
      raw = (await range(supabase.from("lab_orders").select("id, created_at, status, result_value, flag, rejection_reason, patient_id, encounter_id, received_by, collected_by, processed_by, result_entered_by, lab_tests_catalog(test_name)"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.lab_tests_catalog?.test_name || "Lab test", detail: r.status === "rejected" ? `Rejected: ${r.rejection_reason || ""}` : r.status === "completed" ? [r.result_value && r.result_value !== "See structured results" ? r.result_value : "", r.flag && r.flag !== "normal" ? r.flag : ""].filter(Boolean).join(" · ") || "Results entered" : "", status: r.status || "pending", byIds: uniq([r.received_by, r.collected_by, r.processed_by, r.result_entered_by]), patientId: r.patient_id, encounterId: r.encounter_id });
      break;
    case "imaging":
      raw = (await range(supabase.from("imaging_orders").select("id, created_at, status, impression, patient_id, encounter_id, performed_by, reported_by, imaging_catalog(name, modality)"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.imaging_catalog?.name || "Imaging", detail: r.impression || r.imaging_catalog?.modality || "", status: r.status || "pending", byIds: uniq([r.performed_by, r.reported_by]), patientId: r.patient_id, encounterId: r.encounter_id });
      break;
    case "triage":
      raw = (await range(supabase.from("vitals").select("id, created_at, patient_id, encounter_id, recorded_by, urgency_priority, temperature, blood_pressure_systolic, blood_pressure_diastolic, pulse_rate, presenting_complaint"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.presenting_complaint || "Vitals recorded", detail: [r.blood_pressure_systolic && `BP ${r.blood_pressure_systolic}/${r.blood_pressure_diastolic}`, r.temperature && `T ${r.temperature}°C`, r.pulse_rate && `P ${r.pulse_rate}`, r.urgency_priority && `Priority ${r.urgency_priority}`].filter(Boolean).join(" · "), status: "triaged", byIds: uniq([r.recorded_by]), patientId: r.patient_id, encounterId: r.encounter_id });
      break;
    case "consultation":
      raw = (await range(supabase.from("encounters").select("id, created_at, patient_id, ticket_id, doctor_id, chief_complaint, diagnosis, tickets(status)").not("doctor_id", "is", null))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.chief_complaint || "Consultation", detail: (r.diagnosis || []).join(", "), status: r.tickets?.status === "checked_out" ? "closed" : "open", byIds: uniq([r.doctor_id]), patientId: r.patient_id, ticketId: r.ticket_id });
      break;
    case "dental":
      raw = (await range(supabase.from("dental_procedures").select("id, created_at, patient_id, ticket_id, dentist_id, procedure_name, tooth_number, price"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.procedure_name, detail: [r.tooth_number && `Tooth ${r.tooth_number}`, r.price != null && kes(r.price)].filter(Boolean).join(" · "), status: "done", byIds: uniq([r.dentist_id]), patientId: r.patient_id, ticketId: r.ticket_id, amount: Number(r.price || 0) });
      break;
    case "billing":
      raw = (await range(supabase.from("invoices").select("id, created_at, invoice_number, status, net_amount, amount_paid, balance, patient_id, ticket_id, payments(received_by, status)"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.invoice_number, detail: `Billed ${kes(r.net_amount)} · paid ${kes(r.amount_paid)} · balance ${kes(r.balance)}`, status: r.status || "pending", byIds: uniq((r.payments || []).filter((p: Raw) => p.status === "completed").map((p: Raw) => p.received_by)), patientId: r.patient_id, ticketId: r.ticket_id, amount: Number(r.net_amount || 0) });
      break;
    case "reception":
    default:
      raw = (await range(supabase.from("tickets").select("id, created_at, ticket_number, status, workflow_stage, payment_mode, patient_id, departments(name)"))).data || [];
      map = (r) => ({ id: r.id, at: r.created_at, item: r.departments?.name || "Visit", detail: `Now: ${stageLabel(r.workflow_stage || r.status)}`, status: r.status === "checked_out" ? "checked_out" : "open", byIds: [], patientId: r.patient_id, ticketId: r.id });
  }
  const rows = raw.map(map);

  // Tickets: directly, or through the visit record
  const encIds = uniq(rows.map((r) => r.encounterId));
  const encs = await inChunks<Raw>(encIds, (part) => supabase.from("encounters").select("id, ticket_id").in("id", part));
  const encTicket = new Map(encs.map((e) => [e.id, e.ticket_id]));
  const ticketIds = uniq(rows.map((r) => r.ticketId ?? (r.encounterId ? encTicket.get(r.encounterId) : null)));
  const tks = station === "reception" ? raw.map((r) => ({ id: r.id, ticket_number: r.ticket_number })) : await inChunks<Raw>(ticketIds, (part) => supabase.from("tickets").select("id, ticket_number").in("id", part));
  const ticketNo = new Map(tks.map((t) => [t.id, t.ticket_number]));

  const pts = await inChunks<Raw>(uniq(rows.map((r) => r.patientId)), (part) => supabase.from("patients").select("id, patient_id, profiles(full_name)").in("id", part));
  const patient = new Map(pts.map((p) => [p.id, p]));

  // Names of whoever handled each row (staff record ids or sign-in ids)
  const ids = uniq(rows.flatMap((r) => r.byIds));
  const staff = await inChunks<Raw>(ids, (part) => supabase.from("staff").select("id, user_id").in("id", part));
  const userIds = uniq([...staff.map((s) => s.user_id), ...ids]);
  const profs = await inChunks<Raw>(userIds, (part) => supabase.from("profiles").select("user_id, full_name").in("user_id", part));
  const nameByUser = new Map(profs.map((p) => [p.user_id, p.full_name]));
  const nameOf = (id: string) => nameByUser.get(staff.find((s) => s.id === id)?.user_id) || nameByUser.get(id) || "";
  // Staff ids also count as the person's sign-in id, so "only mine" works either way
  const userOfStaff = new Map(staff.map((s) => [s.id, s.user_id]));

  return rows.map(({ patientId, ticketId, encounterId, ...r }) => {
    const p = patient.get(patientId);
    const tId = ticketId ?? (encounterId ? encTicket.get(encounterId) : null);
    return {
      ...r,
      byIds: uniq([...r.byIds, ...r.byIds.map((id) => userOfStaff.get(id))]),
      byNames: uniq(r.byIds.map(nameOf)).join(", "),
      patient: p?.profiles?.full_name || "-", opd: p?.patient_id || "-", ticket: (tId && ticketNo.get(tId)) || "-",
    };
  });
}

function WorkLogView({ station }: { station: WorkStation }) {
  const { user, profile } = useUser();
  const [period, setPeriod] = useState<string>("today");
  const [from, setFrom] = useState(rangeFor("today")[0]);
  const [to, setTo] = useState(rangeFor("today")[1]);
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mine, setMine] = useState(false);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [myStaff, setMyStaff] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const tracked = TRACKED.includes(station);

  useEffect(() => { void currentStaffId().then(setMyStaff); }, []);
  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    setLoading(true);
    loadWork(station, from, to)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => toast.error("Could not load work", { description: e instanceof Error ? e.message : String(e) }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [station, from, to, tick]);

  const myIds = [myStaff, user?.id];
  const scoped = useMemo(() => filterWork(rows, station, { group: "all", mine: mine && tracked, search }, myIds), [rows, station, mine, tracked, search, myStaff, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => scoped.filter((r) => group === "all" || groupOf(station, r.status)?.key === group), [scoped, group, station]);
  const sum = summarizeWork(scoped, station);
  const pages = usePaged(view, { resetKey: `${from}|${to}|${group}|${mine}|${search}` });
  const mineCount = tracked ? rows.filter((r) => isMine(r, myIds)).length : 0;

  const choose = (p: string) => { setPeriod(p); if (p !== "custom") { const [a, b] = rangeFor(p); setFrom(a); setTo(b); } };
  const cols: Col[] = [{ header: "Date", kind: "date" }, { header: "Time" }, { header: "Patient" }, { header: "OPD No." }, { header: "Ticket" }, { header: "Item" }, { header: "Details" }, { header: "Status" }, { header: "Handled by" }];
  const values = () => view.map((r) => { const t = nairobiParts(r.at); return [t.date, t.time, r.patient, r.opd, r.ticket, r.item, r.detail, statusLabel(station, r.status), r.byNames]; });
  const filters = () => [`${ddmm(from)} to ${ddmm(to)}`, mine && tracked ? `Only work by ${profile?.full_name || "me"}` : "Whole department", group !== "all" ? `Status: ${GROUPS[station].find((g) => g.key === group)?.label}` : "All statuses", ...(search ? [`Search: "${search}"`] : [])];
  const base = `CUEA-${STATION_TITLE[station]}-work-${from}_to_${to}`;
  const audit = (format: string) => logAuditEvent({ action: "work_log_exported", module: station, details: { format, from, to, mine, rows: view.length } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => choose(p)}>{PERIOD_LABELS[p]}</Button>)}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" className="h-10 w-40" value={from} max={to} onChange={(e) => { setPeriod("custom"); setFrom(e.target.value); }} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" className="h-10 w-40" value={to} min={from} onChange={(e) => { setPeriod("custom"); setTo(e.target.value); }} /></div>
        <div className="space-y-1 flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input className="h-10" placeholder="Patient, OPD no., ticket, drug / test…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {tracked && (
          <label className="flex items-center gap-2 text-sm font-medium h-10">
            <Switch checked={mine} onCheckedChange={setMine} />
            Only what I did <span className="text-muted-foreground font-normal">({mineCount})</span>
          </label>
        )}
        <Button variant="ghost" size="sm" className="h-10" onClick={() => setTick((t) => t + 1)}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setGroup("all")} className={cn("rounded-full border px-3 py-1 text-sm", group === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
          All <b>{sum.total}</b> <span className="opacity-80">· {sum.patients} patient{sum.patients === 1 ? "" : "s"}</span>
        </button>
        {GROUPS[station].map((g) => (
          <button key={g.key} type="button" onClick={() => setGroup(g.key)} className={cn("rounded-full border px-3 py-1 text-sm", group === g.key ? "bg-primary text-primary-foreground border-primary" : g.done ? "hover:bg-muted" : "border-orange-300 hover:bg-orange-50")}>
            {g.label} <b>{sum.byGroup[g.key] || 0}</b>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">{sum.done} finished · {sum.open} still open{!tracked && " · this desk does not record who checked each patient in"}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!view.length} onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob(["\uFEFF" + tableCsv(cols, values())], { type: "text/csv;charset=utf-8" }));
            a.download = `${base}.csv`; a.click(); audit("csv");
          }}><Download className="h-4 w-4 mr-1" /> CSV / Excel</Button>
          <Button size="sm" disabled={!view.length} onClick={() => {
            void openPdfWindow(() => tablePdf({ title: `${STATION_TITLE[station]} — Work Done`, cols, rows: values(), filters: filters(), preparedBy: profile?.full_name, summary: [`Items: ${view.length}`, `Patients: ${new Set(view.map((r) => r.opd)).size}`, `Finished: ${view.filter((r) => groupOf(station, r.status)?.done).length}`] }));
            audit("pdf");
          }}><FileText className="h-4 w-4 mr-1" /> Branded PDF</Button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="w-full border-collapse text-sm min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr>{["Time", "Patient", "OPD No.", "Ticket", "Item", "Details", "Status", "Handled by"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="border py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></td></tr>
              : view.length === 0 ? <tr><td colSpan={8} className="border py-10 text-center text-muted-foreground">Nothing for these choices</td></tr>
              : pages.pageItems.map((r) => {
                const t = nairobiParts(r.at), g = groupOf(station, r.status);
                return (
                  <tr key={r.id} className={cn("hover:bg-muted/40", isMine(r, myIds) && tracked && "bg-primary/5")}>
                    <td className="border px-2 py-1 whitespace-nowrap">{from === to ? t.time : `${ddmm(t.date)} ${t.time}`}</td>
                    <td className="border px-2 py-1 font-medium">{r.patient}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{r.opd}</td>
                    <td className="border px-2 py-1 whitespace-nowrap">{r.ticket}</td>
                    <td className="border px-2 py-1">{r.item}</td>
                    <td className="border px-2 py-1 text-muted-foreground">{r.detail}</td>
                    <td className="border px-2 py-1"><Badge variant={g?.done ? "default" : "outline"} className={cn("font-normal whitespace-nowrap", !g?.done && "border-orange-300 text-orange-700")}>{statusLabel(station, r.status)}</Badge></td>
                    <td className="border px-2 py-1">{r.byNames || "-"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <Pager pager={pages} label="items" />
    </div>
  );
}

/** Top-bar "My work" button on every station page: what the department received, has pending and finished. */
export function WorkLogButton() {
  const { pathname } = useLocation();
  const station = WORK_STATIONS[pathname];
  const [open, setOpen] = useState(false);
  if (!station) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 mr-2 h-8" onClick={() => setOpen(true)}>
        <ClipboardList className="h-4 w-4" /> My work
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[96vw] xl:max-w-7xl max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> {STATION_TITLE[station]} — work done</DialogTitle>
            <DialogDescription>Every patient this department received, what is still pending and what is finished. Switch on “Only what I did” to see your own work.</DialogDescription>
          </DialogHeader>
          {open && <WorkLogView station={station} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
