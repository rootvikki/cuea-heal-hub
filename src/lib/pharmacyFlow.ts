/**
 * Pharmacy prescription-sheet rules (one sheet = every drug prescribed on one visit).
 * Pure functions so the stage, timeline and ordering are tested (pharmacyFlow.test.ts).
 */

export type SheetStage = "new" | "billing" | "dispense" | "done";

export type RxLike = {
  status: string;
  created_at?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  billed_at?: string | null;
  dispensed_at?: string | null;
  dispensed_by?: string | null;
};

const CLOSED = ["dispensed", "not_dispensed", "collected"];
export const isClosedRx = (status: string) => CLOSED.includes(status);

/** Where the sheet is now. Billed items wait at billing until the ticket leaves billing, then they are ready to give. */
export function sheetStage(items: RxLike[], ticketStage?: string | null): SheetStage {
  const open = items.filter((i) => !isClosedRx(i.status));
  if (open.length === 0) return "done";
  if (open.some((i) => i.status === "billed")) return ticketStage === "at_billing" ? "billing" : "dispense";
  return "new";
}

export const STAGE_LABEL: Record<SheetStage, string> = {
  new: "To check",
  billing: "At billing",
  dispense: "Paid — give drugs",
  done: "Done",
};

const latest = (vals: (string | null | undefined)[]) =>
  vals.filter(Boolean).sort().at(-1) as string | undefined;
const earliest = (vals: (string | null | undefined)[]) =>
  vals.filter(Boolean).sort()[0] as string | undefined;

export type TimelineStep = { key: "received" | "billed" | "paid" | "dispensed"; label: string; at?: string; done: boolean; byMe?: boolean };

/** The four steps the pharmacist follows, with times and whether I did them — shown on every patient card. */
export function sheetTimeline(items: RxLike[], stage: SheetStage, myStaffId?: string | null): TimelineStep[] {
  const received = earliest(items.map((i) => i.received_at));
  const billedItems = items.filter((i) => i.billed_at);
  const billed = latest(billedItems.map((i) => i.billed_at));
  const dispensedItems = items.filter((i) => i.dispensed_at);
  const dispensed = latest(dispensedItems.map((i) => i.dispensed_at));
  const allNotAvailable = items.length > 0 && items.every((i) => i.status === "not_dispensed");
  const mine = (ids: (string | null | undefined)[]) => !!myStaffId && ids.includes(myStaffId);
  return [
    { key: "received", label: "Received", at: received, done: !!received || stage !== "new", byMe: mine(items.map((i) => i.received_by)) },
    { key: "billed", label: allNotAvailable ? "Nothing to bill" : "Sent to billing", at: billed, done: !!billed || allNotAvailable || stage === "billing" || stage === "dispense" || (stage === "done" && dispensedItems.length > 0), byMe: mine(items.map((i) => i.reviewed_by)) },
    { key: "paid", label: "Paid", done: stage === "dispense" || (stage === "done" && dispensedItems.length > 0) },
    { key: "dispensed", label: allNotAvailable ? "Not dispensed" : "Dispensed", at: dispensed, done: stage === "done", byMe: mine(items.map((i) => i.dispensed_by)) },
  ];
}

/** Last time anything happened on the sheet — used to place finished sheets on the right day. */
export const lastActivity = (items: RxLike[]) =>
  latest(items.flatMap((i) => [i.dispensed_at, i.billed_at, i.reviewed_at, i.received_at, i.created_at])) || "";

/** True when I received, priced or dispensed any line on the sheet. */
export const handledBy = (items: RxLike[], myStaffId?: string | null) =>
  !!myStaffId && items.some((i) => [i.received_by, i.reviewed_by, i.dispensed_by].includes(myStaffId));

/** Patients standing at the counter first (paid, ready to give), then new sheets oldest first, then those at billing. */
const ORDER: Record<SheetStage, number> = { dispense: 0, new: 1, billing: 2, done: 3 };
export function sortSheets<T extends { stage: SheetStage; createdAt: string; items: RxLike[] }>(sheets: T[]): T[] {
  return [...sheets].sort((a, b) => {
    if (a.stage === "done" && b.stage === "done") return lastActivity(b.items).localeCompare(lastActivity(a.items));
    return ORDER[a.stage] - ORDER[b.stage] || a.createdAt.localeCompare(b.createdAt);
  });
}

/** "5 min", "2 h 10 min", "3 d" — how long ago, for queue cards. */
export function since(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
  return `${Math.floor(h / 24)} d`;
}

/** Same calendar day in Nairobi. */
export const nairobiDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
