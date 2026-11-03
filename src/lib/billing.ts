import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";
import { allowedPaymentModes, defaultPaymentMode, type PaymentMode } from "@/lib/pricing";

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

/** Patient type for fee rules (stations pass it when they already have it loaded). */
export async function patientTypeOf(patientId: string, known?: string | null): Promise<string | null> {
  if (known) return known;
  const { data } = await supabase.from("patients").select("patient_type").eq("id", patientId).maybeSingle();
  return data?.patient_type ?? null;
}

export type { ConfirmedCharge };
...
  if (confirmed) {
    const { lines, changed } = applyConfirmedCharges(charges, confirmed);
    for (const c of changed) {
      const { error } = await supabase.from("service_charges").update({ description: c.description, amount: c.amount }).eq("id", c.id);
      if (error) throw new Error(`Could not save the changed amount for "${c.description}": ${error.message}`);
    }
    charges = lines;
  }
  if (charges.length === 0) {
    const { data: open } = await supabase.from("invoices").select("*").eq("ticket_id", ticketId).neq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (open as Invoice) ?? null;
  }
  const add = charges.reduce((s, c) => s + Number(c.amount || 0), 0);

  // An unpaid bill on this visit with nothing paid yet takes the new lines
  const { data: untouched } = await supabase.from("invoices").select("*").eq("ticket_id", ticketId)
    .eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let invoice: any;
  if (untouched && Number(untouched.amount_paid || 0) === 0) {
    const total = Number(untouched.total_amount || 0) + add;
    const net = Number(untouched.net_amount || 0) + add;
    const { data, error } = await supabase.from("invoices").update({ total_amount: total, net_amount: net, balance: net, updated_at: new Date().toISOString() })
      .eq("id", untouched.id).select("*").single();
    if (error) throw new Error(`The bill could not be updated: ${error.message}`);
    invoice = data;
  } else {
    const { data, error } = await supabase.from("invoices").insert({
      invoice_number: `INV-${Date.now().toString().slice(-8)}`,
      patient_id: charges[0].patient_id,
      encounter_id: charges.find((c) => c.encounter_id)?.encounter_id ?? null,
      ticket_id: ticketId,
      total_amount: add, net_amount: add, amount_paid: 0, balance: add, status: "pending",
    } as any).select("*").single();
    if (error) throw new Error(`Invoice could not be created: ${error.message}`);
    invoice = data;
  }

  const { error: itemErr } = await supabase.from("invoice_items").insert(charges.map((c) => ({
    invoice_id: invoice.id, description: c.description, quantity: 1, unit_price: Number(c.amount), total_price: Number(c.amount),
  })));
  if (itemErr) throw new Error(`Bill lines could not be saved: ${itemErr.message}`);
  const { error: linkErr } = await supabase.from("service_charges").update({ invoice_id: invoice.id } as any).in("id", charges.map((c) => c.id));
  if (linkErr) throw new Error(`Charges could not be linked to the bill: ${linkErr.message}`);

  logAuditEvent({ action: untouched && invoice.id === untouched.id ? "invoice_extended" : "invoice_generated", module: "billing", details: { invoice_number: invoice.invoice_number, ticket_id: ticketId, added: add, net: invoice.net_amount, lines: charges.map((c) => ({ description: c.description, amount: Number(c.amount) })) } });
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

/** Payment mode for a new visit when reception did not pick one (queue / appointment check-in). */
export async function visitPaymentModeFor(patientId: string): Promise<PaymentMode> {
  const { data } = await supabase.from("patients").select("patient_type, insurance_provider, insurance_number").eq("id", patientId).maybeSingle();
  return defaultPaymentMode(data || {});
}

/**
 * Changes the payment mode of a visit (and of the patient's other open visits).
 * The mode chosen at reception follows the patient to every station and to billing.
 */
export async function setVisitPaymentMode(ticketIds: string[], mode: PaymentMode, patientType?: string | null) {
  if (!ticketIds.length) return;
  if (!allowedPaymentModes(patientType).includes(mode)) throw new Error("This payment mode is not allowed for this patient type");
  const { error } = await supabase.from("tickets").update({ payment_mode: mode, updated_at: new Date().toISOString() } as any).in("id", ticketIds);
  if (error) throw new Error(`Could not change the payment mode: ${error.message}`);
  logAuditEvent({ action: "visit_payment_mode_changed", module: "billing", details: { ticket_ids: ticketIds, payment_mode: mode } });
}

/** Open (not checked-out) visits of a patient. */
export async function openVisitIds(patientId: string): Promise<string[]> {
  const { data } = await supabase.from("tickets").select("id").eq("patient_id", patientId).neq("status", "checked_out");
  return (data || []).map((t) => t.id);
}
