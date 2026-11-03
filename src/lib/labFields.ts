/**
 * Structured result templates per lab test, flag helpers and result
 * classification shared by the Laboratory, Consultation, Dental and reports.
 */
export type LabFieldDef = { name: string; unit?: string; ref?: string; refMale?: string; refFemale?: string };

// Structured result field definitions per test type
export const STRUCTURED_FIELDS: Record<string, LabFieldDef[]> = {
  "Full Hemogram": [
    { name: "WBC", unit: "10^3/µL", ref: "3.50-9.50" },
    { name: "NEU#", unit: "10^3/µL", ref: "1.80-6.30" },
    { name: "NEU%", unit: "%", ref: "40.0-75.0" },
    { name: "LYM#", unit: "10^3/µL", ref: "1.10-3.20" },
    { name: "LYM%", unit: "%", ref: "20.0-50.0" },
    { name: "MON#", unit: "10^3/µL", ref: "0.10-0.60" },
    { name: "MON%", unit: "%", ref: "3.0-10.0" },
    { name: "EOS#", unit: "10^3/µL", ref: "0.02-0.52" },
    { name: "EOS%", unit: "%", ref: "0.4-8.0" },
    { name: "BAS#", unit: "10^3/µL", ref: "0.00-0.06" },
    { name: "BAS%", unit: "%", ref: "0.0-1.0" },
    { name: "RBC", unit: "10^6/µL", ref: "3.80-5.80" },
    { name: "HGB", unit: "g/dL", ref: "11.5-17.5" },
    { name: "HCT", unit: "%", ref: "35.0-50.0" },
    { name: "MCV", unit: "fL", ref: "82.0-100.0" },
    { name: "MCH", unit: "pg", ref: "27.0-34.0" },
    { name: "MCHC", unit: "g/dL", ref: "31.6-35.4" },
    { name: "RDW_CV", unit: "%", ref: "10.0-15.0" },
    { name: "RDW_SD", unit: "fL", ref: "35.0-56.0" },
    { name: "PLT", unit: "10^3/µL", ref: "125-350" },
    { name: "MPV", unit: "fL", ref: "6.5-12.0" },
    { name: "PDW", unit: "", ref: "9.0-17.0" },
    { name: "PCT", unit: "%", ref: "0.17-0.35" },
    { name: "P_LCR", unit: "%", ref: "11.0-45.0" },
    { name: "P_LCC", unit: "10^3/µL", ref: "30-90" },
    { name: "*ALY#", unit: "10^3/µL" },
    { name: "*ALY%", unit: "%" },
    { name: "*LIC#", unit: "10^3/µL" },
    { name: "*LIC%", unit: "%" },
    { name: "*NLR", unit: "" },
    { name: "*PLR", unit: "" },
    { name: "*NRBC#", unit: "10^9/L" },
    { name: "*NRBC%", unit: "%" },
  ],
  "Urinalysis": [
    { name: "Color", unit: "" },
    { name: "Appearance", unit: "" },
    { name: "pH", unit: "", ref: "4.5-8.0" },
    { name: "Specific Gravity", unit: "", ref: "1.005-1.030" },
    { name: "Leukocytes", unit: "" },
    { name: "Nitrites", unit: "" },
    { name: "Blood", unit: "" },
    { name: "Bilirubin", unit: "" },
    { name: "Urobilinogen", unit: "" },
    { name: "Protein", unit: "" },
    { name: "Glucose", unit: "" },
    { name: "Ketones", unit: "" },
    { name: "Pus Cells", unit: "/HPF", ref: "0-5" },
    { name: "RBCs", unit: "/HPF", ref: "0-2" },
    { name: "Epithelial Cells", unit: "/HPF" },
    { name: "Casts", unit: "" },
    { name: "Crystals", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "UECs (Renal Function)": [
    { name: "Creatinine", unit: "µmol/L", refMale: "62-115", refFemale: "44-97" },
    { name: "Urea", unit: "mmol/L", ref: "2.5-7.1" },
    { name: "K+", unit: "mmol/L", ref: "3.5-5.0" },
    { name: "Na+", unit: "mmol/L", ref: "136-145" },
    { name: "Cl-", unit: "mmol/L", ref: "98-106" },
    { name: "PHOS", unit: "mmol/L", ref: "0.8-1.5" },
    { name: "tCO2", unit: "mmol/L", ref: "22-29" },
    { name: "Ca", unit: "mmol/L", ref: "2.1-2.6" },
    { name: "Uric Acid", unit: "µmol/L", refMale: "200-420", refFemale: "140-360" },
    { name: "Mg", unit: "mmol/L", ref: "0.7-1.0" },
    { name: "eGFR", unit: "mL/min", ref: ">90" },
  ],
  "Liver Function Test": [
    { name: "Albumin", unit: "g/L", ref: "35-50" },
    { name: "Globulin", unit: "g/L", ref: "23-35" },
    { name: "Total Protein", unit: "g/L", ref: "60-83" },
    { name: "Total Bilirubin", unit: "µmol/L", ref: "2-17" },
    { name: "Direct Bilirubin", unit: "µmol/L", ref: "0-5" },
    { name: "GGT", unit: "U/L", refMale: "8-61", refFemale: "5-36" },
    { name: "ALT", unit: "U/L", ref: "7-56" },
    { name: "AST", unit: "U/L", ref: "10-40" },
    { name: "Amylase", unit: "U/L", ref: "28-100" },
    { name: "Lipase", unit: "U/L", ref: "0-160" },
    { name: "ALP", unit: "U/L", ref: "44-147" },
  ],
  "Lipid Profile": [
    { name: "Total Cholesterol", unit: "mmol/L", ref: "<5.2" },
    { name: "Triglycerides", unit: "mmol/L", ref: "<1.7" },
    { name: "HDL", unit: "mmol/L", ref: ">1.0" },
    { name: "LDL", unit: "mmol/L", ref: "<2.6" },
    { name: "VLDL", unit: "mmol/L", ref: "<0.7" },
    { name: "TC/HDL Ratio", unit: "", ref: "<5.0" },
  ],
  "Stool for Ova & Cysts": [
    { name: "Color", unit: "" },
    { name: "Consistency", unit: "" },
    { name: "Appearance", unit: "" },
    { name: "Mucus", unit: "" },
    { name: "Blood (Occult)", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Ova", unit: "" },
    { name: "Cysts", unit: "" },
    { name: "Trophozoites", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Fat Globules", unit: "" },
    { name: "Charcot-Leyden Crystals", unit: "" },
  ],
  "HVS Wet Prep": [
    { name: "Epithelial Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Trichomonas", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Clue Cells", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "HVS Gram Stain": [
    { name: "Gram +ve Cocci", unit: "" },
    { name: "Gram -ve Cocci", unit: "" },
    { name: "Gram +ve Bacilli", unit: "" },
    { name: "Gram -ve Bacilli", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "Epithelial Cells", unit: "" },
  ],
  "Urethral Swab Wet Prep": [
    { name: "Epithelial Cells", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
    { name: "RBCs", unit: "/HPF" },
    { name: "Trichomonas", unit: "" },
    { name: "Yeast Cells", unit: "" },
    { name: "Bacteria", unit: "" },
  ],
  "Urethral Swab Gram Stain": [
    { name: "Gram +ve Cocci", unit: "" },
    { name: "Gram -ve Cocci", unit: "" },
    { name: "Gram +ve Bacilli", unit: "" },
    { name: "Gram -ve Bacilli", unit: "" },
    { name: "Intracellular Diplococci", unit: "" },
    { name: "Pus Cells", unit: "/HPF" },
  ],
  "Blood Group & Rhesus": [
    { name: "ABO Group", unit: "" },
    { name: "Rhesus (D)", unit: "" },
  ],
  "ESR": [
    { name: "ESR (1hr)", unit: "mm/hr", refMale: "0-15", refFemale: "0-20" },
  ],
  "FBS (Fasting Blood Sugar)": [
    { name: "Fasting Blood Sugar", unit: "mmol/L", ref: "3.9-5.6" },
  ],
  "RBS (Random Blood Sugar)": [
    { name: "Random Blood Sugar", unit: "mmol/L", ref: "3.9-7.8" },
  ],
  "HB Levels": [
    { name: "Haemoglobin", unit: "g/dL", refMale: "13.0-17.0", refFemale: "12.0-16.0" },
  ],
};


/** Reference range for a field, using the patient's gender when the test has separate ranges. */
export const refRangeFor = (def: LabFieldDef, gender?: string | null) => {
  const g = gender?.toLowerCase();
  return (g === "female" && def.refFemale) ? def.refFemale : (g === "male" && def.refMale) ? def.refMale : def.ref;
};

/** "H" / "L" / null for a numeric value against a range like "3.5-9.5", "<5.2" or ">1.0". */
export const getFlag = (value: string, refRange: string | undefined | null): "H" | "L" | null => {
  if (!refRange || !value) return null;
  const numVal = parseFloat(value);
  if (isNaN(numVal)) return null;
  if (refRange.startsWith("<")) return numVal >= parseFloat(refRange.slice(1)) ? "H" : null;
  if (refRange.startsWith(">")) return numVal <= parseFloat(refRange.slice(1)) ? "L" : null;
  const match = refRange.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (match) {
    if (numVal < parseFloat(match[1])) return "L";
    if (numVal > parseFloat(match[2])) return "H";
  }
  return null;
};

export type ResultCategory = "positive" | "negative" | "abnormal" | "normal" | "pending" | "other";

export const RESULT_CATEGORY_LABELS: Record<ResultCategory, string> = {
  positive: "Positive (+ve)",
  negative: "Negative (-ve)",
  abnormal: "Abnormal",
  normal: "Normal",
  pending: "Pending",
  other: "Other",
};

const NEG = /(non[-\s]?reactive|not\s+detected|negative|\bneg\b|-ve|\bnil\b|not\s+seen|absent|no\s+growth)/i;
const POS = /(reactive|detected|positive|\bpos\b|\+ve|\bseen\b|present|growth)/i;

/** Classifies a lab order's result for reports: +ve / -ve / abnormal / normal / pending / other. */
export function resultCategory(order: { status?: string | null; result_value?: string | null; flag?: string | null }): ResultCategory {
  if (order.status !== "completed") return "pending";
  const v = (order.result_value || "").trim();
  if (v && v !== "See structured results") {
    if (NEG.test(v)) return "negative";
    if (POS.test(v)) return "positive";
  }
  if (order.flag === "abnormal") return "abnormal";
  if (order.flag === "positive") return "positive";
  if (order.flag === "negative") return "negative";
  if (v === "See structured results" || /^[\d.]+/.test(v)) return "normal";
  return v ? "other" : "normal";
}
