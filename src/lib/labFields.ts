/**
 * Lab result templates (what each test asks for and which answers are allowed),
 * reference ranges by sex and age, critical values, flags and result classification.
 * Shared by the Laboratory, Consultation, Dental, printouts and reports.
 *
 * Stored flags on each result line (lab_result_fields.flag):
 *   H / L    outside the reference range
 *   HH / LL  critical (panic) value — the doctor is alerted at once
 *   POS      a positive / reactive / organism-seen answer
 *   A        another abnormal answer (e.g. cloudy urine)
 *   C        a critical answer from a list
 */

export type FieldKind = "number" | "choice" | "multi" | "text";
export type RangeRule = { sex?: "male" | "female"; minAge?: number; maxAge?: number; ref: string };

export interface LabFieldDef {
  name: string;
  unit?: string;
  /** Defaults to "choice" when options are given, otherwise "number". */
  kind?: FieldKind;
  ref?: string;
  refMale?: string;
  refFemale?: string;
  /** Age / sex specific ranges, checked before refMale / refFemale / ref. Ages in years; maxAge is exclusive. */
  ranges?: RangeRule[];
  critLow?: number;
  critHigh?: number;
  options?: string[];
  /** Answers that are normal. Not given → the answer is never flagged. */
  normal?: string[];
  /** Answers that are neither normal nor positive (e.g. "Invalid"). */
  neutral?: string[];
  /** Answers that are critical (alert the doctor). */
  criticalOptions?: string[];
  /** Flag used for an abnormal answer: POS for positive/reactive scales, A otherwise. */
  abnormalFlag?: "POS" | "A";
  /** Not every run includes it, so it may be left empty. */
  optional?: boolean;
  /** Only asked when another answer on the same test is one of these values. */
  showIf?: { field: string; in: string[] };
}

export type LabFlag = "H" | "L" | "HH" | "LL" | "POS" | "A" | "C";

// ─── Answer scales ────────────────────────────────────────────────
const NEG_POS = ["Negative", "Positive"];
const NONREACTIVE = ["Non-reactive", "Reactive"];
const DIP = ["Negative", "Trace", "+", "++", "+++", "++++"];
const DIP3 = ["Negative", "Trace", "+", "++", "+++"];
const GRADE = ["None seen", "Few", "Moderate", "Many"];
const AMOUNT = ["Few", "Moderate", "Many"];
const SEEN = ["Not seen", "Seen"];
const ABSENT = ["Absent", "Present"];
const TITRE_BRUCELLA = ["1:20", "1:40", "1:80", "1:160", "1:320", "1:640"];
const TITRE_VDRL = ["1:1", "1:2", "1:4", "1:8", "1:16", "1:32", "1:64"];
const TITRE_WIDAL = ["<1:20", "1:20", "1:40", "1:80", "1:160", "1:320"];

const posNeg = (name: string, options = NEG_POS, extra: Partial<LabFieldDef> = {}): LabFieldDef =>
  ({ name, options, normal: [options[0]], abnormalFlag: "POS", ...extra });
const grade = (name: string, normal = ["None seen"], extra: Partial<LabFieldDef> = {}): LabFieldDef =>
  ({ name, options: GRADE, normal, ...extra });
const organisms = (name: string, list: string[]): LabFieldDef =>
  ({ name, kind: "multi", options: ["None seen", ...list], normal: ["None seen"], abnormalFlag: "POS" });

const MPS_SEEN = { field: "Malaria parasites", in: ["Seen"] };

