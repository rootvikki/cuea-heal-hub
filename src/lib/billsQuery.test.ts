import { describe, expect, test } from "bun:test";
import {
  EMPTY_BILL_FILTERS, EMPTY_CHARGE_FILTERS, billTotals, filterBills, filterCharges, groupBills, groupCharges, normaliseBill, normaliseCharge,
  type BillRow, type ChargeRow,
} from "./billsQuery";

const bill = (o: Partial<BillRow>): BillRow => ({
  id: "x", date: "2026-11-03", time: "09:00", invoice: "INV-1", patient: "Jane Doe", opd: "OPD-2026-0001", phone: "0712",
  patientType: "cuea_student", memberNo: "ADM/1", ticket: "T-00001", department: "General", paymentMode: "mpesa",
  total: 500, discount: 0, net: 500, paid: 0, balance: 500, status: "pending", ageDays: 0, ...o,
});
const charge = (o: Partial<ChargeRow>): ChargeRow => ({
  id: "x", date: "2026-11-03", time: "09:00", patient: "Jane", opd: "OPD-1", patientType: "outsider", ticket: "T-1", department: "General",
  paymentMode: "mpesa", serviceType: "laboratory", stage: "laboratory", description: "Full Hemogram", amount: 600, billed: true, invoice: "INV-1", ...o,
});

describe("bills report", () => {
  test("bill dates and age follow Nairobi time", () => {
    const b = normaliseBill({ id: "1", created_at: "2026-10-31T22:30:00Z", net_amount: 1000, amount_paid: 400, balance: 600, status: "partial" }, "2026-11-03");
    expect(b.date).toBe("2026-11-01");
    expect(b.ageDays).toBe(2);
    expect(b.balance).toBe(600);
  });

  test("missing balance is worked out as net minus paid", () => {
    expect(normaliseBill({ id: "1", created_at: "2026-11-03T06:00:00Z", net_amount: 1000, amount_paid: 250 }).balance).toBe(750);
  });

  test("outstanding only + unpaid more than 30 days", () => {
    const rows = [bill({ id: "a", ageDays: 40 }), bill({ id: "b", ageDays: 5 }), bill({ id: "c", ageDays: 45, balance: 0, status: "paid" })];
    expect(filterBills(rows, { ...EMPTY_BILL_FILTERS, balance: "outstanding", age: "31+" }).map((r) => r.id)).toEqual(["a"]);
  });

  test("filters combine: patient type + visit payment mode + search", () => {
    const rows = [bill({ id: "a" }), bill({ id: "b", patientType: "outsider" }), bill({ id: "c", paymentMode: "insurance" }), bill({ id: "d", patient: "John" })];
    expect(filterBills(rows, { ...EMPTY_BILL_FILTERS, patientType: "cuea_student", paymentMode: "mpesa", search: "jane" }).map((r) => r.id)).toEqual(["a"]);
  });

  test("totals and grouping by status", () => {
    const rows = [bill({ net: 500, paid: 500, balance: 0, status: "paid" }), bill({ net: 1000, paid: 200, balance: 800, status: "partial" })];
    expect(billTotals(rows)).toEqual({ count: 2, net: 1500, paid: 700, balance: 800, unpaid: 1 });
    expect(groupBills(rows, "status").map((g) => [g.label, g.balance])).toEqual([["Part paid", 800], ["Paid", 0]]);
  });
});

describe("services charged report", () => {
  test("a charge without a bill is unbilled", () => {
    expect(normaliseCharge({ id: "1", created_at: "2026-11-03T06:00:00Z", amount: 300, invoice_id: null }).billed).toBe(false);
  });

  test("filter unbilled lab charges", () => {
    const rows = [charge({ id: "a", billed: false }), charge({ id: "b" }), charge({ id: "c", serviceType: "consultation", billed: false })];
    expect(filterCharges(rows, { ...EMPTY_CHARGE_FILTERS, serviceType: "laboratory", billed: "unbilled" }).map((r) => r.id)).toEqual(["a"]);
  });

  test("group by service counts each test once per charge, ignoring letter case", () => {
    const g = groupCharges([charge({}), charge({ description: "full hemogram" }), charge({ description: "Urinalysis", amount: 200 })], "service");
    expect(g.map((x) => [x.count, x.total])).toEqual([[2, 1200], [1, 200]]);
  });
});
