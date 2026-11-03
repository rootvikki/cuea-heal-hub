import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawInfirmaryLetterhead } from "./letterhead";
import { GROUPS, METHODS, PATIENT_TYPES, groupPayments, type GroupBy, type PaymentRow } from "./paymentsQuery";

const money = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (ymd: string) => ymd.split("-").reverse().join("/");

/** Branded PDF on the official Infirmary letterhead. */
export async function buildPaymentsPdf(rows: PaymentRow[], meta: { filters: string[]; groupBy: GroupBy; preparedBy?: string }): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const maroon: [number, number, number] = [128, 0, 32], orange: [number, number, number] = [230, 126, 34];
  let y = await drawInfirmaryLetterhead(doc, { title: "Patient Payments Report" });

  const total = rows.reduce((a, r) => a + r.amount, 0);
  doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text(meta.filters.join("   |   "), W / 2, y, { align: "center", maxWidth: W - 24 });
  y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text(`Total collected: KES ${money(total)}`, 12, y);
  doc.text(`Payments: ${rows.length}`, 110, y);
  doc.text(`Average: KES ${money(rows.length ? total / rows.length : 0)}`, 160, y);
  y += 4;

  // Summary tables: chosen grouping, or method + patient type side by side
  const groupTable = (by: GroupBy, startY: number, left: number, width: number) => {
    const g = groupPayments(rows, by);
    autoTable(doc, {
      head: [[GROUPS[by], "No.", "Amount (KES)"]],
      body: g.map((x) => [by === "day" ? ddmm(x.label) : x.label, x.count, money(x.total)]),
      foot: [["Total", rows.length, money(total)]],
      startY, margin: { left, right: W - left - width }, tableWidth: width,
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    // deno-lint-ignore no-explicit-any
    return (doc as any).lastAutoTable.finalY as number;
  };
  let afterSummary: number;
  if (meta.groupBy !== "none") afterSummary = groupTable(meta.groupBy, y + 2, 12, 130);
  else afterSummary = Math.max(groupTable("method", y + 2, 12, 125), groupTable("patientType", y + 2, W - 12 - 125, 125));

  autoTable(doc, {
    head: [["Date", "Time", "Receipt / Ref", "Patient", "OPD No.", "Type", "Invoice", "Dept", "Method", "Received By", "Amount (KES)"]],
    body: rows.map((r) => [ddmm(r.date), r.time, r.receipt, r.patient, r.opd, PATIENT_TYPES[r.patientType] || "-", r.invoice, r.department, METHODS[r.method] || r.method, r.receivedBy, money(r.amount)]),
    foot: [["", "", "", "", "", "", "", "", "", "TOTAL", money(total)]],
    startY: afterSummary + 6,
    styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: maroon }, footStyles: { fillColor: orange, textColor: 255 },
    columnStyles: { 10: { halign: "right" } }, alternateRowStyles: { fillColor: [250, 245, 240] },
    margin: { left: 12, right: 12, bottom: 22 }, showFoot: "lastPage",
  });

  // Sign-off block
  // deno-lint-ignore no-explicit-any
  let end = (doc as any).lastAutoTable.finalY + 12;
  if (end > H - 30) { doc.addPage(); end = 25; }
  doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  doc.text(`Prepared by: ${meta.preparedBy || "______________________"}`, 12, end);
  doc.text("Signature: ______________________", 110, end);
  doc.text("Checked by (Finance): ______________________", 190, end);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`CUEA Infirmary  |  Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}  |  Page ${i} of ${pages}`, W / 2, H - 8, { align: "center" });
  }
  return doc;
}