export const STRUCTURED_FIELDS: Record<string, LabFieldDef[]> = {
  // ─── Haematology ───
  "Full Hemogram": [
    { name: "WBC", unit: "10^3/µL", ref: "3.50-9.50", ranges: [{ maxAge: 12, ref: "4.50-13.50" }], critLow: 2.0, critHigh: 30.0 },
    { name: "NEU#", unit: "10^3/µL", ref: "1.80-6.30", critLow: 0.5 },
    { name: "NEU%", unit: "%", ref: "40.0-75.0" },
    { name: "LYM#", unit: "10^3/µL", ref: "1.10-3.20" },
    { name: "LYM%", unit: "%", ref: "20.0-50.0" },
    { name: "MON#", unit: "10^3/µL", ref: "0.10-0.60" },
    { name: "MON%", unit: "%", ref: "3.0-10.0" },
    { name: "EOS#", unit: "10^3/µL", ref: "0.02-0.52" },
    { name: "EOS%", unit: "%", ref: "0.4-8.0" },
    { name: "BAS#", unit: "10^3/µL", ref: "0.00-0.06" },
    { name: "BAS%", unit: "%", ref: "0.0-1.0" },
    { name: "RBC", unit: "10^6/µL", ref: "3.80-5.80", refMale: "4.30-5.80", refFemale: "3.80-5.10" },
    { name: "HGB", unit: "g/dL", refMale: "13.0-17.5", refFemale: "11.5-15.5", ranges: [{ maxAge: 12, ref: "11.0-14.5" }], critLow: 7.0, critHigh: 20.0 },
    { name: "HCT", unit: "%", refMale: "40.0-50.0", refFemale: "35.0-45.0", ranges: [{ maxAge: 12, ref: "33.0-43.0" }], critLow: 20, critHigh: 60 },
    { name: "MCV", unit: "fL", ref: "82.0-100.0" },
    { name: "MCH", unit: "pg", ref: "27.0-34.0" },
    { name: "MCHC", unit: "g/dL", ref: "31.6-35.4" },
    { name: "RDW_CV", unit: "%", ref: "10.0-15.0" },
    { name: "RDW_SD", unit: "fL", ref: "35.0-56.0" },
    { name: "PLT", unit: "10^3/µL", ref: "125-350", critLow: 50, critHigh: 1000 },
    { name: "MPV", unit: "fL", ref: "6.5-12.0" },
    { name: "PDW", unit: "", ref: "9.0-17.0" },
    { name: "PCT", unit: "%", ref: "0.17-0.35" },
    { name: "P_LCR", unit: "%", ref: "11.0-45.0", optional: true },
    { name: "P_LCC", unit: "10^3/µL", ref: "30-90", optional: true },
    { name: "*ALY#", unit: "10^3/µL", optional: true },
    { name: "*ALY%", unit: "%", optional: true },
    { name: "*LIC#", unit: "10^3/µL", optional: true },
    { name: "*LIC%", unit: "%", optional: true },
    { name: "*NLR", unit: "", optional: true },
    { name: "*PLR", unit: "", optional: true },
    { name: "*NRBC#", unit: "10^9/L", optional: true },
    { name: "*NRBC%", unit: "%", optional: true },
  ],
  "HB Levels": [
    { name: "Haemoglobin", unit: "g/dL", refMale: "13.0-17.0", refFemale: "12.0-16.0", ranges: [{ maxAge: 12, ref: "11.0-14.5" }], critLow: 7.0, critHigh: 20.0 },
  ],
  "ESR": [
    { name: "ESR (1hr)", unit: "mm/hr", refMale: "0-15", refFemale: "0-20", ranges: [{ maxAge: 12, ref: "0-10" }, { minAge: 50, sex: "male", ref: "0-20" }, { minAge: 50, sex: "female", ref: "0-30" }] },
  ],
  "Blood Group & Rhesus": [
    { name: "ABO Group", options: ["A", "B", "AB", "O"] },
    { name: "Rhesus (D)", options: ["Positive", "Negative"] },
  ],

  // ─── Biochemistry ───
  "Blood Glucose": [
    { name: "Blood Glucose", unit: "mg/dL", ref: "70-100", critLow: 45, critHigh: 450 },
  ],
  "FBS (Fasting Blood Sugar)": [
    { name: "Fasting Blood Sugar", unit: "mmol/L", ref: "3.9-5.6", critLow: 2.5, critHigh: 25 },
  ],
  "RBS (Random Blood Sugar)": [
    { name: "Random Blood Sugar", unit: "mmol/L", ref: "3.9-7.8", critLow: 2.5, critHigh: 25 },
  ],
  "UECs (Renal Function)": [
    { name: "Urea", unit: "mmol/L", ref: "2.5-7.1", critHigh: 30 },
    { name: "Creatinine", unit: "µmol/L", refMale: "62-115", refFemale: "44-97", critHigh: 442 },
    { name: "Na+", unit: "mmol/L", ref: "136-145", critLow: 120, critHigh: 160 },
    { name: "K+", unit: "mmol/L", ref: "3.5-5.0", critLow: 2.8, critHigh: 6.2 },
    { name: "Cl-", unit: "mmol/L", ref: "98-106", critLow: 80, critHigh: 120 },
    { name: "tCO2", unit: "mmol/L", ref: "22-29", critLow: 10, critHigh: 40, optional: true },
    { name: "Ca", unit: "mmol/L", ref: "2.1-2.6", critLow: 1.65, critHigh: 3.25, optional: true },
    { name: "PHOS", unit: "mmol/L", ref: "0.8-1.5", critLow: 0.32, optional: true },
    { name: "Mg", unit: "mmol/L", ref: "0.7-1.0", critLow: 0.4, critHigh: 2.0, optional: true },
    { name: "Uric Acid", unit: "µmol/L", refMale: "200-420", refFemale: "140-360", optional: true },
    { name: "eGFR", unit: "mL/min", ref: ">90", critLow: 15, optional: true },
  ],
  "Liver Function Test": [
    { name: "Total Protein", unit: "g/L", ref: "60-83" },
    { name: "Albumin", unit: "g/L", ref: "35-50" },
    { name: "Globulin", unit: "g/L", ref: "23-35" },
    { name: "Total Bilirubin", unit: "µmol/L", ref: "2-17", critHigh: 257 },
    { name: "Direct Bilirubin", unit: "µmol/L", ref: "0-5" },
    { name: "ALT", unit: "U/L", ref: "7-56" },
    { name: "AST", unit: "U/L", ref: "10-40" },
    { name: "ALP", unit: "U/L", ref: "44-147" },
    { name: "GGT", unit: "U/L", refMale: "8-61", refFemale: "5-36" },
    { name: "Amylase", unit: "U/L", ref: "28-100", optional: true },
    { name: "Lipase", unit: "U/L", ref: "0-160", optional: true },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mmol/L", ref: "<5.2" },
    { name: "Triglycerides", unit: "mmol/L", ref: "<1.7" },
    { name: "HDL", unit: "mmol/L", ref: ">1.0" },
    { name: "LDL", unit: "mmol/L", ref: "<2.6" },
    { name: "VLDL", unit: "mmol/L", ref: "<0.7", optional: true },
    { name: "TC/HDL Ratio", unit: "", ref: "<5.0", optional: true },
  ],
  "Occult Blood": [posNeg("Result")],
  "Pregnancy Test (HCG)": [posNeg("Result")],

  // ─── Urinalysis ───
  "Urinalysis": [
    { name: "Color", options: ["Colourless", "Pale yellow", "Yellow", "Dark yellow", "Amber", "Orange", "Red", "Brown"], normal: ["Colourless", "Pale yellow", "Yellow", "Dark yellow"] },
    { name: "Appearance", options: ["Clear", "Slightly cloudy", "Cloudy", "Turbid"], normal: ["Clear"] },
    { name: "pH", unit: "", ref: "4.5-8.0" },
    { name: "Specific Gravity", unit: "", ref: "1.005-1.030" },
    { name: "Leukocytes", options: DIP3, normal: ["Negative"] },
    { name: "Nitrites", options: NEG_POS, normal: ["Negative"], abnormalFlag: "POS" },
    { name: "Blood", options: DIP3, normal: ["Negative"] },
    { name: "Protein", options: DIP, normal: ["Negative", "Trace"] },
    { name: "Glucose", options: DIP, normal: ["Negative"] },
    { name: "Ketones", options: DIP3, normal: ["Negative"] },
    { name: "Bilirubin", options: ["Negative", "+", "++", "+++"], normal: ["Negative"] },
    { name: "Urobilinogen", options: ["Normal", "+", "++", "+++"], normal: ["Normal"] },
    { name: "Pus Cells", unit: "/HPF", ref: "0-5" },
    { name: "RBCs", unit: "/HPF", ref: "0-2" },
    { name: "Epithelial Cells", options: AMOUNT, normal: ["Few"] },
    { name: "Casts", kind: "multi", options: ["None seen", "Hyaline", "Granular", "RBC casts", "WBC casts", "Waxy"], normal: ["None seen", "Hyaline"] },
    { name: "Crystals", kind: "multi", options: ["None seen", "Calcium oxalate", "Uric acid", "Triple phosphate", "Amorphous", "Cystine"], normal: ["None seen"] },
    { name: "Bacteria", options: GRADE, normal: ["None seen", "Few"] },
    { name: "Yeast Cells", options: SEEN, normal: ["Not seen"], abnormalFlag: "POS" },
    { name: "Trichomonas vaginalis", options: SEEN, normal: ["Not seen"], abnormalFlag: "POS" },
  ],

  // ─── Parasitology ───
  "Stool for Ova & Cysts": [
    { name: "Color", options: ["Brown", "Yellow", "Green", "Black", "Red", "Pale / clay"], normal: ["Brown", "Yellow"] },
    { name: "Consistency", options: ["Formed", "Semi-formed", "Loose", "Watery", "Hard", "Mucoid"], normal: ["Formed", "Semi-formed"] },
    { name: "Mucus", options: ABSENT, normal: ["Absent"] },
    posNeg("Blood (Occult)"),
    grade("Pus Cells"),
    grade("RBCs"),
    organisms("Ova", ["Ascaris lumbricoides", "Hookworm", "Trichuris trichiura", "Taenia spp.", "Schistosoma mansoni", "Enterobius vermicularis", "Hymenolepis nana"]),
    organisms("Cysts", ["Entamoeba histolytica/dispar", "Giardia lamblia", "Entamoeba coli", "Endolimax nana", "Iodamoeba bütschlii"]),
    organisms("Trophozoites", ["Entamoeba histolytica/dispar", "Giardia lamblia", "Trichomonas hominis", "Balantidium coli"]),
    organisms("Larvae", ["Strongyloides stercoralis"]),
    grade("Yeast Cells"),
    { name: "Fat Globules", options: ABSENT, normal: ["Absent"] },
    { name: "Charcot-Leyden Crystals", options: ABSENT, normal: ["Absent"] },
  ],
  "BS for MPS": [
    posNeg("Malaria parasites", SEEN),
    { name: "Species", options: ["P. falciparum", "P. vivax", "P. ovale", "P. malariae", "Mixed infection"], showIf: MPS_SEEN },
    { name: "Stage", options: ["Trophozoites", "Gametocytes", "Trophozoites & gametocytes", "Schizonts"], showIf: MPS_SEEN },
    { name: "Grade", options: ["+ (1–10 per 100 fields)", "++ (11–100 per 100 fields)", "+++ (1–10 per field)", "++++ (>10 per field)"], criticalOptions: ["++++ (>10 per field)"], showIf: MPS_SEEN },
    { name: "Parasite density", unit: "/µL", critHigh: 100000, optional: true, showIf: MPS_SEEN },
  ],
  "Malaria Test": [posNeg("Result")],
  "MRDT (Malaria RDT)": [
    posNeg("Result", ["Negative", "P. falciparum positive", "Pan (non-falciparum) positive", "P. falciparum + Pan positive", "Invalid – repeat test"], { neutral: ["Invalid – repeat test"] }),
  ],

  // ─── Microbiology ───
  "HVS Wet Prep": [
    { name: "Epithelial Cells", options: AMOUNT },
    grade("Pus Cells", ["None seen", "Few"]),
    grade("RBCs"),
    posNeg("Trichomonas vaginalis", SEEN),
    posNeg("Yeast Cells", SEEN),
    posNeg("Clue Cells", SEEN),
    { name: "Bacteria", options: AMOUNT },
  ],
  "HVS Gram Stain": [
    { name: "Gram +ve Bacilli", options: GRADE },
    grade("Gram +ve Cocci", ["None seen", "Few"]),
    grade("Gram -ve Bacilli", ["None seen", "Few"]),
    grade("Gram -ve Cocci"),
    grade("Yeast Cells"),
    grade("Pus Cells", ["None seen", "Few"]),
    { name: "Epithelial Cells", options: AMOUNT },
  ],
  "Urethral Swab Wet Prep": [
    { name: "Epithelial Cells", options: AMOUNT },
    grade("Pus Cells", ["None seen", "Few"]),
    grade("RBCs"),
    posNeg("Trichomonas vaginalis", SEEN),
    posNeg("Yeast Cells", SEEN),
    { name: "Bacteria", options: GRADE, normal: ["None seen", "Few"] },
  ],
  "Urethral Swab Gram Stain": [
    posNeg("Intracellular Gram -ve diplococci", SEEN),
    grade("Gram +ve Cocci", ["None seen", "Few"]),
    grade("Gram -ve Cocci"),
    { name: "Gram +ve Bacilli", options: GRADE },
    grade("Gram -ve Bacilli", ["None seen", "Few"]),
    grade("Pus Cells", ["None seen", "Few"]),
  ],

  // ─── Serology ───
  "ASOT": [posNeg("Result", ["Negative (<200 IU/mL)", "Positive (≥200 IU/mL)"])],
  "Brucella Test": [
    posNeg("Result"),
    { name: "Titre", options: TITRE_BRUCELLA, showIf: { field: "Result", in: ["Positive"] } },
  ],
  "H. Pylori Antigen": [posNeg("Result")],
  "HBsAg (Hepatitis B)": [posNeg("Result", NONREACTIVE)],
  "HCV (Hepatitis C)": [posNeg("Result", NONREACTIVE)],
  "HIV Test": [posNeg("Result", [...NONREACTIVE, "Inconclusive"], { neutral: ["Inconclusive"] })],
  "VCT/PITC": [posNeg("Result", [...NONREACTIVE, "Inconclusive"], { neutral: ["Inconclusive"] })],
  "Rheumatoid Factor": [posNeg("Result")],
  "Salmonella Antigen (SAT)": [posNeg("Result")],
  "VDRL": [
    posNeg("Result", NONREACTIVE),
    { name: "Titre", options: TITRE_VDRL, showIf: { field: "Result", in: ["Reactive"] } },
  ],
  "Widal Test": [
    { name: "S. typhi O", options: TITRE_WIDAL, normal: ["<1:20", "1:20", "1:40", "1:80"], abnormalFlag: "POS" },
    { name: "S. typhi H", options: TITRE_WIDAL, normal: ["<1:20", "1:20", "1:40", "1:80"], abnormalFlag: "POS" },
    { name: "S. paratyphi AH", options: TITRE_WIDAL, normal: ["<1:20", "1:20", "1:40", "1:80"], abnormalFlag: "POS", optional: true },
    { name: "S. paratyphi BH", options: TITRE_WIDAL, normal: ["<1:20", "1:20", "1:40", "1:80"], abnormalFlag: "POS", optional: true },
  ],
};

