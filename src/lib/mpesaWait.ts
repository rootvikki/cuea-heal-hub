import { supabase } from "@/integrations/supabase/client";

/** How long we keep waiting for M-Pesa to confirm a prompt before asking the user to check again. */
export const MPESA_WAIT_MS = 5 * 60 * 1000;
/** Don't ask Safaricom before this — it answers "still processing" while the patient is typing their PIN. */
const FIRST_QUERY_MS = 25 * 1000;
const QUERY_EVERY_MS = 15 * 1000;
const RECORD_EVERY_MS = 3 * 1000;

export type MpesaOutcome =
  | { status: "completed"; receipt: string | null }
  | { status: "failed"; message: string }
  | { status: "timeout" }
  | { status: "aborted" };

type Check = { status: "completed"; receipt: string | null } | { status: "failed"; message: string } | { status: "processing" } | { status: "pending" };

/** Our own record — updated the moment Safaricom's callback arrives (staff only; patients can't read it). */
async function readRecord(checkoutRequestId: string): Promise<Check> {
  const { data: tx } = await supabase.from("mpesa_transactions").select("status, mpesa_receipt_number, result_desc").eq("checkout_request_id", checkoutRequestId).maybeSingle();
  if (tx?.status === "completed") return { status: "completed", receipt: tx.mpesa_receipt_number };
  if (tx?.status === "failed") return { status: "failed", message: tx.result_desc || "The payment was not completed." };
  return { status: "pending" };
}

/** Ask Safaricom directly (covers a slow or missing callback). */
export async function queryMpesa(checkoutRequestId: string): Promise<Check> {
  const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: { action: "query", checkoutRequestId } });
  if (error || !data) return { status: "pending" };
  if (data.status === "completed") return { status: "completed", receipt: data.receipt ?? null };
  if (data.status === "failed") return { status: "failed", message: data.message || "The payment was not completed." };
  if (data.status === "processing") return { status: "processing" };
  return { status: "pending" };
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res) => {
  const t = window.setTimeout(res, ms);
  signal?.addEventListener("abort", () => { window.clearTimeout(t); res(); }, { once: true });
});

/**
 * Waits for an STK push to finish. Only a definite answer from M-Pesa counts as failed —
 * "still processing" keeps waiting, so a patient who paid is never told it failed.
 */
export async function waitForMpesa(
  checkoutRequestId: string,
  opts: { signal?: AbortSignal; onProgress?: (p: { message: string; remainingMs: number }) => void; readOwnRecord?: boolean } = {},
): Promise<MpesaOutcome> {
  const start = Date.now();
  let nextQuery = start + FIRST_QUERY_MS;
  let paidOnPhone = false;
  while (Date.now() - start < MPESA_WAIT_MS) {
    if (opts.signal?.aborted) return { status: "aborted" };
    let r: Check = { status: "pending" };
    if (opts.readOwnRecord !== false) r = await readRecord(checkoutRequestId);
    if (r.status === "pending" && Date.now() >= nextQuery) {
      r = await queryMpesa(checkoutRequestId);
      nextQuery = Date.now() + QUERY_EVERY_MS;
    }
    if (r.status === "completed" || r.status === "failed") return r;
    if (r.status === "processing") paidOnPhone = true;
    opts.onProgress?.({
      message: paidOnPhone ? "M-Pesa is processing the payment — please wait…" : "Waiting for the M-Pesa PIN to be entered on the phone…",
      remainingMs: Math.max(MPESA_WAIT_MS - (Date.now() - start), 0),
    });
    await sleep(RECORD_EVERY_MS, opts.signal);
  }
  return opts.signal?.aborted ? { status: "aborted" } : { status: "timeout" };
}
