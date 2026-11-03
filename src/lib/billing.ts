import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";

export type PaymentMethod = "mpesa" | "school_fees" | "payroll" | "insurance";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  school_fees: "School fees",
  payroll: "Payroll deduction",
  insurance: "Insurance",
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash (legacy)",
};

export interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  ticket_id?: string | null;
  net_amount: number;
  amount_paid: number | null;
  balance: number | null;
  status: string | null;
}

/** Charges on this visit that have not yet been put on an invoice. */
export async function unbilledCharges(ticketId: string) {
  const { data } = await supabase.from("service_charges").select("*").eq("ticket_id", ticketId).is("invoice_id", null).order("created_at");
  return data || [];
}

/**
 * Puts every un-invoiced charge of the visit on a new invoice.
 * If nothing is new, returns the visit's latest unpaid invoice (or null).
 */
export async function createInvoiceForTicket(ticketId: string): Promise<Invoice | null> {
  const charges = await unbilledCharges(ticketId);
  if (charges.length === 0) {
    const { data: open } = await supabase.from("invoices").select("*").eq("ticket_id", ticketId).neq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (open as Invoice) ?? null;
  }
  const total = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
  const { data: invoice, error } = await supabase.from("invoices").insert({
    invoice_number: invoiceNumber,
    patient_id: charges[0].patient_id,
    encounter_id: charges.find((c) => c.encounter_id)?.encounter_id ?? null,
    ticket_id: ticketId,
    total_amount: total,
    net_amount: total,
    amount_paid: 0,
    balance: total,
    status: "pending",
  } as any).select("*").single();
  if (error) throw new Error(`Invoice could not be created: ${error.message}`);

  await supabase.from("invoice_items").insert(charges.map((c) => ({
    invoice_id: invoice.id, description: c.description, quantity: 1, unit_price: c.amount, total_price: c.amount,
  })));
  await supabase.from("service_charges").update({ invoice_id: invoice.id } as any).in("id", charges.map((c) => c.id));

  logAuditEvent({ action: "invoice_generated", module: "billing", details: { invoice_number: invoiceNumber, ticket_id: ticketId, total } });
  return invoice as Invoice;
}

/** Records a (non M-Pesa STK) payment and updates the invoice. Returns the new balance. */
export async function recordPayment(invoice: Invoice, amount: number, method: PaymentMethod | "mpesa_manual", reference: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const dbMethod = method === "mpesa_manual" ? "mpesa" : method;
  if (method === "mpesa_manual") {
    // The same M-Pesa code can only pay once (it may already have come in through the prompt).
    const [{ count: used }, { count: viaPrompt }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("transaction_ref", reference).eq("status", "completed"),
      supabase.from("mpesa_transactions").select("id", { count: "exact", head: true }).eq("mpesa_receipt_number", reference).eq("status", "completed"),
    ]);
    if (used || viaPrompt) throw new Error(`M-Pesa code ${reference} has already been recorded — this payment is already on the system.`);
  }
  const { error } = await supabase.from("payments").insert({
    invoice_id: invoice.id,
    patient_id: invoice.patient_id,
    amount,
    payment_method: dbMethod as any,
    transaction_ref: reference,
    status: "completed",
    paid_at: new Date().toISOString(),
    received_by: user?.id ?? null,
  });
  if (error) throw new Error(`Payment could not be recorded: ${error.message}`);

  const paid = Number(invoice.amount_paid || 0) + amount;
  const balance = Math.max(Number(invoice.net_amount) - paid, 0);
  const { error: invErr } = await supabase.from("invoices").update({
    amount_paid: paid, balance, status: balance <= 0 ? "paid" : "partial",
  }).eq("id", invoice.id);
  if (invErr) throw new Error(invErr.message);

  logAuditEvent({ action: "payment_recorded", module: "billing", details: { invoice: invoice.invoice_number, method, amount, reference } });
  return balance;
}

/**
 * After a visit is paid: if the pharmacy is holding prescriptions for this
 * visit (sent for billing, not yet dispensed) the patient goes back to the
 * pharmacy to collect; otherwise they are checked out.
 */
export async function routeAfterPayment(ticketId: string, patientName?: string): Promise<"at_pharmacy" | "checked_out"> {
  const { data: encs } = await supabase.from("encounters").select("id").eq("ticket_id", ticketId);
  const encIds = (encs || []).map((e) => e.id);
  let waiting = 0;
  if (encIds.length) {
    const { count } = await supabase.from("prescriptions").select("id", { count: "exact", head: true })
      .in("encounter_id", encIds).eq("status", "billed");
    waiting = count || 0;
  }
  const now = new Date().toISOString();
  if (waiting > 0) {
    await supabase.from("tickets").update({ status: "at_pharmacy", workflow_stage: "at_pharmacy", updated_at: now }).eq("id", ticketId);
    await notifyRoles(["pharmacist"], {
      title: "Paid — ready to dispense",
      message: `${patientName || "A patient"} has paid. Please dispense ${waiting} item(s).`,
      category: "pharmacy", referenceId: ticketId, link: "/pharmacy",
    });
    return "at_pharmacy";
  }
  await supabase.from("tickets").update({ status: "checked_out", workflow_stage: "checked_out", checked_out_at: now, updated_at: now }).eq("id", ticketId);
  return "checked_out";
}

/** Reads the useful message out of a Supabase Edge Function error. */
export async function functionErrorMessage(error: any, data?: any): Promise<string> {
  if (data?.error) return data.error;
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* not JSON */ }
  return error?.message || "Request failed";
}
