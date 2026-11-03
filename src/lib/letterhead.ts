import type jsPDF from "jspdf";
import crestUrl from "@/assets/cuea-crest-letterhead.png";

let crestPromise: Promise<string | null> | null = null;
const loadCrest = () =>
  (crestPromise ??= fetch(crestUrl)
    .then((r) => r.blob())
    .then((b) => new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); }))
    .catch(() => null));

// Start loading the crest as soon as any printing code is imported
void loadCrest();

/** Opens a PDF in a new tab. The tab is opened first, so pop-up blockers allow it even though the PDF is built afterwards. */
export async function openPdfWindow(build: () => Promise<jsPDF>, opts: { autoPrint?: boolean } = {}): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const doc = await build();
    if (opts.autoPrint) doc.autoPrint();
    const url = String(doc.output("bloburl"));
    if (w) w.location.href = url; else window.open(url, "_blank");
  } catch (e) {
    w?.close();
    throw e;
  }
}

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

const htmlEsc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** CSS for the HTML letterhead used in print windows. */
export const LETTERHEAD_CSS = `
  .lh{font-family:"Times New Roman",Times,serif;color:#000;margin-bottom:14px}
  .lh-top{text-align:center;font-weight:bold;font-size:19px;letter-spacing:.2px}
  .lh-row{display:grid;grid-template-columns:110px 1fr 160px;align-items:center;margin-top:6px}
  .lh-row img{width:96px;height:auto}
  .lh-mid{text-align:center}
  .lh-amecea{font-weight:bold;font-size:15px}
  .lh-inf{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;margin-top:14px}
  .lh-mail{font-family:Arial,Helvetica,sans-serif;color:#0000c8;font-size:12px;margin-top:2px}
  .lh-addr{text-align:right;font-weight:bold;font-size:11.5px;line-height:1.65}
  .lh-rule{border-top:2.5px solid #800020;border-bottom:1px solid #e67e22;height:2px;margin-top:8px}
  .lh-title{text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;margin:12px 0 4px;text-transform:uppercase}
  @media print{.lh{break-inside:avoid}}
`;

/** Official Infirmary letterhead as HTML, for print windows. */
export function letterheadHtml(title?: string, date: Date = new Date()): string {
  const crest = new URL(crestUrl, window.location.origin).href;
  return `<div class="lh">
    <div class="lh-top">THE CATHOLIC UNIVERSITY OF EASTERN AFRICA</div>
    <div class="lh-row">
      <img src="${crest}" alt="CUEA crest" />
      <div class="lh-mid"><div class="lh-amecea">A. M. E. C. E. A</div><div class="lh-inf">INFIRMARY</div><div class="lh-mail">infirmary@cuea.edu</div></div>
      <div class="lh-addr">P.O. Box 62157<br/>Nairobi - KENYA<br/>FAX: 254-20-891084<br/>DATE: ${ddmmyyyy(date)}</div>
    </div>
    <div class="lh-rule"></div>
    ${title ? `<div class="lh-title">${htmlEsc(title)}</div>` : ""}
  </div>`;
}

/**
 * Opens a print window with the letterhead on top and prints once the crest image has loaded.
 * Returns false when pop-ups are blocked.
 */
export function printWithLetterhead(opts: { docTitle: string; title?: string; body: string; css?: string }): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${htmlEsc(opts.docTitle)}</title>
    <style>${LETTERHEAD_CSS}${opts.css || ""}</style></head><body>
    ${letterheadHtml(opts.title)}
    ${opts.body}
    <script>
      (function(){var img=document.querySelector('.lh img');var go=function(){setTimeout(function(){window.focus();window.print();},150)};
      if(!img||img.complete){go()}else{img.onload=go;img.onerror=go}})();
    </script>
    </body></html>`);
  w.document.close();
  return true;
}