/** Tests answered with one main result (rapid tests, single values): the answer is also the order's headline result. */
const PANEL_TESTS = new Set([
  "Full Hemogram", "UECs (Renal Function)", "Liver Function Test", "Lipid Profile", "Urinalysis", "Stool for Ova & Cysts",
  "HVS Wet Prep", "HVS Gram Stain", "Urethral Swab Wet Prep", "Urethral Swab Gram Stain", "Widal Test",
]);
export const isPanelTest = (testName?: string | null) => PANEL_TESTS.has(testName || "");
export const PANEL_RESULT = "See structured results";

export const fieldKind = (def: LabFieldDef): FieldKind => def.kind ?? (def.options ? "choice" : "number");

const MULTI_SEP = "; ";
export const splitMulti = (value: string) => value.split(";").map((s) => s.trim()).filter(Boolean);
export const joinMulti = (values: string[]) => values.join(MULTI_SEP);

/** Toggles one answer of a multi-answer field; "None seen" (the first option) clears the others. */
export function toggleMulti(def: LabFieldDef, current: string, option: string) {
  const none = def.options?.[0];
  const set = new Set(splitMulti(current));
  if (set.has(option)) set.delete(option);
  else if (option === none) return option;
  else { set.add(option); if (none) set.delete(none); }
  return joinMulti((def.options || []).filter((o) => set.has(o)));
}

