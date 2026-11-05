import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { drawInfirmaryLetterhead, openPdfWindow } from "./letterhead";
import { getFlag } from "./labFields";

type FieldDef = { name: string; unit?: string; ref?: string; refMale?: string; refFemale?: string };

/** The built-in PDF font has no "µ", so "µmol/L" printed as "mol/L" — write it as "u" (umol/L, 10^3/uL). */
const pdfText = (v: unknown) => String(v ?? "").replace(/µ/g, "u");

/** H / L for a typed value (also "<5" or "5-10") against its range. */
const flagFor = (value: string, range?: string) => getFlag(value, range) ?? "";

/**
 * Continues on a new page when the next block would not fit, so text is never cut off
 * at the bottom and the report flows page after page without blank gaps.
 */
const room = (doc: jsPDF, y: number, needed: number) => {
  const bottom = doc.internal.pageSize.getHeight() - 14;
  if (y + needed <= bottom) return y;
  doc.addPage();
  return 20;
};
/** Page numbers on every page once the report is finished. */
const numberPages = (doc: jsPDF) => {
  const n = doc.getNumberOfPages();
  if (n < 2) return;
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
    doc.text(`Page ${i} of ${n}`, W / 2, H - 6, { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
};

/** Flag text for PDFs (the standard PDF font has no arrow symbols). */
const pdfFlag = (flag?: string | null) =>
  ({ H: "H", L: "L", HH: "HH CRIT", LL: "LL CRIT", C: "CRIT", POS: "+ve", A: "Abn" } as Record<string, string>)[flag || ""] ?? (flag && flag !== "N" ? flag : "");

const ageOf = (dob?: string | null) => {
  if (!dob) return "";
  const d = new Date(dob), n = new Date();
  let y = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) y--;
  return `${y} yrs`;
};

/** Opens a branded CUEA lab report PDF in a new tab for printing (also downloadable). */
export async function printLabReport(
  order: any,
  fields: FieldDef[] | null,
  values: Record<string, string>,
  singleValue: string,
  notes: string,
) {
  return openPdfWindow(async () => {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const maroon: [number, number, number] = [128, 0, 32];
  const top = await drawInfirmaryLetterhead(doc, { title: "Laboratory Report" });

  const p = order.patient || {};
  const prof = p.profile || {};
  const testTime = order.completed_at || order.result_entered_at || order.created_at;
  doc.setTextColor(0, 0, 0); doc.setFontSize(9);
  const rows: [string, string][] = [
    [`Name: ${prof.full_name || ""}`, `Test Time: ${testTime ? format(new Date(testTime), "yyyy-MM-dd HH:mm") : ""}`],
    [`Patient ID: ${p.patient_id || ""}`, `Age: ${ageOf(prof.date_of_birth)}`],
    [`Gender: ${prof.gender || ""}`, `Test: ${order.test?.test_name || ""}${order.test?.test_name === "Full Hemogram" ? "   Mode: CBC+DIFF" : ""}`],
    [`Patient Type: Outpatient`, `Sample: ${order.id?.slice(0, 8).toUpperCase() || ""}`],
  ];
  let y = top + 2;
  rows.forEach(([a, b]) => { doc.text(a, 14, y); doc.text(b, W / 2 + 5, y); y += 6; });

  const body = fields
    ? fields.map((f) => {
        const ref = (prof.gender?.toLowerCase() === "female" && f.refFemale) || (prof.gender?.toLowerCase() === "male" && f.refMale) || f.ref || "";
        const v = values[f.name] || "";
        return [f.name, flagFor(v, ref), v || "---", pdfText(f.unit), pdfText(ref)];
      })
    : [[order.test?.test_name || "Result", flagFor(singleValue, order.test?.normal_range), singleValue || order.result_value || "---", pdfText(order.test?.unit), pdfText(order.test?.normal_range)]];

  autoTable(doc, {
    startY: y + 2,
    head: [["Para.", "Flag", "Result", "Unit", "Ref. Range"]],
    body,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 1.4 },
    margin: { top: 16, bottom: 16 },
    rowPageBreak: "avoid",
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.4 }, lineColor: maroon },
    columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 30 }, 4: { cellWidth: 40 } },
    didParseCell: (d) => { if (d.section === "body" && (d.row.raw as any[])[1]) d.cell.styles.fontStyle = "bold"; },
  });

  doc.setFontSize(9);
  const c = doc.splitTextToSize(`Comments: ${notes || order.result_notes || ""}`, W - 28);
  let fy = room(doc, (doc as any).lastAutoTable.finalY + 8, 8 + c.length * 5 + 8 + 6);
  doc.setFontSize(8); doc.setFont("helvetica", "italic");
  doc.text("*Claim: The report is only responsible for the delivered sample!", 14, fy); fy += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(c, 14, fy); fy += c.length * 5 + 8;
  doc.text("Doctor: ______________________________", 14, fy);
  doc.text("Lab Technician: ______________________", W / 2 + 5, fy);
  numberPages(doc);

  return doc;
  }, { autoPrint: true });
}

