import type jsPDF from "jspdf";
import crestUrl from "@/assets/cuea-crest-letterhead.png";

let crestPromise: Promise<string | null> | null = null;
const loadCrest = () =>
  (crestPromise ??= fetch(crestUrl)
    .then((r) => r.blob())
    .then((b) => new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); }))
    .catch(() => null));

const ddmmyyyy = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Draws the official CUEA Infirmary letterhead at the top of the current page.
 * Returns the y position (mm) where content can start.
 */
export async function drawInfirmaryLetterhead(doc: jsPDF, opts: { title?: string; date?: Date } = {}): Promise<number> {
  const W = doc.internal.pageSize.getWidth();
  const m = 12, cx = W / 2;
  const crest = await loadCrest();

  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold"); doc.setFontSize(15);
  doc.text("THE CATHOLIC UNIVERSITY OF EASTERN AFRICA", cx, 14, { align: "center" });
  if (crest) doc.addImage(crest, "PNG", m + 4, 17, 26, 23);
  doc.setFontSize(12);
  doc.text("A. M. E. C. E. A", cx, 25, { align: "center" });

  doc.setFontSize(9);
  const rx = W - m;
  doc.text("P.O. Box 62157", rx, 21, { align: "right" });
  doc.text("Nairobi - KENYA", rx, 26, { align: "right" });
  doc.text("FAX: 254-20-891084", rx, 31, { align: "right" });
  doc.text(`DATE: ${ddmmyyyy(opts.date || new Date())}`, rx, 36, { align: "right" });

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("INFIRMARY", cx, 37, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 200);
  doc.text("infirmary@cuea.edu", cx, 42, { align: "center" });

  doc.setDrawColor(128, 0, 32); doc.setLineWidth(0.7); doc.line(m, 45, W - m, 45);
  doc.setDrawColor(230, 126, 34); doc.setLineWidth(0.3); doc.line(m, 46.2, W - m, 46.2);
  doc.setTextColor(0, 0, 0);

  if (opts.title) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(opts.title.toUpperCase(), cx, 53, { align: "center" });
    doc.setFont("helvetica", "normal");
    return 58;
  }
  return 51;
}
