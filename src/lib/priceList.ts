/**
 * Price-list import: reads the clinic's Excel price list (name, Cash, INS columns with
 * section headings such as ANTIBIOTICS / PROCEDURES / LABORATORY SERVICES) and matches
 * each line to a drug in the inventory or a lab test, so the pharmacist can review the
 * changes before saving. Pure functions — tested in priceList.test.ts.
 */

export type PriceKind = "drug" | "lab" | "procedure";
export type PriceLine = { row: number; name: string; section: string; kind: PriceKind; cash: number; insurance: number | null };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
};

const kindOf = (section: string): PriceKind =>
  /lab/i.test(section) ? "lab" : /procedure/i.test(section) ? "procedure" : "drug";

/** Reads sheet rows (arrays of cell values). Finds the Cash / INS header, then every priced line under its section. */
export function parsePriceRows(rows: unknown[][]): { lines: PriceLine[]; error?: string } {
  const headerIdx = rows.findIndex((r) => r.some((c) => /^\s*cash\s*$/i.test(String(c ?? ""))));
  if (headerIdx < 0) return { lines: [], error: "Could not find the 'Cash' column heading. The sheet needs columns: name, Cash, INS." };
  const header = rows[headerIdx].map((c) => String(c ?? "").trim().toLowerCase());
  const cashCol = header.findIndex((h) => h === "cash");
  const insCol = header.findIndex((h) => /^(ins|insurance)\b/.test(h));
  const nameCol = header.findIndex((h, i) => i !== cashCol && i !== insCol && h !== "");
  const nc = nameCol >= 0 ? nameCol : 0;

  const lines: PriceLine[] = [];
  let section = "";
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const name = String(r[nc] ?? "").replace(/\s+/g, " ").trim();
    if (!name) return;
    const cash = num(r[cashCol]);
    const ins = insCol >= 0 ? num(r[insCol]) : null;
    if (cash === null && ins === null) { section = name; return; }
    const kind = kindOf(section);
    const base = { row: headerIdx + i + 2, section, kind, cash: cash ?? ins ?? 0, insurance: ins };
    // "FBS/RBS" on the lab list is one price for two separate tests
    const parts = kind === "lab" && /^[A-Za-z]{2,}\s*\/\s*[A-Za-z]{2,}$/.test(name) ? name.split("/").map((x) => x.trim()).filter(Boolean) : [name];
    for (const part of parts) lines.push({ ...base, name: part });
  });
  return { lines };
}

// ─── Name matching ────────────────────────────────────────────────
const SYNONYMS: Record<string, string> = {
  tabs: "tab", tablet: "tab", tablets: "tab", caps: "cap", capsule: "cap", capsules: "cap",
  syrup: "syr", suspension: "susp", sus: "susp", injection: "inj", mgs: "mg", satchets: "sachet", sachets: "sachet",
  hemoglobin: "haemoglobin", hemogram: "haemogram", test: "", the: "", of: "", and: "", for: "", "-": "",
  cysts: "cyst", // common misspellings / short forms on price lists
  hbag: "hbsag", pdt: "pregnancy", pregnacy: "pregnancy", prifile: "profile", lfts: "lft", uecs: "uec",
};

/** Form and filler words that say nothing about which drug it is. */
const FORM_WORDS = new Set(["tab", "cap", "syr", "susp", "inj", "cream", "gel", "drops", "dose", "kit", "spray", "sachet", "ml", "mg", "s"]);

/** Lower-case words with units joined to numbers ("500 mg" → "500mg") and common spellings unified. */
export function normName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’'"`]/g, "")
    .replace(/(\d)\s*gms?\b/g, "$1g")
    .replace(/(\d)\s+(mg|g|ml|mcg|iu|%)\b/g, "$1$2")
    .replace(/\bo\/c\b/g, " ova cyst ")
    .replace(/[^a-z0-9.%/+]+/g, " ")
    .split(/[\s/+]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .map((w) => (w in SYNONYMS ? SYNONYMS[w] : w))
    .filter(Boolean);
}

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); }
  return out;
};
const dice = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const [k, n] of A) inter += Math.min(n, B.get(k) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
};
const strengths = (words: string[]) => words.filter((w) => /\d/.test(w));
const nameWords = (words: string[]) => words.filter((w) => !/\d/.test(w) && !FORM_WORDS.has(w) && w.length >= 2);

