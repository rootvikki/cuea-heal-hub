import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const maroon: [number, number, number] = [128, 0, 32];
  const orange: [number, number, number] = [230, 126, 34];
  let logo: string | null = null;
  try {
    const blob = await (await fetch("/favicon.png")).blob();
    logo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
  } catch { /* no logo */ }

  doc.setFillColor(...maroon); doc.rect(0, 0, W, 26, "F");
  doc.setFillColor(...orange); doc.rect(0, 26, W, 2, "F");
  if (logo) doc.addImage(logo, "PNG", 10, 3, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("THE CATHOLIC UNIVERSITY CLINIC", W / 2, 12, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Laboratory Department", W / 2, 19, { align: "center" });

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
  let y = 36;
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

  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}
