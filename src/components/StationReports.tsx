import { useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/Pager";
import { format, startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { drawInfirmaryLetterhead, openPdfWindow } from "@/lib/letterhead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarChart3, Download, Printer, Loader2, Search, RotateCcw } from "lucide-react";
import { calculateAgeYears } from "@/lib/utils";
import { paymentModeLabel, PAYMENT_MODES } from "@/lib/pricing";
import { stageLabel } from "@/lib/stations";
import { RESULT_CATEGORY_LABELS, STRUCTURED_FIELDS, answerBreakdown, fieldKind, flagLabel, isCriticalFlag, isPanelTest, resultCategory, splitMulti, type ResultCategory } from "@/lib/labFields";

// ─── shared helpers ───────────────────────────────────────────────
type Col<T> = { key: string; label: string; value: (r: T) => string | number };

const toCsv = <T,>(rows: T[], cols: Col<T>[]) => {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(c.value(r))).join(","))].join("\n");
};

const downloadCsv = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
};

const printPdf = <T,>(title: string, subtitle: string, rows: T[], cols: Col<T>[], summary: string[]) =>
  openPdfWindow(async () => {
    const wide = cols.length > 12;
    const doc = new jsPDF({ orientation: cols.length > 7 ? "landscape" : "portrait", format: wide ? "a3" : "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const t = await drawInfirmaryLetterhead(doc, { title });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(subtitle, W / 2, t, { align: "center" });
    doc.text(summary.join("   ·   "), 14, t + 7, { maxWidth: W - 28 });
    autoTable(doc, {
      startY: t + 13,
      head: [cols.map((c) => c.label)],
      body: rows.map((r) => cols.map((c) => String(c.value(r) ?? ""))),
      theme: "grid",
      styles: { fontSize: wide ? 6.5 : 8, cellPadding: wide ? 1 : 1.4 },
      headStyles: { fillColor: [128, 0, 32] },
      margin: { bottom: 14 },
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(`CUEA Infirmary  |  Generated ${format(new Date(), "dd MMM yyyy HH:mm")}  |  Page ${i} of ${pages}`, W / 2, H - 8, { align: "center" });
    }
    return doc;
  });

const PRESETS = [
  { label: "Today", from: () => new Date(), to: () => new Date() },
  { label: "Last 7 days", from: () => subDays(new Date(), 6), to: () => new Date() },
  { label: "This month", from: () => startOfMonth(new Date()), to: () => new Date() },
];

function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
      </div>
      <div className="col-span-2 sm:col-span-full flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.label} type="button" size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { setFrom(format(p.from(), "yyyy-MM-dd")); setTo(format(p.to(), "yyyy-MM-dd")); }}>
            {p.label}
          </Button>
        ))}
      </div>
    </>
  );
}

function AgeRange({ min, max, setMin, setMax }: { min: string; max: string; setMin: (v: string) => void; setMax: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Age (years)</Label>
      <div className="flex items-center gap-1">
        <Input type="number" min={0} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} className="h-10" />
        <span className="text-muted-foreground">–</span>
        <Input type="number" min={0} placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} className="h-10" />
      </div>
    </div>
  );
}

function SimpleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResultsTable<T extends { _id: string }>({ rows, cols }: { rows: T[]; cols: Col<T>[] }) {
  const pages = usePaged(rows, { resetKey: rows });
  return (
    <div>
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full border-collapse text-sm min-w-[720px]">
          <thead>
            <tr>{cols.map((c) => <th key={c.key} className="border bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="border px-2 py-8 text-center text-muted-foreground">No records match these filters</td></tr>
            ) : pages.pageItems.map((r) => (
              <tr key={r._id} className="hover:bg-muted/40">
                {cols.map((c) => <td key={c.key} className="border px-2 py-1.5 whitespace-nowrap">{c.value(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pager={pages} label="records" />
    </div>
  );
}

const Summary = ({ items }: { items: { label: string; value: number | string }[] }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
    {items.map((i) => (
      <Card key={i.label}><CardContent className="p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.label}</p>
        <p className="text-xl font-bold">{i.value}</p>
      </CardContent></Card>
    ))}
  </div>
);

const today = format(new Date(), "yyyy-MM-dd");
const iso = (d: string, end = false) => (end ? endOfDay(new Date(d)) : startOfDay(new Date(d))).toISOString();

// ─── Visits report (Reception & Triage) ───────────────────────────
interface VisitRow {
  _id: string; date: string; ticket: string; name: string; opd: string; idNo: string; phone: string; email: string;
  gender: string; dob: string; age: number | null; nationality: string; patientType: string; admissionNo: string; payrollNo: string;
  insuranceProvider: string; insuranceNo: string; category: string; paymentMode: string; stage: string;
  kinName: string; kinPhone: string; missing: boolean;
  bp: string; temp: string; weight: string; height: string; bmi: string; urgency: string; complaint: string;
}

/** Gender is shown as "Male" / "Female"; a missing value is shown as "Not recorded" so the gap is visible. */
export const NOT_RECORDED = "Not recorded";
export const genderLabel = (g?: string | null) => {
  const x = (g || "").trim().toLowerCase();
  return x === "male" || x === "m" ? "Male" : x === "female" || x === "f" ? "Female" : NOT_RECORDED;
};

export function VisitsReport({ variant = "reception" }: { variant?: "reception" | "triage" }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [gender, setGender] = useState("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [category, setCategory] = useState("all");
  const [patientType, setPatientType] = useState("all");
  const [payment, setPayment] = useState("all");
  const [missingOnly, setMissingOnly] = useState("all");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: tickets, error } = await supabase
        .from("tickets")
        .select("id, ticket_number, created_at, status, workflow_stage, payment_mode, patient_id, patients!inner(id, patient_id, national_id, patient_type, visit_reason, email, nationality, admission_number, payroll_number, insurance_provider, insurance_number, next_of_kin_name, next_of_kin_phone, profiles!inner(full_name, gender, date_of_birth, phone, email))")
        .gte("created_at", iso(from)).lte("created_at", iso(to, true))
        .order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const patientIds = [...new Set((tickets || []).map((t: any) => t.patient_id))];

      const [admRes, vitRes] = await Promise.all([
        patientIds.length
          ? supabase.from("admissions").select("patient_id, admitted_at, discharged_at").in("patient_id", patientIds).lte("admitted_at", iso(to, true))
          : Promise.resolve({ data: [] as any[] }),
        variant === "triage" && patientIds.length
          ? supabase.from("vitals").select("patient_id, recorded_at, blood_pressure_systolic, blood_pressure_diastolic, temperature, weight, height, bmi, urgency_priority, presenting_complaint").in("patient_id", patientIds).gte("recorded_at", iso(from)).lte("recorded_at", iso(to, true)).order("recorded_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const admissions = (admRes.data || []) as any[];
      const vitals = (vitRes.data || []) as any[];

      setRows((tickets || []).map((t: any) => {
        const p = t.patients; const prof = p?.profiles || {};
        const day = t.created_at?.slice(0, 10);
        const inpatient = admissions.some((a) => a.patient_id === t.patient_id && a.admitted_at?.slice(0, 10) <= day && (!a.discharged_at || a.discharged_at.slice(0, 10) >= day));
        const v = vitals.find((x) => x.patient_id === t.patient_id && x.recorded_at?.slice(0, 10) === day);
        return {
          _id: t.id,
          date: t.created_at,
          ticket: t.ticket_number,
          name: prof.full_name || "",
          opd: p?.patient_id || "",
          idNo: p?.national_id || "",
          phone: prof.phone || "",
          email: p?.email || prof.email || "",
          gender: genderLabel(prof.gender),
          dob: prof.date_of_birth || "",
          age: calculateAgeYears(prof.date_of_birth),
          nationality: p?.nationality || "",
          patientType: (p?.patient_type || "outsider").replace("cuea_", "").replace(/^\w/, (c: string) => c.toUpperCase()),
          admissionNo: p?.patient_type === "cuea_student" ? p?.admission_number || "" : "",
          payrollNo: p?.patient_type === "cuea_staff" ? p?.payroll_number || "" : "",
          insuranceProvider: p?.insurance_provider || "",
          insuranceNo: p?.insurance_number || "",
          kinName: p?.next_of_kin_name || "",
          kinPhone: p?.next_of_kin_phone || "",
          missing: genderLabel(prof.gender) === NOT_RECORDED || !prof.date_of_birth || !prof.phone,
          category: inpatient ? "Inpatient" : p?.visit_reason === "dental" ? "Dental (Outpatient)" : "Outpatient",
          paymentMode: paymentModeLabel(t.payment_mode),
          stage: stageLabel(t.workflow_stage || t.status),
          bp: v?.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic ?? "-"}` : "",
          temp: v?.temperature != null ? String(v.temperature) : "",
          weight: v?.weight != null ? String(v.weight) : "",
          height: v?.height != null ? String(v.height) : "",
          bmi: v?.bmi != null ? String(v.bmi) : "",
          urgency: v?.urgency_priority === 3 ? "Emergency" : v?.urgency_priority === 2 ? "High" : v ? "Normal" : "",
          complaint: v?.presenting_complaint || "",
        };
      }));
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => rows.filter((r) => {
    if (gender !== "all" && (gender === "not_recorded" ? r.gender !== NOT_RECORDED : r.gender.toLowerCase() !== gender)) return false;
    if (missingOnly === "missing" && !r.missing) return false;
    if (minAge && (r.age == null || r.age < Number(minAge))) return false;
    if (maxAge && (r.age == null || r.age > Number(maxAge))) return false;
    if (category === "inpatient" && r.category !== "Inpatient") return false;
    if (category === "outpatient" && r.category === "Inpatient") return false;
    if (category === "dental" && !r.category.startsWith("Dental")) return false;
    if (patientType !== "all" && r.patientType.toLowerCase() !== patientType) return false;
    if (payment !== "all" && r.paymentMode !== paymentModeLabel(payment)) return false;
    if (text) {
      const s = text.toLowerCase();
      if (![r.name, r.opd, r.idNo, r.phone, r.ticket, r.email, r.admissionNo, r.payrollNo, r.insuranceNo].some((x) => x.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [rows, gender, missingOnly, minAge, maxAge, category, patientType, payment, text]);

  const cols: Col<VisitRow>[] = variant === "reception"
    ? [
        { key: "date", label: "Visit date & time", value: (r) => format(new Date(r.date), "dd MMM yyyy HH:mm") },
        { key: "ticket", label: "Ticket", value: (r) => r.ticket },
        { key: "name", label: "Full name", value: (r) => r.name },
        { key: "opd", label: "OPD No.", value: (r) => r.opd },
        { key: "id", label: "ID / Passport", value: (r) => r.idNo },
        { key: "phone", label: "Phone", value: (r) => r.phone },
        { key: "email", label: "Email", value: (r) => r.email },
        { key: "gender", label: "Gender", value: (r) => r.gender },
        { key: "dob", label: "Date of birth", value: (r) => (r.dob ? format(new Date(r.dob), "dd MMM yyyy") : "") },
        { key: "age", label: "Age", value: (r) => r.age ?? "" },
        { key: "nat", label: "Nationality", value: (r) => r.nationality },
        { key: "type", label: "Patient type", value: (r) => r.patientType },
        { key: "adm", label: "Admission no.", value: (r) => r.admissionNo },
        { key: "pay_no", label: "Payroll no.", value: (r) => r.payrollNo },
        { key: "ins", label: "Insurance provider", value: (r) => r.insuranceProvider },
        { key: "ins_no", label: "Insurance member no.", value: (r) => r.insuranceNo },
        { key: "pay", label: "Payment mode", value: (r) => r.paymentMode },
        { key: "category", label: "In/Out/Dental", value: (r) => r.category },
        { key: "stage", label: "Current station", value: (r) => r.stage },
        { key: "kin", label: "Next of kin", value: (r) => r.kinName },
        { key: "kin_phone", label: "Next of kin phone", value: (r) => r.kinPhone },
      ]
    : [
    { key: "date", label: "Date", value: (r) => format(new Date(r.date), "dd MMM yyyy HH:mm") },
    { key: "ticket", label: "Ticket", value: (r) => r.ticket },
    { key: "name", label: "Patient", value: (r) => r.name },
    { key: "opd", label: "OPD No.", value: (r) => r.opd },
    { key: "gender", label: "Gender", value: (r) => r.gender },
    { key: "age", label: "Age", value: (r) => r.age ?? "" },
    { key: "type", label: "Patient type", value: (r) => r.patientType },
    { key: "category", label: "In/Outpatient", value: (r) => r.category },
    { key: "pay", label: "Payment mode", value: (r) => r.paymentMode },
    ...(variant === "triage"
      ? [
          { key: "bp", label: "BP", value: (r: VisitRow) => r.bp },
          { key: "temp", label: "Temp °C", value: (r: VisitRow) => r.temp },
          { key: "wt", label: "Wt kg", value: (r: VisitRow) => r.weight },
          { key: "ht", label: "Ht cm", value: (r: VisitRow) => r.height },
          { key: "bmi", label: "BMI", value: (r: VisitRow) => r.bmi },
          { key: "urg", label: "Urgency", value: (r: VisitRow) => r.urgency },
        ]
      : [{ key: "stage", label: "Current station", value: (r: VisitRow) => r.stage }]),
  ];

  const count = (fn: (r: VisitRow) => boolean) => filtered.filter(fn).length;
  const summary = [
    { label: "Visits", value: filtered.length },
    { label: "Male", value: count((r) => r.gender.toLowerCase() === "male") },
    { label: "Female", value: count((r) => r.gender.toLowerCase() === "female") },
    { label: "Gender not recorded", value: count((r) => r.gender === NOT_RECORDED) },
    { label: "Missing details", value: count((r) => r.missing) },
    { label: "Outpatient", value: count((r) => r.category !== "Inpatient") },
    { label: "Inpatient", value: count((r) => r.category === "Inpatient") },
    { label: "Insurance", value: count((r) => r.paymentMode === "Insurance") },
  ];

  const reset = () => { setGender("all"); setMissingOnly("all"); setMinAge(""); setMaxAge(""); setCategory("all"); setPatientType("all"); setPayment("all"); setText(""); };
  const title = variant === "triage" ? "Triage Report" : "Reception Visits Report";
  const subtitle = `${format(new Date(from), "dd MMM yyyy")} – ${format(new Date(to), "dd MMM yyyy")}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <SimpleSelect label="Gender" value={gender} onChange={setGender} options={[{ value: "all", label: "All" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "not_recorded", label: NOT_RECORDED }]} />
        <SimpleSelect label="Missing details" value={missingOnly} onChange={setMissingOnly} options={[{ value: "all", label: "All" }, { value: "missing", label: "No gender, birth date or phone" }]} />
        <AgeRange min={minAge} max={maxAge} setMin={setMinAge} setMax={setMaxAge} />
        <SimpleSelect label="In/Outpatient" value={category} onChange={setCategory} options={[{ value: "all", label: "All" }, { value: "outpatient", label: "Outpatient" }, { value: "inpatient", label: "Inpatient" }, { value: "dental", label: "Dental" }]} />
        <SimpleSelect label="Patient type" value={patientType} onChange={setPatientType} options={[{ value: "all", label: "All" }, { value: "student", label: "Student" }, { value: "staff", label: "Staff" }, { value: "outsider", label: "Outsider" }]} />
        <SimpleSelect label="Payment mode" value={payment} onChange={setPayment} options={[{ value: "all", label: "All" }, ...PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))]} />
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="h-10 pl-8" placeholder="Name, OPD, ID, phone…" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" /> Clear filters</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => downloadCsv(`${title.replace(/ /g, "_")}_${from}_${to}.csv`, toCsv(filtered, cols))} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1" /> Excel (CSV)
        </Button>
        <Button size="sm" onClick={() => printPdf(title, subtitle, filtered, cols, summary.map((s) => `${s.label}: ${s.value}`))} disabled={!filtered.length}>
          <Printer className="h-4 w-4 mr-1" /> Print / PDF
        </Button>
      </div>
      <Summary items={summary} />
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <ResultsTable rows={filtered} cols={cols} />}
    </div>
  );
}

// ─── Lab report ───────────────────────────────────────────────────
interface LabRow {
  _id: string; date: string; name: string; opd: string; gender: string; age: number | null;
  test: string; result: string; category: ResultCategory; status: string;
  fields: { field_name: string; field_value: string | null; flag: string | null }[];
}

/** The answer a result line counts under: the picked answer(s), or High / Low / Critical / Within range for numbers. */
const answersOf = (test: string, f: { field_name: string; field_value: string | null; flag: string | null }) => {
  const def = (STRUCTURED_FIELDS[test] || []).find((d) => d.name === f.field_name);
  const v = (f.field_value || "").trim();
  if (!def || !v) return v ? [v] : [];
  const kind = fieldKind(def);
  if (kind === "number") return [isCriticalFlag(f.flag) ? "Critical" : f.flag === "H" ? "High" : f.flag === "L" ? "Low" : "Within range"];
  return kind === "multi" ? splitMulti(v) : [v];
};

/** Which way a result's numbers went: any High (H/HH) and/or any Low (L/LL) line on the test. */
const directionOf = (fields: { flag: string | null; field_name?: string }[], only?: string) => {
  const fs = only && only !== "all" ? fields.filter((f) => f.field_name === only) : fields;
  return { high: fs.some((f) => f.flag === "H" || f.flag === "HH"), low: fs.some((f) => f.flag === "L" || f.flag === "LL") };
};

export function LabReport() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [test, setTest] = useState("all");
  const [result, setResult] = useState("all");
  const [param, setParam] = useState("all");
  const [answer, setAnswer] = useState("all");
  const [level, setLevel] = useState<"all" | "high" | "low" | "either">("all");
  const [gender, setGender] = useState("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [text, setText] = useState("");
  const [tests, setTests] = useState<{ id: string; test_name: string }[]>([]);
  const [rows, setRows] = useState<LabRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("lab_tests_catalog").select("id, test_name").order("test_name").then(({ data }) => setTests(data || []));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("lab_orders")
        .select("id, created_at, status, result_value, flag, rejection_reason, test_id, lab_tests_catalog(test_name), patients!inner(patient_id, profiles!inner(full_name, gender, date_of_birth)), lab_result_fields(field_name, field_value, flag, sort_order)")
        .gte("created_at", iso(from)).lte("created_at", iso(to, true))
        .order("created_at", { ascending: false }).limit(3000);
      if (error) throw error;
      setRows((data || []).map((o: any) => {
        const fields = ((o.lab_result_fields || []) as any[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const testName = o.lab_tests_catalog?.test_name || "";
        const abnormalFields = fields.filter((f) => flagLabel(f.flag)).map((f) => `${f.field_name} ${f.field_value} (${flagLabel(f.flag).replace(/[↑↓]/g, "").trim()})`);
        const resultText = o.status === "rejected" ? `Sample rejected: ${o.rejection_reason || ""}`
          : o.status !== "completed" ? "Pending"
          : fields.length && isPanelTest(testName) ? (abnormalFields.length ? abnormalFields.join("; ") : "Within range")
          : (o.result_value || "");
        return {
          _id: o.id,
          date: o.created_at,
          name: o.patients?.profiles?.full_name || "",
          opd: o.patients?.patient_id || "",
          gender: genderLabel(o.patients?.profiles?.gender),
          age: calculateAgeYears(o.patients?.profiles?.date_of_birth),
          test: o.lab_tests_catalog?.test_name || "",
          result: resultText,
          category: resultCategory(o),
          status: o.status || "pending",
          fields,
        };
      }));
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => rows.filter((r) => {
    if (test !== "all" && r.test !== test) return false;
    if (result !== "all" && r.category !== result) return false;
    if (param !== "all") {
      const f = r.fields.find((x) => x.field_name === param);
      if (!f) return false;
      if (answer !== "all" && !answersOf(r.test, f).includes(answer)) return false;
    }
    if (level !== "all") {
      // Follows the chosen parameter when there is one (e.g. only HGB), otherwise any line on the test
      const d = directionOf(r.fields, param);
      if (level === "high" ? !d.high : level === "low" ? !d.low : !(d.high || d.low)) return false;
    }
    if (gender !== "all" && (gender === "not_recorded" ? r.gender !== NOT_RECORDED : r.gender.toLowerCase() !== gender)) return false;
    if (minAge && (r.age == null || r.age < Number(minAge))) return false;
    if (maxAge && (r.age == null || r.age > Number(maxAge))) return false;
    if (text) {
      const s = text.toLowerCase();
      if (![r.name, r.opd, r.test, r.result].some((x) => x.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [rows, test, result, param, answer, level, gender, minAge, maxAge, text]);

  // Parameter / answer filters follow the chosen test's answer list
  const paramDefs = test !== "all" ? STRUCTURED_FIELDS[test] || [] : [];
  const paramDef = paramDefs.find((d) => d.name === param);
  const answerOptions = paramDef ? (fieldKind(paramDef) === "number" ? ["Within range", "High", "Low", "Critical"] : paramDef.options || []) : [];
  useEffect(() => { setParam("all"); setAnswer("all"); }, [test]);
  useEffect(() => { setAnswer("all"); }, [param]);

  const breakdown = useMemo(() => answerBreakdown(filtered.map((r) => ({ test: r.test, status: r.status, fields: r.fields }))), [filtered]);
  const breakdownRows = useMemo(() => [...breakdown.entries()].flatMap(([key, m]) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([ans, n]) => ({ key, ans, n }))), [breakdown]);

  const cols: Col<LabRow>[] = [
    { key: "date", label: "Date", value: (r) => format(new Date(r.date), "dd MMM yyyy HH:mm") },
    { key: "name", label: "Patient", value: (r) => r.name },
    { key: "opd", label: "OPD No.", value: (r) => r.opd },
    { key: "gender", label: "Gender", value: (r) => r.gender },
    { key: "age", label: "Age", value: (r) => r.age ?? "" },
    { key: "test", label: "Test", value: (r) => r.test },
    { key: "result", label: "Result", value: (r) => r.result },
    { key: "cat", label: "Outcome", value: (r) => RESULT_CATEGORY_LABELS[r.category] },
  ];

  const by = (c: ResultCategory) => filtered.filter((r) => r.category === c).length;
  const summary = [
    { label: "Tests", value: filtered.length },
    { label: "Patients", value: new Set(filtered.map((r) => r.opd)).size },
    { label: "Positive", value: by("positive") },
    { label: "Negative", value: by("negative") },
    { label: "Abnormal", value: by("abnormal") },
    { label: "High", value: filtered.filter((r) => directionOf(r.fields, param).high).length },
    { label: "Low", value: filtered.filter((r) => directionOf(r.fields, param).low).length },
    { label: "Critical", value: by("critical") },
    { label: "Rejected", value: by("rejected") },
    { label: "Pending", value: by("pending") },
  ];

  const topTests = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => m.set(r.test, (m.get(r.test) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  const reset = () => { setTest("all"); setResult("all"); setParam("all"); setAnswer("all"); setLevel("all"); setGender("all"); setMinAge(""); setMaxAge(""); setText(""); };
  const subtitle = `${format(new Date(from), "dd MMM yyyy")} – ${format(new Date(to), "dd MMM yyyy")}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <SimpleSelect label="Test" value={test} onChange={setTest} options={[{ value: "all", label: "All tests" }, ...tests.map((t) => ({ value: t.test_name, label: t.test_name }))]} />
        <SimpleSelect label="High / Low" value={level} onChange={(v) => setLevel(v as typeof level)} options={[
          { value: "all", label: "Any" }, { value: "high", label: "High (↑)" }, { value: "low", label: "Low (↓)" }, { value: "either", label: "High or low" },
        ]} />
        <SimpleSelect label="Result" value={result} onChange={setResult} options={[{ value: "all", label: "All results" }, ...(Object.keys(RESULT_CATEGORY_LABELS) as ResultCategory[]).map((k) => ({ value: k, label: RESULT_CATEGORY_LABELS[k] }))]} />
        {paramDefs.length > 0 && (
          <SimpleSelect label="Parameter" value={param} onChange={setParam} options={[{ value: "all", label: "Any parameter" }, ...paramDefs.map((d) => ({ value: d.name, label: d.name }))]} />
        )}
        {answerOptions.length > 0 && (
          <SimpleSelect label="Answer" value={answer} onChange={setAnswer} options={[{ value: "all", label: "Any answer" }, ...answerOptions.map((a) => ({ value: a, label: a }))]} />
        )}
        <SimpleSelect label="Gender" value={gender} onChange={setGender} options={[{ value: "all", label: "All" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
        <AgeRange min={minAge} max={maxAge} setMin={setMinAge} setMax={setMaxAge} />
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="h-10 pl-8" placeholder="Name, OPD, test, result…" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" /> Clear filters</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => downloadCsv(`Lab_Report_${from}_${to}.csv`, toCsv(filtered, cols))} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1" /> Excel (CSV)
        </Button>
        <Button size="sm" onClick={() => printPdf("Laboratory Report", subtitle, filtered, cols, summary.map((s) => `${s.label}: ${s.value}`))} disabled={!filtered.length}>
          <Printer className="h-4 w-4 mr-1" /> Print / PDF
        </Button>
      </div>
      <Summary items={summary} />
      {topTests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topTests.map(([name, n]) => (
            <Badge key={name} variant="outline" className="cursor-pointer" onClick={() => setTest(name)}>{name}: {n}</Badge>
          ))}
        </div>
      )}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <ResultsTable rows={filtered} cols={cols} />}
      {breakdownRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-sm">Results by answer <span className="text-muted-foreground font-normal">— how often each answer was given (completed tests in this list)</span></p>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`Lab_Answers_${from}_${to}.csv`, toCsv(breakdownRows.map((r, i) => ({ ...r, _id: String(i) })), [
              { key: "test", label: "Test › Parameter", value: (r) => r.key },
              { key: "ans", label: "Answer", value: (r) => r.ans },
              { key: "n", label: "Count", value: (r) => r.n },
            ]))}>
              <Download className="h-4 w-4 mr-1" /> Answer counts (CSV)
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {[...breakdown.entries()].map(([key, m]) => (
              <div key={key} className="rounded-md border p-2">
                <p className="text-xs font-semibold mb-1">{key}</p>
                <div className="flex flex-wrap gap-1">
                  {[...m.entries()].sort((a, b) => b[1] - a[1]).map(([ans, n]) => (
                    <Badge key={ans} variant="outline" className="font-normal">{ans}: <span className="font-bold ml-1">{n}</span></Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dialog wrapper so any station can open its report ────────────
export function ReportsButton({ kind, label = "Reports" }: { kind: "reception" | "triage" | "lab"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <BarChart3 className="h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[96vw] xl:max-w-7xl max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> {kind === "lab" ? "Laboratory Reports" : kind === "triage" ? "Triage Reports" : "Reception Reports"}</DialogTitle>
            <DialogDescription>Filter, then print or download for Excel.</DialogDescription>
          </DialogHeader>
          {open && (kind === "lab" ? <LabReport /> : <VisitsReport variant={kind} />)}
        </DialogContent>
      </Dialog>
    </>
  );
}