/** Reference range for a field from the patient's sex and age (years). */
export const refRangeFor = (def: LabFieldDef, gender?: string | null, ageYears?: number | null) => {
  const g = gender?.toLowerCase() === "female" ? "female" : gender?.toLowerCase() === "male" ? "male" : null;
  if (def.ranges && ageYears != null) {
    const hit = def.ranges.find((r) => (!r.sex || r.sex === g) && (r.minAge == null || ageYears >= r.minAge) && (r.maxAge == null || ageYears < r.maxAge));
    if (hit) return hit.ref;
  }
  if (!def.kind && def.options) return referenceText(def);
  return (g === "female" && def.refFemale) ? def.refFemale : (g === "male" && def.refMale) ? def.refMale : def.ref;
};

/** What a normal answer looks like, printed in the reference column (e.g. "Negative"). */
export const referenceText = (def: LabFieldDef) => (def.normal?.length ? def.normal.join(" / ") : undefined);

const NUMBER = /^[<>]?\s*\d+(\.\d+)?$/;
/** True when a typed number is acceptable (digits, one decimal point, optional < or >). */
export const isValidNumber = (value: string) => NUMBER.test(value.trim());
const toNumber = (value: string) => parseFloat(value.trim().replace(/^[<>]\s*/, ""));

/** "H" / "L" / null for a numeric value against a range like "3.5-9.5", "<5.2" or ">1.0". */
export const getFlag = (value: string, refRange: string | undefined | null): "H" | "L" | null => {
  if (!refRange || !value || !isValidNumber(value)) return null;
  const numVal = toNumber(value);
  if (refRange.startsWith("<")) return numVal >= parseFloat(refRange.slice(1)) ? "H" : null;
  if (refRange.startsWith(">")) return numVal <= parseFloat(refRange.slice(1)) ? "L" : null;
  const match = refRange.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (match) {
    if (numVal < parseFloat(match[1])) return "L";
    if (numVal > parseFloat(match[2])) return "H";
  }
  return null;
};

