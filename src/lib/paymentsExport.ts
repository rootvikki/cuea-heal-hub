import * as XLSX from "xlsx";
import { METHODS, PATIENT_TYPES, PAYMENT_MODES, type GroupBy, type PaymentRow } from "./paymentsQuery";

export const DETAIL_HEADERS = [
  "Date", "Time", "Receipt / Ref", "Patient", "OPD No.", "Phone", "Patient Type", "Admission / Staff No.",
  "Invoice No.", "Ticket No.", "Department", "Visit Payment Mode", "Method", "Status", "Received By", "Amount (KES)",
] as const;

export const detailValues = (r: PaymentRow) => [
  r.date, r.time, r.receipt, r.patient, r.opd, r.phone, PATIENT_TYPES[r.patientType] || "Unknown", r.memberNo,
  r.invoice, r.ticket, r.department, PAYMENT_MODES[r.paymentMode] || r.paymentMode, METHODS[r.method] || r.method, r.status, r.receivedBy, r.amount,
];

export type MpesaAttempt = { at: string; phone: string; amount: number; status: string; receipt: string; invoice: string; reason: string };

export function buildPaymentsCSV(rows: PaymentRow[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const blank = Array(DETAIL_HEADERS.length - 2).fill("");
  return [[...DETAIL_HEADERS], ...rows.map(detailValues), [], [...blank, "TOTAL", total]].map((r) => r.map(esc).join(",")).join("\r\n");
}

const AMT = "#,##0.00;(#,##0.00);-";
/** Excel date serial for a YYYY-MM-DD day (avoids time-zone drift when writing JS dates). */
const ymdToSerial = (s: string) => { const [y, m, d] = s.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const dateCell = (s: string, z = "dd/mm/yyyy") => ({ t: "n", v: ymdToSerial(s), z });

/**
 * Excel workbook. Every total and group sheet is a live formula over the "Payments" sheet,
 * so finance staff can edit / filter rows in Excel and the summaries update.
 */
export function buildPaymentsWorkbook(rows: PaymentRow[], meta: { filters: string[]; groupBy: GroupBy; mpesa?: MpesaAttempt[] }): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const n = rows.length;
  const last = n + 1; // last data row on the Payments sheet
  const col = (c: string) => `Payments!$${c}$2:$${c}$${Math.max(last, 2)}`;

  // ── Payments (detail) ──
  const details = XLSX.utils.aoa_to_sheet(
    [[...DETAIL_HEADERS], ...rows.map((r) => { const v: unknown[] = detailValues(r); v[0] = dateCell(r.date); return v; })],
  );
  for (let i = 2; i <= last; i++) if (details[`P${i}`]) details[`P${i}`].z = AMT;
  XLSX.utils.sheet_add_aoa(details, [["TOTAL", { t: "n", f: `SUM(P2:P${last})`, z: AMT }]], { origin: `O${n + 3}` });
  details["!cols"] = [12, 7, 16, 26, 14, 15, 14, 18, 14, 12, 14, 18, 16, 11, 22, 14].map((w) => ({ wch: w }));
  details["!autofilter"] = { ref: `A1:P${Math.max(last, 1)}` };

  // ── Summary ──
  const summaryRows: unknown[][] = [
    ["CUEA Infirmary — Patient Payments Report"], [],
    ...meta.filters.map((f) => [f]),
    [`Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} (Nairobi time)`], [],
    ["Measure", "Value"],
    ["Total collected (KES)", { t: "n", f: `SUM(${col("P")})`, z: AMT }],
    ["Number of payments", { t: "n", f: `COUNT(${col("P")})` }],
    ["Average payment (KES)", { t: "n", f: `IF(COUNT(${col("P")})=0,0,AVERAGE(${col("P")}))`, z: AMT }],
    ["Largest payment (KES)", { t: "n", f: `IF(COUNT(${col("P")})=0,0,MAX(${col("P")}))`, z: AMT }],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 60 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, details, "Payments");

  // ── Group sheets (SUMIFS / COUNTIFS over the Payments sheet) ──
  const groupSheet = (name: string, title: string, letter: string, keys: string[]) => {
    const aoa: unknown[][] = [[title, "Payments", "Amount (KES)", "Share of total"]];
    keys.forEach((k, i) => {
      const r = i + 2;
      aoa.push([k, { t: "n", f: `COUNTIFS(${col(letter)},A${r})` }, { t: "n", f: `SUMIFS(${col("P")},${col(letter)},A${r})`, z: AMT },
        { t: "n", f: `IF(SUM(${col("P")})=0,0,C${r}/SUM(${col("P")}))`, z: "0.0%" }]);
    });
    const t = keys.length + 2;
    aoa.push(["TOTAL", { t: "n", f: `SUM(B2:B${t - 1})` }, { t: "n", f: `SUM(C2:C${t - 1})`, z: AMT }, { t: "n", f: `IF(SUM(${col("P")})=0,0,C${t}/SUM(${col("P")}))`, z: "0.0%" }]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
  const sheetCols = detailValues; // reuse labels exactly as written in the Payments sheet
  const labelsAt = (idx: number) => uniq(rows.map((r) => String(sheetCols(r)[idx])));

  // By day (date ranges so the real dates in column A match)
  const days = uniq(rows.map((r) => r.date));
  const dayAoa: unknown[][] = [["Day", "Payments", "Amount (KES)"]];
  days.forEach((d, i) => {
    const r = i + 2;
    dayAoa.push([dateCell(d, "ddd dd/mm/yyyy"), { t: "n", f: `COUNTIFS(${col("A")},A${r})` }, { t: "n", f: `SUMIFS(${col("P")},${col("A")},A${r})`, z: AMT }]);
  });
  dayAoa.push(["TOTAL", { t: "n", f: `SUM(B2:B${days.length + 1})` }, { t: "n", f: `SUM(C2:C${days.length + 1})`, z: AMT }]);
  const dayWs = XLSX.utils.aoa_to_sheet(dayAoa);
  dayWs["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, dayWs, "By day");

  groupSheet("By method", "Payment method", "M", labelsAt(12));
  groupSheet("By patient type", "Patient type", "G", labelsAt(6));
  groupSheet("By received by", "Received by", "O", labelsAt(14));
  groupSheet("By department", "Department", "K", labelsAt(10));
  if (meta.groupBy === "patient") groupSheet("By patient", "OPD No.", "E", labelsAt(4));
  if (meta.groupBy === "paymentMode") groupSheet("By payment mode", "Visit payment mode", "L", labelsAt(11));

  // ── M-Pesa prompts (every attempt, for reconciliation) ──
  if (meta.mpesa) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date & time (Nairobi)", "Phone", "Invoice No.", "Amount (KES)", "Status", "M-Pesa Receipt", "Reason"],
      ...meta.mpesa.map((m) => [m.at, m.phone, m.invoice, m.amount, m.status, m.receipt, m.reason]),
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 16 }, { wch: 60 }];
    ws["!autofilter"] = { ref: `A1:G${meta.mpesa.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws, "M-Pesa prompts");
  }
  return wb;
}
