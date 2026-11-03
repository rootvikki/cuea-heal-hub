/** Pure helpers for the Bills and Services-charged reports at the billing desk. */
import { PATIENT_TYPES, PAYMENT_MODES, nairobiParts } from "./paymentsQuery";

export const BILL_STATUSES: Record<string, string> = { pending: "Unpaid", partial: "Part paid", paid: "Paid", refunded: "Refunded", cancelled: "Cancelled" };
export const SERVICE_TYPES: Record<string, string> = {
  consultation: "Consultation", laboratory: "Laboratory", triage: "Triage", nursing: "Nursing", nursing_procedure: "Nursing procedure",
  pharmacy: "Pharmacy", imaging: "Imaging", dental: "Dental", custom: "Added at billing",
};
export const STAGES: Record<string, string> = {
  consultation: "Consultation", laboratory: "Laboratory", triage: "Triage", nursing: "Nursing", pharmacy: "Pharmacy", imaging: "Imaging", dental: "Dental", manual: "Billing desk",
};
export const label = (map: Record<string, string>, k: string) => map[k] || (k && k !== "-" ? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Not recorded");

// ── Bills (invoices) ──
export type BillRow = {
  id: string; date: string; time: string; invoice: string; patient: string; opd: string; phone: string;
  patientType: string; memberNo: string; ticket: string; department: string; paymentMode: string;
  total: number; discount: number; net: number; paid: number; balance: number; status: string; ageDays: number;
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// deno-lint-ignore no-explicit-any
export function normaliseBill(r: any, today = nairobiParts(new Date()).date): BillRow {
  const { date, time } = nairobiParts(r.created_at);
  const p = r.patients || {}, t = r.tickets || {};
  const net = Number(r.net_amount || 0), paid = Number(r.amount_paid || 0);
  const balance = r.balance == null ? Math.max(net - paid, 0) : Number(r.balance);
  return {
    id: r.id, date, time, invoice: r.invoice_number || "-", patient: p.profiles?.full_name || "-", opd: p.patient_id || "-", phone: p.profiles?.phone || "-",
    patientType: p.patient_type || "unknown", memberNo: p.admission_number || p.payroll_number || "-",
    ticket: t.ticket_number || "-", department: t.departments?.name || "-", paymentMode: t.payment_mode || "-",
    total: Number(r.total_amount || 0), discount: Number(r.discount || 0), net, paid, balance,
    status: r.status || "pending", ageDays: Math.max(dayDiff(date, today), 0),
  };
}

export type BillFilters = {
  patientType: string; status: string; paymentMode: string; department: string;
  balance: "all" | "outstanding" | "cleared"; age: "all" | "0-7" | "8-30" | "31+";
  minAmount: string; maxAmount: string; search: string;
};
export const EMPTY_BILL_FILTERS: BillFilters = { patientType: "all", status: "all", paymentMode: "all", department: "all", balance: "all", age: "all", minAmount: "", maxAmount: "", search: "" };

/** Age filters apply to bills that still have a balance (how long they have been unpaid). */
export function filterBills(rows: BillRow[], f: BillFilters): BillRow[] {
  const s = f.search.trim().toLowerCase();
  const min = f.minAmount === "" ? null : Number(f.minAmount), max = f.maxAmount === "" ? null : Number(f.maxAmount);
  return rows.filter((r) =>
    (f.patientType === "all" || r.patientType === f.patientType) &&
    (f.status === "all" || r.status === f.status) &&
    (f.paymentMode === "all" || r.paymentMode === f.paymentMode) &&
    (f.department === "all" || r.department === f.department) &&
    (f.balance === "all" || (f.balance === "outstanding" ? r.balance > 0 : r.balance <= 0)) &&
    (f.age === "all" || (r.balance > 0 && (f.age === "0-7" ? r.ageDays <= 7 : f.age === "8-30" ? r.ageDays >= 8 && r.ageDays <= 30 : r.ageDays > 30))) &&
    (min === null || r.net >= min) && (max === null || r.net <= max) &&
    (!s || [r.patient, r.opd, r.invoice, r.ticket, r.phone, r.memberNo].some((v) => v.toLowerCase().includes(s))),
  );
}

export const BILL_GROUPS = {
  none: "No grouping", day: "Day", month: "Month", status: "Bill status", patientType: "Patient type",
  paymentMode: "Visit payment mode", department: "Department", patient: "Patient",
} as const;
export type BillGroupBy = keyof typeof BILL_GROUPS;

export function billGroupKey(by: BillGroupBy, r: BillRow): [string, string] {
  switch (by) {
    case "day": return [r.date, r.date];
    case "month": return [r.date.slice(0, 7), r.date.slice(0, 7)];
    case "status": return [r.status, label(BILL_STATUSES, r.status)];
    case "patientType": return [r.patientType, PATIENT_TYPES[r.patientType] || "Unknown"];
    case "paymentMode": return [r.paymentMode, PAYMENT_MODES[r.paymentMode] || label({}, r.paymentMode)];
    case "department": return [r.department, r.department];
    case "patient": return [r.opd, `${r.patient} (${r.opd})`];
    default: return ["all", "All bills"];
  }
}

export type BillGroup = { key: string; label: string; count: number; net: number; paid: number; balance: number };
export function groupBills(rows: BillRow[], by: BillGroupBy): BillGroup[] {
  const m = new Map<string, BillGroup>();
  for (const r of rows) {
    const [key, lbl] = billGroupKey(by, r);
    const g = m.get(key) || { key, label: lbl, count: 0, net: 0, paid: 0, balance: 0 };
    g.count++; g.net += r.net; g.paid += r.paid; g.balance += r.balance;
    m.set(key, g);
  }
  const out = [...m.values()];
  return by === "day" || by === "month" ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.net - a.net);
}

export const billTotals = (rows: BillRow[]) => rows.reduce((a, r) => ({
  count: a.count + 1, net: a.net + r.net, paid: a.paid + r.paid, balance: a.balance + r.balance, unpaid: a.unpaid + (r.balance > 0 ? 1 : 0),
}), { count: 0, net: 0, paid: 0, balance: 0, unpaid: 0 });

// ── Services charged (service_charges) ──
export type ChargeRow = {
  id: string; date: string; time: string; patient: string; opd: string; patientType: string; ticket: string;
  department: string; paymentMode: string; serviceType: string; stage: string; description: string; amount: number;
  billed: boolean; invoice: string;
};

// deno-lint-ignore no-explicit-any
export function normaliseCharge(r: any): ChargeRow {
  const { date, time } = nairobiParts(r.created_at);
  const p = r.patients || {}, t = r.tickets || {};
  return {
    id: r.id, date, time, patient: p.profiles?.full_name || "-", opd: p.patient_id || "-", patientType: p.patient_type || "unknown",
    ticket: t.ticket_number || "-", department: t.departments?.name || "-", paymentMode: t.payment_mode || "-",
    serviceType: r.service_type || "-", stage: r.billing_stage || "-", description: (r.description || "-").trim(), amount: Number(r.amount || 0),
    billed: !!r.invoice_id, invoice: r.invoices?.invoice_number || "-",
  };
}

export type ChargeFilters = {
  serviceType: string; stage: string; patientType: string; paymentMode: string; department: string;
  billed: "all" | "billed" | "unbilled"; minAmount: string; maxAmount: string; search: string;
};
export const EMPTY_CHARGE_FILTERS: ChargeFilters = { serviceType: "all", stage: "all", patientType: "all", paymentMode: "all", department: "all", billed: "all", minAmount: "", maxAmount: "", search: "" };

export function filterCharges(rows: ChargeRow[], f: ChargeFilters): ChargeRow[] {
  const s = f.search.trim().toLowerCase();
  const min = f.minAmount === "" ? null : Number(f.minAmount), max = f.maxAmount === "" ? null : Number(f.maxAmount);
  return rows.filter((r) =>
    (f.serviceType === "all" || r.serviceType === f.serviceType) &&
    (f.stage === "all" || r.stage === f.stage) &&
    (f.patientType === "all" || r.patientType === f.patientType) &&
    (f.paymentMode === "all" || r.paymentMode === f.paymentMode) &&
    (f.department === "all" || r.department === f.department) &&
    (f.billed === "all" || (f.billed === "billed" ? r.billed : !r.billed)) &&
    (min === null || r.amount >= min) && (max === null || r.amount <= max) &&
    (!s || [r.patient, r.opd, r.ticket, r.description, r.invoice].some((v) => v.toLowerCase().includes(s))),
  );
}

export const CHARGE_GROUPS = {
  none: "No grouping", service: "Service (item)", serviceType: "Service type", stage: "Station", day: "Day", month: "Month",
  patientType: "Patient type", paymentMode: "Visit payment mode", department: "Department",
} as const;
export type ChargeGroupBy = keyof typeof CHARGE_GROUPS;

export function chargeGroupKey(by: ChargeGroupBy, r: ChargeRow): [string, string] {
  switch (by) {
    case "service": return [r.description.toLowerCase(), r.description];
    case "serviceType": return [r.serviceType, label(SERVICE_TYPES, r.serviceType)];
    case "stage": return [r.stage, label(STAGES, r.stage)];
    case "day": return [r.date, r.date];
    case "month": return [r.date.slice(0, 7), r.date.slice(0, 7)];
    case "patientType": return [r.patientType, PATIENT_TYPES[r.patientType] || "Unknown"];
    case "paymentMode": return [r.paymentMode, PAYMENT_MODES[r.paymentMode] || label({}, r.paymentMode)];
    case "department": return [r.department, r.department];
    default: return ["all", "All services"];
  }
}

export type ChargeGroup = { key: string; label: string; count: number; total: number };
export function groupCharges(rows: ChargeRow[], by: ChargeGroupBy): ChargeGroup[] {
  const m = new Map<string, ChargeGroup>();
  for (const r of rows) {
    const [key, lbl] = chargeGroupKey(by, r);
    const g = m.get(key) || { key, label: lbl, count: 0, total: 0 };
    g.count++; g.total += r.amount;
    m.set(key, g);
  }
  const out = [...m.values()];
  return by === "day" || by === "month" ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.total - a.total);
}