/** Flag for one answer, including critical values. */
export function fieldFlag(def: LabFieldDef, value: string, gender?: string | null, ageYears?: number | null): LabFlag | null {
  const v = (value || "").trim();
  if (!v) return null;
  const kind = fieldKind(def);
  if (kind === "number") {
    if (!isValidNumber(v)) return null;
    const n = toNumber(v);
    if (def.critLow != null && n < def.critLow) return "LL";
    if (def.critHigh != null && n > def.critHigh) return "HH";
    return getFlag(v, refRangeFor(def, gender, ageYears));
  }
  if (kind === "text" || !def.normal) return null;
  const answers = kind === "multi" ? splitMulti(v) : [v];
  if (answers.some((a) => def.criticalOptions?.includes(a))) return "C";
  if (answers.every((a) => def.normal!.includes(a) || def.neutral?.includes(a))) return null;
  return def.abnormalFlag ?? "A";
}

export const isCriticalFlag = (flag?: string | null) => flag === "HH" || flag === "LL" || flag === "C";

/** Short label for a stored flag, for screens and printouts. */
export function flagLabel(flag?: string | null): string {
  switch (flag) {
    case "H": return "↑ H";
    case "L": return "↓ L";
    case "HH": return "↑↑ CRITICAL";
    case "LL": return "↓↓ CRITICAL";
    case "C": return "CRITICAL";
    case "POS": return "+ve";
    case "A": return "Abn";
    case null: case undefined: case "": case "N": return "";
    default: return flag;
  }
}

