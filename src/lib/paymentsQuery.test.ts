import { describe, expect, test } from "bun:test";
import { EMPTY_FILTERS, filterPayments, groupPayments, nairobiParts, rangeFor, type PaymentRow } from "./paymentsQuery";

const row = (o: Partial<PaymentRow>): PaymentRow => ({
  id: "x", at: "", date: "2026-11-03", time: "09:00", receipt: "SJK3ABC12D", patient: "Jane Doe", opd: "OPD-2026-0001", phone: "0712345678",
  patientType: "cuea_student", memberNo: "ADM/1", invoice: "INV-1", ticket: "T-1", department: "General", paymentMode: "mpesa",
  method: "mpesa", status: "completed", receivedById: null, receivedBy: "M-Pesa (auto)", amount: 500, ...o,
});

describe("payments report", () => {
  test("dates use Nairobi time: 22:30 UTC is the next day in Nairobi", () => {
    expect(nairobiParts("2026-11-02T22:30:00Z")).toEqual({ date: "2026-11-03", time: "01:30" });
  });

  test("'Today' and 'Last month' follow the Nairobi calendar", () => {
    const now = new Date("2026-11-02T22:30:00Z"); // 3 Nov 01:30 in Nairobi
    expect(rangeFor("today", now)).toEqual(["2026-11-03", "2026-11-03"]);
    expect(rangeFor("last_month", now)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(rangeFor("this_week", now)).toEqual(["2026-11-02", "2026-11-03"]); // week starts Monday
  });

  test("filters combine: patient type + method + amount range + search", () => {
    const rows = [
      row({ id: "a", amount: 500 }),
      row({ id: "b", amount: 5000, patientType: "outsider" }),
      row({ id: "c", amount: 800, method: "insurance" }),
      row({ id: "d", amount: 1200, patient: "John Smith" }),
    ];
    const out = filterPayments(rows, { ...EMPTY_FILTERS, patientType: "cuea_student", method: "mpesa", minAmount: "400", maxAmount: "1500", search: "jane" });
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  test("received-by 'system' means M-Pesa auto payments with no cashier", () => {
    const rows = [row({ id: "auto" }), row({ id: "staff", receivedById: "u1", receivedBy: "Mary" })];
    expect(filterPayments(rows, { ...EMPTY_FILTERS, receivedBy: "system" }).map((r) => r.id)).toEqual(["auto"]);
    expect(filterPayments(rows, { ...EMPTY_FILTERS, receivedBy: "u1" }).map((r) => r.id)).toEqual(["staff"]);
  });

  test("grouping by day totals each day, in date order", () => {
    const rows = [row({ date: "2026-11-02", amount: 100 }), row({ date: "2026-11-01", amount: 50 }), row({ date: "2026-11-02", amount: 25 })];
    expect(groupPayments(rows, "day").map((g) => [g.key, g.count, g.total])).toEqual([["2026-11-01", 1, 50], ["2026-11-02", 2, 125]]);
  });
});
