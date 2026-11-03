export type ChargeLine = { id: string; description: string; amount: number | string | null };
export type ConfirmedCharge = { id: string; description: string; amount: number };

/**
 * The billing desk has the final say: the bill uses exactly the lines and amounts on screen when
 * Confirm was pressed (edited amounts included). Charges not on screen wait for the next confirm.
 * Returns the lines to bill and which ones changed (so their charge records can be updated too).
 */
export function applyConfirmedCharges<T extends ChargeLine>(charges: T[], confirmed: ConfirmedCharge[]) {
  const shown = new Map(confirmed.map((c) => [c.id, c]));
  const lines: T[] = [];
  const changed: T[] = [];
  for (const c of charges) {
    const x = shown.get(c.id);
    if (!x) continue;
    const amount = Math.max(Number(x.amount) || 0, 0);
    const description = (x.description || "").trim() || c.description;
    const line = { ...c, amount, description };
    if (amount !== Number(c.amount) || description !== c.description) changed.push(line);
    lines.push(line);
  }
  const total = lines.reduce((s, c) => s + Number(c.amount || 0), 0);
  return { lines, changed, total };
}