/** Fields asked right now (hides follow-up questions such as malaria species when no parasites were seen). */
export const visibleFields = (defs: LabFieldDef[], values: Record<string, string>) =>
  defs.filter((d) => !d.showIf || d.showIf.in.includes((values[d.showIf.field] || "").trim()));

/** Names of required answers still empty or invalid. A test can't be completed until this is empty. */
export function missingAnswers(defs: LabFieldDef[], values: Record<string, string>): string[] {
  return visibleFields(defs, values)
    .filter((d) => {
      const v = (values[d.name] || "").trim();
      if (fieldKind(d) === "number" && v && !isValidNumber(v)) return true;
      return !d.optional && !v;
    })
    .map((d) => d.name);
}

/** Order-level flag: critical, abnormal (panels), positive / negative (rapid tests) or none. */
export function orderFlag(testName: string, flags: (string | null)[], values: string[]): string | null {
  if (flags.some(isCriticalFlag)) return "critical";
  if (isPanelTest(testName)) return flags.some(Boolean) ? "abnormal" : null;
  if (flags.includes("POS")) return "positive";
  if (flags.some(Boolean)) return "abnormal";
  const defs = STRUCTURED_FIELDS[testName] || [];
  const main = defs[0];
  if (main?.neutral?.includes(values[0])) return null;
  if (main && fieldKind(main) !== "number" && main.normal) return "negative";
  return null;
}

