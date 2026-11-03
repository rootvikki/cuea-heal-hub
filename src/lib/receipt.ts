import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { drawInfirmaryLetterhead, openPdfWindow } from "@/lib/letterhead";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing";

const money = (n: unknown) => Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso?: string | null) => iso
  ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  : "-";

/** Builds the official receipt for every completed payment on an invoice. */
export async function buildInvoiceReceipt(invoiceId: string): Promise<jsPDF> {
  const [{ data: inv, error }, { data: pays }] = await Promise.all([
    supabase.from("invoices").select("invoice_number, net_amount, total_amount, amount_paid, balance, status, created_at, patients(patient_id, patient_type, admission_number, payroll_number, profiles(full_name, phone))").eq("id", invoiceId).maybeSingle(),
    supabase.from("payments").select("amount, payment_method, transaction_ref, paid_at, created_at, received_by, status").eq("invoice_id", invoiceId).eq("status", "completed").order("paid_at"),
  ]);
  if (error || !inv) throw new Error("This bill could not be found.");
  const payments = pays || [];
  if (!payments.length) throw new Error("No payment has been made on this bill yet.");

  const ids = [...new Set(payments.map((p) => p.received_by).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: staff } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const s of staff || []) names[s.id] = s.full_name || "Staff";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = (inv as any).patients || {};
  const last = payments[payments.length - 1];
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = await drawInfirmaryLetterhead(doc, { title: "Official Payment Receipt", date: new Date(last.paid_at || last.created_at) });

  doc.setFontSize(10);
  const row = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold"); doc.text(label, x, yy);
    doc.setFont("helvetica", "normal"); doc.text(value || "-", x + 34, yy);
  };
  row("Patient:", p.profiles?.full_name || "-", 14, y + 4);
  row("OPD No.:", p.patient_id || "-", 14, y + 11);
  row("Adm./Staff No.:", p.admission_number || p.payroll_number || "-", 14, y + 18);
  row("Bill No.:", inv.invoice_number, W / 2 + 4, y + 4);
  row("Bill date:", when(inv.created_at), W / 2 + 4, y + 11);
  row("Printed:", when(new Date().toISOString()), W / 2 + 4, y + 18);
  y += 26;

  autoTable(doc, {
    startY: y,
    head: [["#", "Date & time", "Method", "Receipt / Ref", "Received by", "Amount (KES)"]],
    body: payments.map((x, i) => [
      String(i + 1), when(x.paid_at || x.created_at), PAYMENT_METHOD_LABELS[x.payment_method] || x.payment_method,
      x.transaction_ref || "-", x.received_by ? names[x.received_by] || "Staff" : x.payment_method === "mpesa" ? "M-Pesa (auto)" : "-", money(x.amount),
    ]),
    theme: "grid",
    headStyles: { fillColor: [128, 0, 32], fontStyle: "bold" },
    styles: { fontSize: 9 },
    columnStyles: { 5: { halign: "right" } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  const total = Number(inv.net_amount ?? inv.total_amount ?? 0);
  const paid = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
  const lines: [string, string][] = [["Bill total", money(total)], ["Amount paid", money(paid)], ["Balance", money(Math.max(total - paid, 0))]];
  doc.setFontSize(10);
  lines.forEach(([l, v], i) => {
    doc.setFont("helvetica", i === 1 ? "bold" : "normal");
    doc.text(l, W - 70, y + i * 7); doc.text(`KES ${v}`, W - 14, y + i * 7, { align: "right" });
  });
  y += 26;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.setTextColor(total - paid <= 0 ? 0 : 180, total - paid <= 0 ? 128 : 90, 0);
  doc.text(total - paid <= 0 ? "PAID IN FULL" : "PART PAYMENT", 14, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Cashier signature: _________________________", 14, y + 16);
  doc.text("Stamp:", W / 2 + 10, y + 16);
  doc.setFontSize(8); doc.setTextColor(110, 110, 110);
  doc.text("Thank you. Please keep this receipt for your records.", W / 2, doc.internal.pageSize.getHeight() - 12, { align: "center" });
  doc.setTextColor(0, 0, 0);
  return doc;
}

/** Opens the receipt ready to print. */
export const printInvoiceReceipt = (invoiceId: string) => openPdfWindow(() => buildInvoiceReceipt(invoiceId), { autoPrint: true });
