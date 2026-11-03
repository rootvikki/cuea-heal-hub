/** Page maths for paginated lists (1-based pages). */
export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / Math.max(size, 1)));

export const pageSlice = <T,>(items: T[], page: number, size: number) => {
  const p = Math.min(Math.max(page, 1), pageCount(items.length, size));
  return items.slice((p - 1) * size, p * size);
};

/** Page buttons to show: first, last, current ±1, with null for a gap ("…"). */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - prev > 1) out.push(null); out.push(n); prev = n; }
  return out;
}