/** Headline result text for single-result tests, e.g. "Seen · P. falciparum · Trophozoites". */
export function summaryText(defs: LabFieldDef[], values: Record<string, string>) {
  return visibleFields(defs, values)
    .map((d, i) => {
      const v = (values[d.name] || "").trim();
      if (!v) return "";
      if (i === 0) return `${v}${d.unit ? ` ${d.unit}` : ""}`;
      return fieldKind(d) === "number" ? `${d.name} ${v}${d.unit ? ` ${d.unit}` : ""}` : d.name === "Titre" ? `Titre ${v}` : v;
    })
    .filter(Boolean)
    .join(" · ");
}

// ─── Picklists ────────────────────────────────────────────────────
export const CANNED_COMMENTS = [
  "Clinical correlation advised.",
  "Repeat sample advised.",
  "Result confirmed on repeat testing.",
  "Critical value — doctor informed.",
  "Sample haemolysed — interpret with caution.",
  "Sample lipaemic — interpret with caution.",
  "Fasting status not confirmed.",
  "Mixed infection seen.",
  "Few organisms seen — repeat if symptoms persist.",
  "Refer for confirmatory test.",
];

export const REJECTION_REASONS = [
  "Unlabelled or mislabelled sample",
  "Patient details do not match the request",
  "Insufficient sample volume",
  "Haemolysed sample",
  "Clotted sample (EDTA)",
  "Wrong container or tube",
  "Leaking or broken container",
  "Sample too old / delayed transport",
  "Lipaemic sample",
  "Contaminated sample",
];

// ─── Report classification ────────────────────────────────────────
export type ResultCategory = "critical" | "positive" | "negative" | "abnormal" | "normal" | "pending" | "rejected" | "other";

export const RESULT_CATEGORY_LABELS: Record<ResultCategory, string> = {
  critical: "Critical value",
  positive: "Positive (+ve)",
  negative: "Negative (-ve)",
  abnormal: "Abnormal",
  normal: "Normal",
  pending: "Pending",
  rejected: "Sample rejected",
  other: "Other",
};

const NEG = /(non[-\s]?reactive|not\s+detected|negative|\bneg\b|-ve|\bnil\b|not\s+seen|absent|no\s+growth)/i;
const POS = /(reactive|detected|positive|\bpos\b|\+ve|\bseen\b|present|growth)/i;

/** Classifies a lab order's result for reports. Uses the saved flag; older free-text results fall back to word matching. */
export function resultCategory(order: { status?: string | null; result_value?: string | null; flag?: string | null }): ResultCategory {
  if (order.status === "rejected") return "rejected";
  if (order.status !== "completed") return "pending";
  if (order.flag === "critical") return "critical";
  if (order.flag === "abnormal") return "abnormal";
  if (order.flag === "positive") return "positive";
  if (order.flag === "negative") return "negative";
  const v = (order.result_value || "").trim();
  if (v && v !== PANEL_RESULT) {
    if (NEG.test(v)) return "negative";
    if (POS.test(v)) return "positive";
  }
  if (v === PANEL_RESULT || /^[\d.]+/.test(v)) return "normal";
  return v ? "other" : "normal";
}

/** Counts of each answer per test parameter, e.g. Urinalysis › Protein › "++" = 4. */
export function answerBreakdown(orders: { test: string; status?: string | null; fields: { field_name: string; field_value: string | null; flag: string | null }[] }[]) {
  const out = new Map<string, Map<string, number>>();
  for (const o of orders) {
    if (o.status !== "completed") continue;
    const defs = STRUCTURED_FIELDS[o.test] || [];
    for (const f of o.fields) {
      const v = (f.field_value || "").trim();
      if (!v) continue;
      const def = defs.find((d) => d.name === f.field_name);
      const kind = def ? fieldKind(def) : "text";
      const answers = kind === "number"
        ? [isCriticalFlag(f.flag) ? "Critical" : f.flag === "H" ? "High" : f.flag === "L" ? "Low" : "Within range"]
        : kind === "multi" ? splitMulti(v) : [v];
      const key = `${o.test} › ${f.field_name}`;
      if (!out.has(key)) out.set(key, new Map());
      const m = out.get(key)!;
      answers.forEach((a) => m.set(a, (m.get(a) || 0) + 1));
    }
  }
  return out;
}
