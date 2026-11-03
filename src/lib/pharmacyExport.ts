import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawInfirmaryLetterhead } from "./letterhead";
import { EXPIRY_LABEL, MOVE_LABEL, STOCK_STATUS_LABEL, expiryBucket, moveType, nairobiToday, stockStatus, stockValue, type InvItem, type MoveRow } from "./pharmacyReport";

export interface MoveView extends MoveRow { drug: string; strength: string; recordedBy: string }

const money = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (ymd?: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "");
const ymdToSerial = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const dateCell = (s?: string | null) => (s ? { t: "n", v: ymdToSerial(s), z: "dd/mm/yyyy" } : "");
const AMT = "#,##0.00";

export const STOCK_HEADERS = ["Drug", "Generic name", "Form", "Strength", "Package", "Category", "Batch #", "Expiry", "Expiry status",
  "Qty in stock", "Reorder level", "Min", "Max", "Stock status", "Selling price (KES)", "Insurance price (KES)", "Stock value (KES)"] as const;

const stockValues = (i: InvItem, today: string) => [
  i.drug_name, i.generic_name || "", i.formulation || "", i.strength_size || "", i.package || "", i.category || "", i.batch_number || "",
  i.expiry_date || "", EXPIRY_LABEL[expiryBucket(i.expiry_date, today)], i.quantity, i.reorder_level ?? "", i.minimum_stock ?? "", i.maximum_stock ?? "",
  STOCK_STATUS_LABEL[stockStatus(i)], Number(i.unit_price) || 0, i.insurance_price ?? "", stockValue(i),
];

export const MOVE_HEADERS = ["Date", "Drug", "Strength", "Type", "Received from / Issued to", "Invoice / Ref", "Qty received", "Qty issued", "Balance", "Unit price (KES)", "Issued value (KES)", "Recorded by"] as const;
const moveValues = (r: MoveView) => [
  r.transaction_date, r.drug, r.strength, MOVE_LABEL[moveType(r)], r.received_from || r.issued_to || "", r.invoice_ref || "",
  r.qty_received || 0, r.qty_issued || 0, r.balance ?? "", Number(r.unit_price) || 0, (r.qty_issued || 0) * (Number(r.unit_price) || 0), r.recordedBy,
];

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const stockCsv = (items: InvItem[], today = nairobiToday()) =>
  [[...STOCK_HEADERS], ...items.map((i) => stockValues(i, today))].map((r) => r.map(esc).join(",")).join("\r\n");
export const movesCsv = (rows: MoveView[]) =>
  [[...MOVE_HEADERS], ...rows.map(moveValues)].map((r) => r.map(esc).join(",")).join("\r\n");

const colLetter = (i: number) => XLSX.utils.encode_col(i);

