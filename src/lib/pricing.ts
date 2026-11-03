/**
 * Payment modes and price selection.
 *
 * Every visit (ticket) has one payment mode: M-Pesa, school fees, payroll or insurance.
 * Which modes a patient may use depends on their patient type.
 * Prices are two-tier: catalog items may carry a separate `insurance_price`, used
 * for insurance visits; every other mode pays the normal price.
 */
export type PaymentMode = "mpesa" | "school_fees" | "payroll" | "insurance";

export const PAYMENT_MODES: { value: PaymentMode; label: string; short: string; description: string }[] = [
  { value: "mpesa", label: "M-Pesa", short: "M-Pesa", description: "Pays by M-Pesa at the billing desk" },
  { value: "school_fees", label: "School fees", short: "School fees", description: "Billed to the student's school fees account" },
  { value: "payroll", label: "Payroll", short: "Payroll", description: "Deducted from the staff member's payroll" },
  { value: "insurance", label: "Insurance", short: "Insurance", description: "Billed to the patient's insurance provider" },
];

const LEGACY_LABELS: Record<string, string> = { mpesa_school_fees: "M-Pesa / School fees" };

export const paymentModeLabel = (mode?: string | null) =>
  PAYMENT_MODES.find((m) => m.value === mode)?.label ?? (mode ? LEGACY_LABELS[mode] ?? mode : "M-Pesa");

export const isPaymentMode = (v: unknown): v is PaymentMode => PAYMENT_MODES.some((m) => m.value === v);

/** Payment modes a patient of this type may use (in the order they are offered). */
export function allowedPaymentModes(patientType?: string | null): PaymentMode[] {
  if (patientType === "cuea_student") return ["school_fees", "mpesa", "insurance"];
  if (patientType === "cuea_staff") return ["payroll", "mpesa", "insurance"];
  return ["mpesa", "insurance"];
}

/**
 * Default payment mode at check-in: insurance when the patient has insurance on file
 * (provider and member number), otherwise school fees for students, payroll for staff,
 * M-Pesa for everyone else.
 */
export function defaultPaymentMode(p: { patient_type?: string | null; insurance_provider?: string | null; insurance_number?: string | null }): PaymentMode {
  if (p.insurance_provider?.trim() && p.insurance_number?.trim()) return "insurance";
  return allowedPaymentModes(p.patient_type)[0];
}

/** Billing methods the desk may use for a visit with this payment mode. M-Pesa is the co-pay for insurance. */
export type BillingMethod = "mpesa" | "mpesa_manual" | "school_fees" | "payroll" | "insurance";
export function billingMethodsFor(mode?: string | null): BillingMethod[] {
  switch (mode) {
    case "insurance": return ["insurance", "mpesa"];
    case "school_fees": return ["school_fees"];
    case "payroll": return ["payroll"];
    default: return ["mpesa", "mpesa_manual"];
  }
}

/** Price for a catalog item (lab test, drug, imaging) under the visit's payment mode. */
export function priceFor(
  item: { price?: number | null; unit_price?: number | null; insurance_price?: number | null } | null | undefined,
  mode?: string | null,
): number {
  if (!item) return 0;
  const base = Number(item.price ?? item.unit_price ?? 0);
  if (mode === "insurance" && item.insurance_price != null && !Number.isNaN(Number(item.insurance_price))) {
    return Number(item.insurance_price);
  }
  return base;
}

/** Fixed service fees. Insurance values are placeholders equal to the normal fee until prices are provided. */
export const SERVICE_FEES: Record<string, { normal: number; insurance: number }> = {
  triage: { normal: 200, insurance: 200 },
  consultation: { normal: 500, insurance: 500 },
  admission: { normal: 1000, insurance: 1000 },
};

/** CUEA students are not charged for triage or the doctor's consultation. */
export const STUDENT_FREE_SERVICES = ["triage", "consultation"];
export const isFeeWaived = (key: string, patientType?: string | null) =>
  patientType === "cuea_student" && STUDENT_FREE_SERVICES.includes(key);

/** The fee for a service on this visit (0 when it is waived for the patient type). */
export const serviceFee = (key: keyof typeof SERVICE_FEES | string, mode?: string | null, patientType?: string | null) => {
  const fee = SERVICE_FEES[key];
  if (!fee || isFeeWaived(key, patientType)) return 0;
  return mode === "insurance" ? fee.insurance : fee.normal;
};

/** Bill line text, noting when the fee is waived so the bill and receipt explain the KES 0. */
export const serviceFeeDescription = (label: string, key: string, patientType?: string | null) =>
  isFeeWaived(key, patientType) ? `${label} (no charge — CUEA student)` : label;

export const formatKES = (n: number | string | null | undefined) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
