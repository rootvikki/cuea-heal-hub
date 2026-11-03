import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawInfirmaryLetterhead } from "./letterhead";

/** Generic report exports (CSV, Excel with live formulas, branded PDF) for table-shaped reports. */
export type Col = { header: string; kind?: "text" | "date" | "money" | "int"; sum?: boolean; pdf?: boolean };

const AMT = "#,##0.00";
const ymdToSerial = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const money = (n: number) => Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (s: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split("-").reverse().join("/") : s);

export function tableCsv(cols: Col[], rows: unknown[][]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const totals = cols.map((c, i) => (c.sum ? rows.reduce((a, r) => a + Number(r[i] || 0), 0) : i === 0 ? "TOTAL" : ""));
  const out = [cols.map((c) => c.header), ...rows];
  if (cols.some((c) => c.sum)) out.push([], totals);
  return out.map((r) => r.map(esc).join(",")).join("\r\n");
}

/**
 * Detail sheet + one summary sheet per grouping column. Totals and summaries are SUM / SUMIF / COUNTIF
 * formulas over the detail sheet, so staff can edit or filter rows in Excel and every total follows.
 */
export function tableWorkbook(opts: { sheet: string; cols: Col[]; rows: unknown[][]; groupBy?: number[]; filters: string[]; title: string }): XLSX.WorkBook {
  const { sheet, cols, rows } = opts;
  const wb = XLSX.utils.book_new();
  const last = rows.length + 1;
  const L = (i: number) => XLSX.utils.encode_col(i);
  const cell = (c: Col, v: unknown) => {
    if (c.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return { t: "n", v: ymdToSerial(v), z: "dd/mm/yyyy" };
    if (c.kind === "money") return { t: "n", v: Number(v || 0), z: AMT };
    if (c.kind === "int") return { t: "n", v: Number(v || 0) };
    return v ?? "";
  };
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), ...rows.map((r) => r.map((v, i) => cell(cols[i], v)))]);
  if (rows.length && cols.some((c) => c.sum)) {
    XLSX.utils.sheet_add_aoa(ws, [cols.map((c, i) => (c.sum ? { t: "n", f: `SUM(${L(i)}2:${L(i)}${last})`, z: c.kind === "money" ? AMT : undefined } : i === 0 ? "TOTAL" : ""))], { origin: `A${last + 2}` });
  }
  ws["!cols"] = cols.map((c) => ({ wch: c.kind === "date" ? 11 : c.kind === "money" ? 14 : Math.min(Math.max(c.header.length + 2, 12), 30) }));
  ws["!autofilter"] = { ref: `A1:${L(cols.length - 1)}${Math.max(last, 1)}` };
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));

  const rng = (i: number) => `'${sheet}'!$${L(i)}$2:$${L(i)}$${Math.max(last, 2)}`;
  const sumCols = cols.map((c, i) => (c.sum ? i : -1)).filter((i) => i >= 0);
  for (const g of opts.groupBy || []) {
    const keys = [...new Set(rows.map((r) => String(r[g] ?? "")))].sort();
    const head = [cols[g].header, "Count", ...sumCols.map((i) => cols[i].header)];
    const body = keys.map((k, n) => {
      const r = n + 2;
      const key = cell(cols[g], k);
      return [key, { t: "n", f: `COUNTIF(${rng(g)},A${r})` }, ...sumCols.map((i) => ({ t: "n", f: `SUMIF(${rng(g)},A${r},${rng(i)})`, z: cols[i].kind === "money" ? AMT : undefined }))];
    });
    const end = keys.length + 1;
    const foot = ["TOTAL", { t: "n", f: `SUM(B2:B${end})` }, ...sumCols.map((i, n) => ({ t: "n", f: `SUM(${L(n + 2)}2:${L(n + 2)}${end})`, z: cols[i].kind === "money" ? AMT : undefined }))];
    const gs = XLSX.utils.aoa_to_sheet([head, ...body, foot]);
    gs["!cols"] = head.map((h, i) => ({ wch: i === 0 ? 30 : 14 }));
    XLSX.utils.book_append_sheet(wb, gs, `By ${cols[g].header}`.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  const info = XLSX.utils.aoa_to_sheet([[`CUEA Infirmary — ${opts.title}`], [`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}`], [], ["Filters"], ...opts.filters.map((f) => [f])]);
  info["!cols"] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, info, "Filters");
  return wb;
}

/** Landscape PDF on the official letterhead: summary line, optional group table, detail table with totals, sign-off. */
export async function tablePdf(opts: {
  title: string; cols: Col[]; rows: unknown[][]; filters: string[]; summary: string[]; preparedBy?: string;
  group?: { head: string[]; body: unknown[][]; moneyFrom: number };
}): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const maroon: [number, number, number] = [128, 0, 32], orange: [number, number, number] = [230, 126, 34];
  let y = await drawInfirmaryLetterhead(doc, { title: opts.title });
  doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text(opts.filters.join("   |   "), W / 2, y, { align: "center", maxWidth: W - 24 });
  y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text(opts.summary.join("     "), 12, y, { maxWidth: W - 24 });
  y += 3;
  // deno-lint-ignore no-explicit-any
  const lastY = () => (doc as any).lastAutoTable.finalY as number;
  if (opts.group) {
    autoTable(doc, {
      head: [opts.group.head], body: opts.group.body.map((r) => r.map((v, i) => (i >= opts.group!.moneyFrom ? money(Number(v)) : v))) as any,
      startY: y + 2, margin: { left: 12, right: W / 2 }, styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: maroon },
    });
    y = lastY() + 3;
  }
  const idx = opts.cols.map((c, i) => (c.pdf === false ? -1 : i)).filter((i) => i >= 0);
  const show = (c: Col, v: unknown) => (c.kind === "money" ? money(Number(v)) : c.kind === "date" ? ddmm(String(v ?? "")) : String(v ?? ""));
  const hasSum = idx.some((i) => opts.cols[i].sum);
  autoTable(doc, {
    head: [idx.map((i) => opts.cols[i].header)],
    body: opts.rows.map((r) => idx.map((i) => show(opts.cols[i], r[i]))),
    foot: hasSum ? [idx.map((i, n) => (opts.cols[i].sum ? show(opts.cols[i], opts.rows.reduce((a, r) => a + Number(r[i] || 0), 0)) : n === 0 ? "TOTAL" : ""))] : undefined,
    startY: y + 3, styles: { fontSize: 7, cellPadding: 1.2 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
    columnStyles: Object.fromEntries(idx.map((i, n) => [n, opts.cols[i].kind === "money" || opts.cols[i].kind === "int" ? { halign: "right" } : {}])),
    alternateRowStyles: { fillColor: [250, 245, 240] }, margin: { left: 10, right: 10, bottom: 20 }, showFoot: "lastPage",
  });
  let end = lastY() + 12;
  if (end > H - 25) { doc.addPage(); end = 25; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Prepared by: ${opts.preparedBy || "______________________"}`, 12, end);
  doc.text("Signature: ______________________", 110, end);
  doc.text("Checked by (Finance): ______________________", 190, end);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`CUEA Infirmary  |  Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}  |  Page ${i} of ${pages}`, W / 2, H - 8, { align: "center" });
  }
  return doc;
}