/** Workbook with live formulas: stock value per row = qty × price, totals and per-category sums reference the detail sheet. */
export function buildPharmacyWorkbook(items: InvItem[], moves: MoveView[] | null, filters: string[], today = nairobiToday()): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const n = items.length, last = n + 1;
  const qtyC = colLetter(9), priceC = colLetter(14), valueC = colLetter(16), catC = colLetter(5);
  const rows = items.map((i, idx) => {
    const v: unknown[] = stockValues(i, today);
    v[7] = dateCell(i.expiry_date);
    v[16] = { t: "n", f: `${qtyC}${idx + 2}*${priceC}${idx + 2}`, z: AMT };
    return v;
  });
  const ws = XLSX.utils.aoa_to_sheet([[...STOCK_HEADERS], ...rows]);
  if (n) XLSX.utils.sheet_add_aoa(ws, [["TOTAL", "", "", "", "", "", "", "", "", { t: "n", f: `SUM(${qtyC}2:${qtyC}${last})` }, "", "", "", "", "", "", { t: "n", f: `SUM(${valueC}2:${valueC}${last})`, z: AMT }]], { origin: `A${last + 2}` });
  ws["!cols"] = [28, 22, 8, 12, 10, 18, 12, 11, 22, 10, 10, 8, 8, 20, 14, 14, 16].map((w) => ({ wch: w }));
  ws["!autofilter"] = { ref: `A1:${valueC}${Math.max(last, 1)}` };
  XLSX.utils.book_append_sheet(wb, ws, "Stock");

  // By category — SUMIF formulas over the Stock sheet
  const cats = [...new Set(items.map((i) => i.category || ""))].sort();
  const rng = (c: string) => `Stock!$${c}$2:$${c}$${Math.max(last, 2)}`;
  const catRows = cats.map((c, i) => [c || "(no category)",
    { t: "n", f: `COUNTIF(${rng(catC)},A${i + 2})` },
    { t: "n", f: `SUMIF(${rng(catC)},A${i + 2},${rng(qtyC)})` },
    { t: "n", f: `SUMIF(${rng(catC)},A${i + 2},${rng(valueC)})`, z: AMT }]);
  const cs = XLSX.utils.aoa_to_sheet([["Category", "Items", "Units", "Stock value (KES)"], ...catRows,
    ["TOTAL", { t: "n", f: `SUM(B2:B${cats.length + 1})` }, { t: "n", f: `SUM(C2:C${cats.length + 1})` }, { t: "n", f: `SUM(D2:D${cats.length + 1})`, z: AMT }]]);
  // the "(no category)" label doesn't match blank cells — count those with the blank criterion
  cats.forEach((c, i) => {
    if (c) return;
    const r = i + 2;
    cs[`B${r}`] = { t: "n", f: `COUNTBLANK(${rng(catC)})` };
    cs[`C${r}`] = { t: "n", f: `SUMIF(${rng(catC)},"",${rng(qtyC)})` };
    cs[`D${r}`] = { t: "n", f: `SUMIF(${rng(catC)},"",${rng(valueC)})`, z: AMT };
  });
  cs["!cols"] = [{ wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, cs, "By category");

  if (moves) {
    const m = moves.length, ml = m + 1;
    const mrows = moves.map((r, idx) => { const v: unknown[] = moveValues(r); v[0] = dateCell(r.transaction_date); v[10] = { t: "n", f: `H${idx + 2}*J${idx + 2}`, z: AMT }; return v; });
    const ms = XLSX.utils.aoa_to_sheet([[...MOVE_HEADERS], ...mrows]);
    if (m) XLSX.utils.sheet_add_aoa(ms, [["TOTAL", "", "", "", "", "", { t: "n", f: `SUM(G2:G${ml})` }, { t: "n", f: `SUM(H2:H${ml})` }, "", "", { t: "n", f: `SUM(K2:K${ml})`, z: AMT }]], { origin: `A${ml + 2}` });
    ms["!cols"] = [11, 28, 12, 20, 32, 14, 10, 10, 9, 12, 14, 20].map((w) => ({ wch: w }));
    ms["!autofilter"] = { ref: `A1:L${Math.max(ml, 1)}` };
    XLSX.utils.book_append_sheet(wb, ms, "Movements");
    const drugs = [...new Set(moves.map((r) => r.drug))].sort();
    const mr = (c: string) => `Movements!$${c}$2:$${c}$${Math.max(ml, 2)}`;
    const ds = XLSX.utils.aoa_to_sheet([["Drug", "Received", "Issued", "Issued value (KES)"], ...drugs.map((d, i) => [d,
      { t: "n", f: `SUMIF(${mr("B")},A${i + 2},${mr("G")})` }, { t: "n", f: `SUMIF(${mr("B")},A${i + 2},${mr("H")})` },
      { t: "n", f: `SUMIF(${mr("B")},A${i + 2},${mr("K")})`, z: AMT }])]);
    ds["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ds, "Movements by drug");
  }

  const info = XLSX.utils.aoa_to_sheet([["CUEA Infirmary — Pharmacy report"], [`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}`], [], ["Filters"], ...filters.map((f) => [f])]);
  info["!cols"] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, info, "Filters");
  return wb;
}

