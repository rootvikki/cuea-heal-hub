import { describe, expect, test } from "bun:test";
import { matchLines, nameScore, parsePriceRows, sectionCategory, wordSimilarity } from "./priceList";

const SHEET: unknown[][] = [
  ["  CUEA  PRICE LIST 2025 ", null, null],
  ["NAME OF DRUG", "Cash", "INS"],
  ["ANTIBIOTICS", null, null],
  ["Caps Amoxycilin 500mg", 10, 15],
  ["Levofloxacin 500mg", 15, 50],
  ["Ceftriaxone 1 gm inj", 150, 700],
  ["PROCEDURES", null, null],
  ["Ear Syringing", 300, 500],
  ["      LABORATORY SERVICES", null, null],
  ["FBS/RBS", 100, 500],
  ["PDT  (PREGNACY TEST)", 150, 300],
  ["STOOL ANALYSIS o/c", 150, 500],
];

describe("parsePriceRows", () => {
  const { lines, error } = parsePriceRows(SHEET);
  test("finds the Cash / INS columns and sections", () => {
    expect(error).toBeUndefined();
    expect(lines.filter((l) => l.kind === "drug").map((l) => l.name)).toEqual(["Caps Amoxycilin 500mg", "Levofloxacin 500mg", "Ceftriaxone 1 gm inj"]);
    expect(lines.find((l) => l.name === "Ear Syringing")?.kind).toBe("procedure");
    expect(lines[0]).toMatchObject({ section: "ANTIBIOTICS", cash: 10, insurance: 15, row: 4 });
  });
  test("one lab price for 'FBS/RBS' becomes two lines", () => {
    expect(lines.filter((l) => l.kind === "lab").map((l) => l.name)).toEqual(["FBS", "RBS", "PDT (PREGNACY TEST)", "STOOL ANALYSIS o/c"]);
  });
  test("a sheet without a Cash heading is refused", () => {
    expect(parsePriceRows([["Drug", "Price"], ["X", 1]]).error).toContain("Cash");
  });
});

describe("name matching", () => {
  test("spelling and word order differences still match", () => {
    expect(nameScore("Caps Amoxycilin 500mg", "Amoxicillin 500mg Caps")).toBeGreaterThan(0.72);
    expect(nameScore("Ceftriaxone 1 gm inj", "Ceftriaxone 1g Injection")).toBeGreaterThan(0.95);
  });
  test("a different drug or strength does not match", () => {
    expect(nameScore("Levofloxacin 500mg", "Ciprofloxacin 500mg")).toBeLessThan(0.72);
    expect(nameScore("Amlodipine 5mg", "Amlodipine 10mg")).toBeLessThan(0.72);
  });
  test("wordSimilarity", () => {
    expect(wordSimilarity("amoxycilin", "amoxicillin")).toBeGreaterThan(0.75);
    expect(wordSimilarity("levofloxacin", "ciprofloxacin")).toBeLessThan(0.75);
  });
  test("lab short forms and misspellings", () => {
    const { lines } = parsePriceRows(SHEET);
    const tests = ["FBS (Fasting Blood Sugar)", "RBS (Random Blood Sugar)", "Pregnancy Test (HCG)", "Stool for Ova & Cysts"].map((name, i) => ({ id: String(i), name, cash: 0, insurance: null }));
    const m = matchLines(lines.filter((l) => l.kind === "lab"), tests);
    expect(m.map((x) => x.target?.name)).toEqual(tests.map((t) => t.name));
    expect(m.every((x) => x.change)).toBe(true);
  });
  test("each target is used once; same prices are not a change", () => {
    const lines = parsePriceRows(SHEET).lines.filter((l) => l.kind === "drug");
    const m = matchLines(lines, [{ id: "a", name: "Amoxicillin 500mg Caps", cash: 10, insurance: 15 }]);
    expect(m.filter((x) => x.target).length).toBe(1);
    expect(m[0]).toMatchObject({ status: "similar", change: false });
    expect(m[1].status).toBe("new");
  });
  test("sectionCategory", () => expect(sectionCategory("MINERALS, SUPPLEMENTS AND IRONS")).toBe("Minerals, Supplements and Irons"));
});
