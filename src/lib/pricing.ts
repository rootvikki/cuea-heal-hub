/**
 * Payment modes and price selection.
 *
 * Every visit (ticket) is either paid by M-Pesa / school fees, or by insurance.
 * Catalog items may carry a separate `insurance_price`. Until the official
 * insurance price list is loaded, `insurance_price` is empty and the normal
 * price is used for both modes.
 */
export type PaymentMode = "mpesa_school_fees" | "insurance";

export const PAYMENT_MODES: { value: PaymentMode; label: string; short: string; description: string }[] = [
  { value: "mpesa_school_fees", label: "M-Pesa / School fees", short: "M-Pesa / Fees", description: "Pays by M-Pesa, or billed to school fees / staff account" },
  { value: "insurance", label: "Insurance", short: "Insurance", description: "Billed to the patient's insurance provider" },
];

export const paymentModeLabel = (mode?: string | null) =>
  PAYMENT_MODES.find((m) => m.value === mode)?.label ?? "M-Pesa / School fees";

export const isPaymentMode = (v: unknown): v is PaymentMode => v === "mpesa_school_fees" || v === "insurance";

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
export const SERVICE_FEES: Record<string, { mpesa_school_fees: number; insurance: number }> = {
  triage: { mpesa_school_fees: 200, insurance: 200 },
  admission: { mpesa_school_fees: 1000, insurance: 1000 },
};

export const serviceFee = (key: keyof typeof SERVICE_FEES | string, mode?: string | null) => {
  const fee = SERVICE_FEES[key];
  if (!fee) return 0;
  return mode === "insurance" ? fee.insurance : fee.mpesa_school_fees;
};

export const formatKES = (n: number | string | null | undefined) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