/**
 * One combined, bordered lab report for every test of a visit.
 * `orders` use the same shape as LabResultsTable (test, fields / lab_result_fields, result_value…).
 */
export async function printVisitLabReport(
  patient: { full_name?: string | null; patient_id?: string | null; gender?: string | null; date_of_birth?: string | null; inpatient?: boolean },
  orders: any[],
) {
  return openPdfWindow(async () => {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const maroon: [number, number, number] = [128, 0, 32];
  const top = await drawInfirmaryLetterhead(doc, { title: "Laboratory Results" });

  const done = orders.map((o) => o.completed_at || o.result_entered_at).filter(Boolean).sort().pop();
  doc.setTextColor(0, 0, 0); doc.setFontSize(9);
  const rows: [string, string][] = [
    [`Name: ${patient.full_name || ""}`, `Date: ${done ? format(new Date(done), "yyyy-MM-dd HH:mm") : format(new Date(), "yyyy-MM-dd")}`],
    [`Patient ID: ${patient.patient_id || ""}`, `Age: ${ageOf(patient.date_of_birth)}`],
    [`Gender: ${patient.gender || ""}`, `Patient Type: ${patient.inpatient ? "Inpatient" : "Outpatient"}`],
  ];
  let y = top + 2;
  rows.forEach(([a, b]) => { doc.text(a, 14, y); doc.text(b, W / 2 + 5, y); y += 6; });

  // Each test is a shaded heading row followed by its own lines. (A tall merged "test" cell can't be split
  // across pages, which pushed whole tests onto the next page and left blank gaps.)
  const heading = (text: string) => [{ content: text, colSpan: 5, styles: { fontStyle: "bold", fillColor: [243, 230, 233], textColor: [90, 0, 22] } }];
  const body: any[] = [];
  for (const o of orders) {
    const name = o.test?.test_name || "Lab test";
    const fields = [...(o.fields || o.lab_result_fields || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (o.status === "rejected") {
      body.push(heading(name), [{ content: `Sample rejected: ${o.rejection_reason || "-"} - new sample needed`, colSpan: 5, styles: { fontStyle: "italic" } }]);
    } else if (o.status !== "completed") {
      body.push(heading(name), [{ content: "Result pending", colSpan: 5, styles: { fontStyle: "italic" } }]);
    } else if (fields.length) {
      body.push(heading(name));
      fields.forEach((f: any) => body.push([f.field_name, f.field_value || "---", pdfText(f.unit), pdfText(f.reference_range), pdfFlag(f.flag)]));
    } else {
      body.push(heading(name), ["Result", o.result_value || "---", pdfText(o.test?.unit), pdfText(o.test?.normal_range), o.flag === "critical" ? "CRIT" : o.flag === "abnormal" ? "Abn" : o.flag === "positive" ? "+ve" : ""]);
    }
  }

  autoTable(doc, {
    startY: y + 2,
    head: [["Parameter", "Result", "Unit", "Ref. Range", "Flag"]],
    body,
    theme: "grid",
    showHead: "everyPage",
    margin: { top: 16, bottom: 16 },
    rowPageBreak: "avoid",
    styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: { fillColor: maroon, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 44, halign: "right" }, 2: { cellWidth: 24 }, 3: { cellWidth: 40 }, 4: { cellWidth: 22, halign: "center" } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const raw = d.row.raw as any[];
      if (raw.length < 5) return;
      const flag = raw[4];
      if (flag && typeof flag === "string" && [0, 1, 4].includes(d.column.index)) { d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = [180, 0, 0]; }
    },
  });

  const notes = orders.filter((o) => o.result_notes?.trim()).map((o) => `${o.test?.test_name}: ${o.result_notes}`).join("   ");
  doc.setFontSize(9);
  const c = notes ? doc.splitTextToSize(`Comments: ${notes}`, W - 28) : [];
  let fy = room(doc, (doc as any).lastAutoTable.finalY + 8, (c.length ? c.length * 5 + 4 : 0) + 10 + 6);
  if (c.length) { doc.text(c, 14, fy); fy += c.length * 5 + 4; }
  doc.setFontSize(8); doc.setFont("helvetica", "italic");
  doc.text("*Claim: The report is only responsible for the delivered sample!", 14, fy); fy += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Doctor: ______________________________", 14, fy);
  doc.text("Lab Technician: ______________________", W / 2 + 5, fy);
  numberPages(doc);

  return doc;
  }, { autoPrint: true });
}
