import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { drawInfirmaryLetterhead, openPdfWindow } from "./letterhead";

type FieldDef = { name: string; unit?: string; ref?: string; refMale?: string; refFemale?: string };

const flagFor = (value: string, range?: string) => {
  const v = parseFloat(value);
  const m = range?.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (isNaN(v) || !m) return "";
  if (v < parseFloat(m[1])) return "L";
  if (v > parseFloat(m[2])) return "H";
  return "";
};

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
        return [f.name, flagFor(v, ref), v || "---", f.unit || "", ref];
      })
    : [[order.test?.test_name || "Result", flagFor(singleValue, order.test?.normal_range), singleValue || order.result_value || "---", order.test?.unit || "", order.test?.normal_range || ""]];

  autoTable(doc, {
    startY: y + 2,
    head: [["Para.", "Flag", "Result", "Unit", "Ref. Range"]],
    body,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 1.4 },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.4 }, lineColor: maroon },
    columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 15, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 30 }, 4: { cellWidth: 40 } },
    didParseCell: (d) => { if (d.section === "body" && (d.row.raw as any[])[1]) d.cell.styles.fontStyle = "bold"; },
  });

  let fy = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(8); doc.setFont("helvetica", "italic");
  doc.text("*Claim: The report is only responsible for the delivered sample!", 14, fy); fy += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const c = doc.splitTextToSize(`Comments: ${notes || order.result_notes || ""}`, W - 28);
  doc.text(c, 14, fy); fy += c.length * 5 + 8;
  doc.text("Doctor: ______________________________", 14, fy);
  doc.text("Lab Technician: ______________________", W / 2 + 5, fy);

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

  const body: any[] = [];
  for (const o of orders) {
    const name = o.test?.test_name || "Lab test";
    const fields = [...(o.fields || o.lab_result_fields || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (o.status === "rejected") {
      body.push([{ content: name, styles: { fontStyle: "bold" } }, { content: `Sample rejected: ${o.rejection_reason || "-"} - new sample needed`, colSpan: 5, styles: { fontStyle: "italic" } }]);
    } else if (o.status !== "completed") {
      body.push([{ content: name, styles: { fontStyle: "bold" } }, { content: "Result pending", colSpan: 5, styles: { fontStyle: "italic" } }]);
    } else if (fields.length) {
      fields.forEach((f: any, i: number) => {
        const row: any[] = [];
        if (i === 0) row.push({ content: name, rowSpan: fields.length, styles: { fontStyle: "bold", valign: "top" } });
        row.push(f.field_name, f.field_value || "---", f.unit || "", f.reference_range || "", pdfFlag(f.flag));
        body.push(row);
      });
    } else {
      body.push([{ content: name, styles: { fontStyle: "bold" } }, "Result", o.result_value || "---", o.test?.unit || "", o.test?.normal_range || "", o.flag === "abnormal" ? "Abn" : ""]);
    }
  }

  autoTable(doc, {
    startY: y + 2,
    head: [["Test", "Parameter", "Result", "Unit", "Ref. Range", "Flag"]],
    body,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.2 },
    headStyles: { fillColor: maroon, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 38 }, 2: { cellWidth: 28, halign: "right" }, 3: { cellWidth: 22 }, 4: { cellWidth: 34 }, 5: { cellWidth: 14, halign: "center" } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const raw = d.row.raw as any[];
      const flag = raw[raw.length - 1];
      if (flag && typeof flag === "string" && d.column.index >= raw.length - 4) { d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = [180, 0, 0]; }
    },
  });

  let fy = (doc as any).lastAutoTable.finalY + 8;
  const notes = orders.filter((o) => o.result_notes?.trim()).map((o) => `${o.test?.test_name}: ${o.result_notes}`).join("   ");
  doc.setFontSize(9);
  if (notes) { const c = doc.splitTextToSize(`Comments: ${notes}`, W - 28); doc.text(c, 14, fy); fy += c.length * 5 + 4; }
  doc.setFontSize(8); doc.setFont("helvetica", "italic");
  doc.text("*Claim: The report is only responsible for the delivered sample!", 14, fy); fy += 10;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Doctor: ______________________________", 14, fy);
  doc.text("Lab Technician: ______________________", W / 2 + 5, fy);

  return doc;
  }, { autoPrint: true });
}