/** Branded PDF on the Infirmary letterhead. */
export async function buildPharmacyPdf(view: "stock" | "moves", items: InvItem[], moves: MoveView[], filters: string[], preparedBy?: string, today = nairobiToday()): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const maroon: [number, number, number] = [128, 0, 32], orange: [number, number, number] = [230, 126, 34];
  let y = await drawInfirmaryLetterhead(doc, { title: view === "stock" ? "Pharmacy Stock Report" : "Pharmacy Stock Movement Report" });
  doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text(filters.join("   |   "), W / 2, y, { align: "center", maxWidth: W - 24 });
  y += 6;
  doc.setTextColor(0, 0, 0);

  if (view === "stock") {
    const units = items.reduce((a, i) => a + Math.max(i.quantity, 0), 0), value = items.reduce((a, i) => a + stockValue(i), 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`Items: ${items.length}     Units: ${units.toLocaleString()}     Stock value: KES ${money(value)}`, 12, y);
    autoTable(doc, {
      head: [["Drug", "Form", "Strength", "Pack", "Category", "Batch", "Expiry", "Qty", "Reorder", "Status", "Price", "Ins. price", "Value"]],
      body: items.map((i) => {
        const b = expiryBucket(i.expiry_date, today);
        return [i.drug_name + (i.generic_name ? `\n${i.generic_name}` : ""), i.formulation || "", i.strength_size || "", i.package || "", i.category || "", i.batch_number || "",
          ddmm(i.expiry_date) + (b === "expired" ? " EXPIRED" : b === "30" ? " (<30d)" : ""), i.quantity, i.reorder_level ?? "", STOCK_STATUS_LABEL[stockStatus(i)].replace(" (at / below reorder)", ""),
          money(Number(i.unit_price) || 0), i.insurance_price != null ? money(Number(i.insurance_price)) : "", money(stockValue(i))];
      }),
      foot: [["TOTAL", "", "", "", "", "", "", units, "", "", "", "", money(value)]],
      startY: y + 3, styles: { fontSize: 7.5, cellPadding: 1.3 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
      columnStyles: { 0: { cellWidth: 52 }, 7: { halign: "right" }, 8: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" } },
      alternateRowStyles: { fillColor: [250, 245, 240] }, margin: { left: 12, right: 12, bottom: 20 }, showFoot: "lastPage",
    });
  } else {
    const rec = moves.reduce((a, r) => a + (r.qty_received || 0), 0), iss = moves.reduce((a, r) => a + (r.qty_issued || 0), 0);
    const val = moves.reduce((a, r) => a + (r.qty_issued || 0) * (Number(r.unit_price) || 0), 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(`Lines: ${moves.length}     Received: ${rec.toLocaleString()}     Issued: ${iss.toLocaleString()}     Issued value: KES ${money(val)}`, 12, y);
    autoTable(doc, {
      head: [["Date", "Drug", "Type", "From / To", "Ref", "Received", "Issued", "Balance", "Price", "Recorded by"]],
      body: moves.map((r) => [ddmm(r.transaction_date), `${r.drug}${r.strength ? ` ${r.strength}` : ""}`, MOVE_LABEL[moveType(r)], r.received_from || r.issued_to || "", r.invoice_ref || "",
        r.qty_received || "", r.qty_issued || "", r.balance ?? "", r.unit_price ? money(Number(r.unit_price)) : "", r.recordedBy]),
      foot: [["TOTAL", "", "", "", "", rec, iss, "", "", ""]],
      startY: y + 3, styles: { fontSize: 7.5, cellPadding: 1.3 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
      columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
      alternateRowStyles: { fillColor: [250, 245, 240] }, margin: { left: 12, right: 12, bottom: 20 }, showFoot: "lastPage",
    });
  }
  // deno-lint-ignore no-explicit-any
  let end = (doc as any).lastAutoTable.finalY + 12;
  if (end > H - 25) { doc.addPage(); end = 25; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Prepared by: ${preparedBy || "______________________"}`, 12, end);
  doc.text("Signature: ______________________", 110, end);
  doc.text("Checked by: ______________________", 190, end);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`CUEA Infirmary Pharmacy  |  Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}  |  Page ${i} of ${pages}`, W / 2, H - 8, { align: "center" });
  }
  return doc;
}
