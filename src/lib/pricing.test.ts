import { describe, expect, test } from "bun:test";
import { allowedPaymentModes, billingMethodsFor, defaultPaymentMode, priceFor, serviceFee } from "./pricing";

describe("payment options by patient type", () => {
  test("students: school fees, M-Pesa or insurance", () => {
    expect(allowedPaymentModes("cuea_student")).toEqual(["school_fees", "mpesa", "insurance"]);
  });
  test("staff: payroll, M-Pesa or insurance", () => {
    expect(allowedPaymentModes("cuea_staff")).toEqual(["payroll", "mpesa", "insurance"]);
  });
  test("outsiders: M-Pesa or insurance only", () => {
    expect(allowedPaymentModes("outsider")).toEqual(["mpesa", "insurance"]);
  });
});

describe("check-in default", () => {
  test("insurance when provider and member number are on file", () => {
    expect(defaultPaymentMode({ patient_type: "cuea_student", insurance_provider: "Pacis", insurance_number: "P-1" })).toBe("insurance");
  });
  test("student defaults to school fees", () => {
    expect(defaultPaymentMode({ patient_type: "cuea_student" })).toBe("school_fees");
  });
  test("staff defaults to payroll", () => {
    expect(defaultPaymentMode({ patient_type: "cuea_staff" })).toBe("payroll");
  });
  test("outsider defaults to M-Pesa", () => {
    expect(defaultPaymentMode({ patient_type: "outsider" })).toBe("mpesa");
  });
});

describe("billing methods per visit mode (no cash)", () => {
  test("insurance offers insurance plus M-Pesa co-pay", () => {
    expect(billingMethodsFor("insurance")).toEqual(["insurance", "mpesa"]);
  });
  test("school fees offers only school fees", () => {
    expect(billingMethodsFor("school_fees")).toEqual(["school_fees"]);
  });
  test("payroll offers only payroll", () => {
    expect(billingMethodsFor("payroll")).toEqual(["payroll"]);
  });
  test("M-Pesa offers prompt and code", () => {
    expect(billingMethodsFor("mpesa")).toEqual(["mpesa", "mpesa_manual"]);
  });
});

describe("two-tier pricing", () => {
  const drug = { unit_price: 100, insurance_price: 150 };
  test("insurance visits pay the insurance price", () => {
    expect(priceFor(drug, "insurance")).toBe(150);
  });
  test("school fees, payroll and M-Pesa pay the normal price", () => {
    expect(priceFor(drug, "school_fees")).toBe(100);
    expect(priceFor(drug, "payroll")).toBe(100);
    expect(priceFor(drug, "mpesa")).toBe(100);
  });
  test("triage fee unchanged at 200", () => {
    expect(serviceFee("triage", "payroll")).toBe(200);
  });
});

describe("student fee waiver", () => {
  test("students pay nothing for triage", () => expect(serviceFee("triage", "school_fees", "cuea_student")).toBe(0));
  test("students pay nothing for the doctor's consultation", () => expect(serviceFee("consultation", "mpesa", "cuea_student")).toBe(0));
  test("students on insurance are not charged triage either", () => expect(serviceFee("triage", "insurance", "cuea_student")).toBe(0));
  test("staff still pay triage 200 and consultation 500", () => {
    expect(serviceFee("triage", "payroll", "cuea_staff")).toBe(200);
    expect(serviceFee("consultation", "payroll", "cuea_staff")).toBe(500);
  });
  test("outsiders still pay consultation 500", () => expect(serviceFee("consultation", "mpesa", "outsider")).toBe(500));
  test("students still pay for admission", () => expect(serviceFee("admission", "school_fees", "cuea_student")).toBe(1000));
  test("the bill line says why it is free", () => expect(serviceFeeDescription("Doctor Consultation", "consultation", "cuea_student")).toBe("Doctor Consultation (no charge — CUEA student)"));
});
