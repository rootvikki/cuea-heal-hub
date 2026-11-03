/** Pharmacy stock report rules: stock status, expiry windows, stock value, filtering and movement summaries. */

export interface InvItem {
  id: string;
  drug_name: string;
  generic_name?: string | null;
  formulation?: string | null;
  strength_size?: string | null;
  package?: string | null;
  category?: string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  quantity: number;
  unit_price: number;
  insurance_price?: number | null;
  reorder_level?: number | null;
  minimum_stock?: number | null;
  maximum_stock?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type StockStatus = "out" | "low" | "ok" | "over";
export const STOCK_STATUS_LABEL: Record<StockStatus, string> = { out: "Out of stock", low: "Low (at / below reorder)", ok: "In stock", over: "Above maximum" };

export type ExpiryBucket = "expired" | "30" | "90" | "180" | "later" | "none";
export const EXPIRY_LABEL: Record<ExpiryBucket, string> = {
  expired: "Expired", "30": "Expires within 30 days", "90": "Expires in 31–90 days", "180": "Expires in 91–180 days", later: "Expires after 180 days", none: "No expiry recorded",
};

/** Today's date in Nairobi as YYYY-MM-DD. */
export const nairobiToday = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

const dayNum = (ymd: string) => { const [y, m, d] = ymd.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

/** The level at which a drug counts as low: its reorder level, else its minimum stock. */
export const reorderPoint = (i: Pick<InvItem, "reorder_level" | "minimum_stock">) => i.reorder_level || i.minimum_stock || 0;

export function stockStatus(i: Pick<InvItem, "quantity" | "reorder_level" | "minimum_stock" | "maximum_stock">): StockStatus {
  const q = i.quantity || 0;
  if (q <= 0) return "out";
  if (q <= reorderPoint(i)) return "low";
  if (i.maximum_stock && q > i.maximum_stock) return "over";
  return "ok";
}

/** Days until expiry (negative once expired); null when no expiry is recorded. */
export const daysToExpiry = (expiry: string | null | undefined, today = nairobiToday()) =>
  expiry ? dayNum(expiry) - dayNum(today) : null;

/** A drug is expired from the day after its expiry date. */
export function expiryBucket(expiry: string | null | undefined, today = nairobiToday()): ExpiryBucket {
  const d = daysToExpiry(expiry, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 30) return "30";
  if (d <= 90) return "90";
  if (d <= 180) return "180";
  return "later";
}

export const stockValue = (i: Pick<InvItem, "quantity" | "unit_price">) => Math.max(i.quantity || 0, 0) * (Number(i.unit_price) || 0);

export interface InvFilters {
  text?: string;
  category?: string; // "all" | "none" | category
  formulation?: string; // "all" | "none" | formulation
  status?: StockStatus | "all" | "attention"; // attention = out or low
  expiry?: ExpiryBucket | "all" | "within90"; // within90 = expired or ≤ 90 days
  minPrice?: number | null;
  maxPrice?: number | null;
}

export function filterInventory(items: InvItem[], f: InvFilters, today = nairobiToday()): InvItem[] {
  const t = (f.text || "").trim().toLowerCase();
  return items.filter((i) => {
    if (t && ![i.drug_name, i.generic_name, i.batch_number, i.strength_size, i.category].some((v) => (v || "").toLowerCase().includes(t))) return false;
    if (f.category && f.category !== "all" && (f.category === "none" ? !!i.category : i.category !== f.category)) return false;
    if (f.formulation && f.formulation !== "all" && (f.formulation === "none" ? !!i.formulation : i.formulation !== f.formulation)) return false;
    if (f.status && f.status !== "all") {
      const s = stockStatus(i);
      if (f.status === "attention" ? !(s === "out" || s === "low") : s !== f.status) return false;
    }
    if (f.expiry && f.expiry !== "all") {
      const b = expiryBucket(i.expiry_date, today);
      if (f.expiry === "within90" ? !["expired", "30", "90"].includes(b) : b !== f.expiry) return false;
    }
    const p = Number(i.unit_price) || 0;
    if (f.minPrice != null && p < f.minPrice) return false;
    if (f.maxPrice != null && p > f.maxPrice) return false;
    return true;
  });
}

export function summarizeInventory(items: InvItem[], today = nairobiToday()) {
  let units = 0, value = 0, out = 0, low = 0, over = 0, expired = 0, soon = 0, expiredValue = 0;
  for (const i of items) {
    units += Math.max(i.quantity || 0, 0);
    value += stockValue(i);
    const s = stockStatus(i);
    if (s === "out") out++; else if (s === "low") low++; else if (s === "over") over++;
    const b = expiryBucket(i.expiry_date, today);
    if (b === "expired") { expired++; expiredValue += stockValue(i); }
    else if (b === "30" || b === "90") soon++;
  }
  return { items: items.length, units, value, out, low, over, expired, expiredValue, expiringIn90: soon };
}

// ── Stock movements (stock card lines) ──
export interface MoveRow {
  id: string;
  inventory_id: string;
  transaction_date: string;
  created_at?: string | null;
  received_from?: string | null;
  issued_to?: string | null;
  invoice_ref?: string | null;
  qty_received?: number | null;
  qty_issued?: number | null;
  balance?: number | null;
  unit_price?: number | null;
}

export type MoveType = "received" | "issued" | "adjustment" | "opening";
export const MOVE_LABEL: Record<MoveType, string> = { opening: "Opening stock", received: "Received", issued: "Issued / dispensed", adjustment: "Stock count adjustment" };

export function moveType(r: Pick<MoveRow, "received_from" | "issued_to" | "qty_received">): MoveType {
  const who = `${r.received_from || ""} ${r.issued_to || ""}`.toLowerCase();
  if (who.includes("stock count adjustment")) return "adjustment";
  if (who.includes("opening stock")) return "opening";
  return (r.qty_received || 0) > 0 ? "received" : "issued";
}

export function summarizeMoves(rows: MoveRow[]) {
  const byDrug = new Map<string, { received: number; issued: number; lines: number; issuedValue: number }>();
  let received = 0, issued = 0, issuedValue = 0;
  for (const r of rows) {
    const rec = r.qty_received || 0, iss = r.qty_issued || 0;
    received += rec; issued += iss; issuedValue += iss * (Number(r.unit_price) || 0);
    const g = byDrug.get(r.inventory_id) || { received: 0, issued: 0, lines: 0, issuedValue: 0 };
    g.received += rec; g.issued += iss; g.lines++; g.issuedValue += iss * (Number(r.unit_price) || 0);
    byDrug.set(r.inventory_id, g);
  }
  return { received, issued, issuedValue, lines: rows.length, byDrug };
}
