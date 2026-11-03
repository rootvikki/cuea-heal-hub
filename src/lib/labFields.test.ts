import { describe, expect, test } from "bun:test";
import { STRUCTURED_FIELDS, fieldFlag, refRangeFor, missingAnswers, orderFlag, summaryText, toggleMulti, isValidNumber, answerBreakdown, resultCategory } from "./labFields";

const def = (test: string, field: string) => STRUCTURED_FIELDS[test].find((d) => d.name === field)!;

describe("critical values alert the doctor", () => {
  test("Hb below 7 g/dL is critical", () => {
    expect(fieldFlag(def("HB Levels", "Haemoglobin"), "6.5", "female", 30)).toBe("LL");
    expect(fieldFlag(def("Full Hemogram", "HGB"), "6.9", "male", 30)).toBe("LL");
  });
  test("Glucose below 2.5 mmol/L is critical", () => {
    expect(fieldFlag(def("RBS (Random Blood Sugar)", "Random Blood Sugar"), "2.3", null, 40)).toBe("LL");
    expect(fieldFlag(def("FBS (Fasting Blood Sugar)", "Fasting Blood Sugar"), "3.0", null, 40)).toBe("L");
  });
  test("Potassium above 6.2 mmol/L is critical", () => {
    expect(fieldFlag(def("UECs (Renal Function)", "K+"), "6.5", "male", 50)).toBe("HH");
  });
  test("Malaria grade ++++ is critical", () => {
    expect(fieldFlag(def("BS for MPS", "Grade"), "++++ (>10 per field)")).toBe("C");
  });
});

describe("normal ranges by sex and age", () => {
  test("Hb 12.5 is low for a man, normal for a woman", () => {
    const hb = def("HB Levels", "Haemoglobin");
    expect(fieldFlag(hb, "12.5", "male", 30)).toBe("L");
    expect(fieldFlag(hb, "12.5", "female", 30)).toBeNull();
  });
  test("children under 12 use the child range", () => {
    expect(refRangeFor(def("Full Hemogram", "WBC"), "male", 8)).toBe("4.50-13.50");
    expect(refRangeFor(def("Full Hemogram", "WBC"), "male", 30)).toBe("3.50-9.50");
  });
});

describe("drop-down answers", () => {
  test("positive rapid test is flagged +ve, negative is not", () => {
    const hiv = def("HIV Test", "Result");
    expect(fieldFlag(hiv, "Reactive")).toBe("POS");
    expect(fieldFlag(hiv, "Non-reactive")).toBeNull();
    expect(orderFlag("HIV Test", [null], ["Non-reactive"])).toBe("negative");
    expect(orderFlag("HIV Test", ["POS"], ["Reactive"])).toBe("positive");
  });
  test("urine protein ++ is abnormal, trace is not", () => {
    expect(fieldFlag(def("Urinalysis", "Protein"), "++")).toBe("A");
    expect(fieldFlag(def("Urinalysis", "Protein"), "Trace")).toBeNull();
  });
  test("organisms in stool are +ve and None seen clears them", () => {
    const cysts = def("Stool for Ova & Cysts", "Cysts");
    const two = toggleMulti(cysts, toggleMulti(cysts, "None seen", "Giardia lamblia"), "Entamoeba coli");
    expect(two).toBe("Giardia lamblia; Entamoeba coli");
    expect(fieldFlag(cysts, two)).toBe("POS");
    expect(toggleMulti(cysts, two, "None seen")).toBe("None seen");
  });
});

describe("no blank results", () => {
  test("malaria follow-up questions are only required when parasites are seen", () => {
    const defs = STRUCTURED_FIELDS["BS for MPS"];
    expect(missingAnswers(defs, { "Malaria parasites": "Not seen" })).toEqual([]);
    expect(missingAnswers(defs, { "Malaria parasites": "Seen" })).toEqual(["Species", "Stage", "Grade"]);
  });
  test("numbers only in number boxes", () => {
    expect(isValidNumber("12.5")).toBe(true);
    expect(isValidNumber("<0.1")).toBe(true);
    expect(isValidNumber("12,5")).toBe(false);
    expect(missingAnswers(STRUCTURED_FIELDS["HB Levels"], { Haemoglobin: "abc" })).toEqual(["Haemoglobin"]);
  });
});

test("headline result for single tests", () => {
  expect(summaryText(STRUCTURED_FIELDS["VDRL"], { Result: "Reactive", Titre: "1:8" })).toBe("Reactive · Titre 1:8");
});

test("report counts each answer", () => {
  const m = answerBreakdown([
    { test: "Urinalysis", status: "completed", fields: [{ field_name: "Protein", field_value: "++", flag: "A" }] },
    { test: "Urinalysis", status: "completed", fields: [{ field_name: "Protein", field_value: "++", flag: "A" }] },
    { test: "HB Levels", status: "completed", fields: [{ field_name: "Haemoglobin", field_value: "6", flag: "LL" }] },
  ]);
  expect(m.get("Urinalysis › Protein")?.get("++")).toBe(2);
  expect(m.get("HB Levels › Haemoglobin")?.get("Critical")).toBe(1);
});

test("rejected samples are reported as rejected", () => {
  expect(resultCategory({ status: "rejected" })).toBe("rejected");
  expect(resultCategory({ status: "completed", flag: "critical" })).toBe("critical");
});