/** 1 − edit distance / length: "amoxycilin" ≈ "amoxicillin" (0.82), "levofloxacin" vs "ciprofloxacin" (0.62). */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** 0..1 — how alike two names are. Different strengths (500mg vs 250mg) count as different drugs. */
export function nameScore(a: string, b: string): number {
  const wa = normName(a), wb = normName(b);
  if (!wa.length || !wb.length) return 0;
  const ja = wa.join(" "), jb = wb.join(" ");
  if (ja === jb) return 1;
  const setA = new Set(wa), setB = new Set(wb);
  const inter = [...setA].filter((w) => setB.has(w)).length;
  const jaccard = inter / new Set([...setA, ...setB]).size;
  const containment = inter / Math.min(setA.size, setB.size);
  const score = Math.max(jaccard, 0.9 * containment * (inter >= 2 ? 1 : 0.85), 0.95 * dice(ja.replace(/ /g, ""), jb.replace(/ /g, "")));
  // The drug / test name itself must agree (a close spelling counts), not just the strength or form
  const na = nameWords(wa), nb = nameWords(wb);
  if (na.length && nb.length) {
    const best = Math.max(...na.map((x) => Math.max(...nb.map((y) => (x.length >= 4 && y.length >= 4 ? wordSimilarity(x, y) : x === y ? 1 : 0)))));
    if (best < 0.75) return score * 0.5;
  }
  const sa = strengths(wa), sb = strengths(wb);
  if (sa.length && sb.length && !sa.some((x) => sb.includes(x))) return score * 0.5;
  return Math.min(score, 0.99);
}

export type Target = { id: string; name: string; cash: number | null; insurance: number | null };
export type MatchStatus = "exact" | "similar" | "new";
export type Match = { line: PriceLine; target?: Target; score: number; status: MatchStatus; change: boolean };

export const EXACT = 0.95;
export const SIMILAR = 0.72;

/**
 * Best target for each line. A target is only used once (the closest line wins);
 * lines like "FBS/RBS" are tried as each part too.
 */
export function matchLines(lines: PriceLine[], targets: Target[]): Match[] {
  const cands = lines.map((line) => {
    const variants = [line.name, ...(/\//.test(line.name) && !/\d/.test(line.name) ? line.name.split("/") : [])];
    let best: { target?: Target; score: number } = { score: 0 };
    for (const t of targets) {
      const sc = Math.max(...variants.map((v) => nameScore(v, t.name)));
      if (sc > best.score) best = { target: t, score: sc };
    }
    return { line, ...best };
  });
  // One line per target: keep the highest score, push the others to "new"
  const owner = new Map<string, number>();
  cands.forEach((c, i) => {
    if (!c.target || c.score < SIMILAR) return;
    const prev = owner.get(c.target.id);
    if (prev === undefined || cands[prev].score < c.score) owner.set(c.target.id, i);
  });
  return cands.map((c, i) => {
    const kept = c.target && c.score >= SIMILAR && owner.get(c.target.id) === i;
    const target = kept ? c.target : undefined;
    const status: MatchStatus = !target ? "new" : c.score >= EXACT ? "exact" : "similar";
    return { line: c.line, target, score: c.score, status, change: !!target && isPriceChange(c.line, target) };
  });
}

export const isPriceChange = (line: Pick<PriceLine, "cash" | "insurance">, t: Pick<Target, "cash" | "insurance">) =>
  Number(t.cash ?? NaN) !== line.cash || (line.insurance ?? null) !== (t.insurance == null ? null : Number(t.insurance));

/** "ANTIBIOTICS" → "Antibiotics" for the inventory category. */
export const sectionCategory = (s: string) =>
  s.trim().toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, "and");
