/** Pure helpers for the Payments report: Nairobi dates, normalising rows, filtering and grouping. */

export const TZ = "Africa/Nairobi";

export const PATIENT_TYPES: Record<string, string> = { cuea_staff: "CUEA Staff", cuea_student: "CUEA Student", outsider: "Outsider" };
export const METHODS: Record<string, string> = {
  mpesa: "M-Pesa", school_fees: "School fees / Staff", insurance: "Insurance", bank_transfer: "Bank Transfer", card: "Card", cash: "Cash (old records)",
};
export const PAYMENT_MODES: Record<string, string> = { mpesa: "M-Pesa / School fees", school_fees: "M-Pesa / School fees", insurance: "Insurance" };

export const PERIODS = ["today", "yesterday", "this_week", "last_7", "this_month", "last_month", "last_30", "this_year", "last_year", "custom"] as const;
export const PERIOD_LABELS: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This week", last_7: "Last 7 days", this_month: "This month",
  last_month: "Last month", last_30: "Last 30 days", this_year: "This year", last_year: "Last year", custom: "Custom dates",
};

/** YYYY-MM-DD and HH:mm of an instant, in Nairobi time. */
export function nairobiParts(d: Date | string): { date: string; time: string } {
  const x = typeof d === "string" ? new Date(d) : d;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(x);
  return { date, time };
}

const shift = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

/** [from, to] (inclusive, Nairobi calendar days) for a preset period. Weeks start on Monday. */
export function rangeFor(period: string, now: Date = new Date()): [string, string] {
  const today = nairobiParts(now).date;
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m)}-01`;
  switch (period) {
    case "today": return [today, today];
    case "yesterday": { const t = shift(today, -1); return [t, t]; }
    case "this_week": { const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; return [shift(today, -dow), today]; }
    case "last_7": return [shift(today, -6), today];
    case "last_30": return [shift(today, -29), today];
    case "last_month": { const lastDay = shift(monthStart, -1); return [`${lastDay.slice(0, 7)}-01`, lastDay]; }
    case "this_year": return [`${y}-01-01`, today];
    case "last_year": return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "this_month":
    default: return [monthStart, today];
  }
}

/** ISO bounds for a database query covering whole Nairobi days. */
export const queryBounds = (from: string, to: string) => [`${from}T00:00:00+03:00`, `${to}T23:59:59.999+03:00`] as const;

export type PaymentRow = {
  id: string;
  at: string;
  date: string;
  time: string;
  receipt: string;
  patient: string;
  opd: string;
  phone: string;
  patientType: string;
  memberNo: string;
  invoice: string;
  ticket: string;
  department: string;
  paymentMode: string;
  method: string;
  status: string;
  receivedById: string | null;
  receivedBy: string;
  amount: number;
};

// deno-lint-ignore no-explicit-any
export function normalisePayment(r: any, staffNames: Record<string, string>): PaymentRow {
  const at = r.paid_at || r.created_at;
  const { date, time } = nairobiParts(at);
  const p = r.patients || {};
  const t = r.invoices?.tickets || {};
  return {
    id: r.id,
    at,
    date,
    time,
    receipt: r.transaction_ref || "-",
    patient: p.profiles?.full_name || "-",
    opd: p.patient_id || "-",
    phone: p.profiles?.phone || "-",
    patientType: p.patient_type || "unknown",
    memberNo: p.admission_number || p.payroll_number || "-",
    invoice: r.invoices?.invoice_number || "-",
    ticket: t.ticket_number || "-",
    department: t.departments?.name || "-",
    paymentMode: t.payment_mode || "-",
    method: r.payment_method || "-",
    status: r.status || "-",
    receivedById: r.received_by || null,
    receivedBy: r.received_by ? staffNames[r.received_by] || "Staff" : r.payment_method === "mpesa" ? "M-Pesa (auto)" : "-",
    amount: Number(r.amount || 0),
  };
}

export type PaymentFilters = {
  patientType: string;
  method: string;
  status: string;
  receivedBy: string; // "all" | "system" | user id
  department: string;
  paymentMode: string;
  minAmount: string;
  maxAmount: string;
  search: string;
};

export const EMPTY_FILTERS: PaymentFilters = {
  patientType: "all", method: "all", status: "all", receivedBy: "all", department: "all", paymentMode: "all", minAmount: "", maxAmount: "", search: "",
};

export function filterPayments(rows: PaymentRow[], f: PaymentFilters): PaymentRow[] {
  const s = f.search.trim().toLowerCase();
  const min = f.minAmount === "" ? null : Number(f.minAmount);
  const max = f.maxAmount === "" ? null : Number(f.maxAmount);
  const modeOf = (m: string) => (m === "insurance" ? "insurance" : m === "-" ? "-" : "mpesa");
  return rows.filter((r) =>
    (f.patientType === "all" || r.patientType === f.patientType) &&
    (f.method === "all" || r.method === f.method) &&
    (f.status === "all" || r.status === f.status) &&
    (f.receivedBy === "all" || (f.receivedBy === "system" ? !r.receivedById : r.receivedById === f.receivedBy)) &&
    (f.department === "all" || r.department === f.department) &&
    (f.paymentMode === "all" || modeOf(r.paymentMode) === f.paymentMode) &&
    (min === null || r.amount >= min) &&
    (max === null || r.amount <= max) &&
    (!s || [r.patient, r.opd, r.receipt, r.invoice, r.ticket, r.phone, r.memberNo].some((v) => v.toLowerCase().includes(s))),
  );
}

export const GROUPS = {
  none: "No grouping",
  day: "Day",
  month: "Month",
  method: "Payment method",
  patientType: "Patient type",
  receivedBy: "Received by",
  department: "Department",
  paymentMode: "Visit payment mode",
  patient: "Patient",
} as const;
export type GroupBy = keyof typeof GROUPS;

export type GroupRow = { key: string; label: string; count: number; total: number };

export function groupLabel(by: GroupBy, r: PaymentRow): [string, string] {
  switch (by) {
    case "day": return [r.date, r.date];
    case "month": return [r.date.slice(0, 7), r.date.slice(0, 7)];
    case "method": return [r.method, METHODS[r.method] || r.method];
    case "patientType": return [r.patientType, PATIENT_TYPES[r.patientType] || "Unknown"];
    case "receivedBy": return [r.receivedBy, r.receivedBy];
    case "department": return [r.department, r.department];
    case "paymentMode": return [r.paymentMode, PAYMENT_MODES[r.paymentMode] || r.paymentMode];
    case "patient": return [r.opd, `${r.patient} (${r.opd})`];
    default: return ["all", "All payments"];
  }
}

export function groupPayments(rows: PaymentRow[], by: GroupBy): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const [key, label] = groupLabel(by, r);
    const g = map.get(key) || { key, label, count: 0, total: 0 };
    g.count += 1; g.total += r.amount;
    map.set(key, g);
  }
  const out = Array.from(map.values());
  return by === "day" || by === "month" ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.total - a.total);
}
