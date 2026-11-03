import { describe, expect, test } from "bun:test";
import { expiryBucket, filterInventory, moveType, stockStatus, stockValue, summarizeInventory, summarizeMoves, type InvItem } from "./pharmacyReport";

const item = (o: Partial<InvItem>): InvItem => ({ id: o.id || "x", drug_name: "Drug", quantity: 10, unit_price: 10, ...o });
const TODAY = "2026-11-03";

describe("stock status", () => {
  test("zero is out of stock", () => expect(stockStatus(item({ quantity: 0, reorder_level: 5 }))).toBe("out"));
  test("at the reorder level is low", () => expect(stockStatus(item({ quantity: 5, reorder_level: 5 }))).toBe("low"));
  test("minimum stock is used when there is no reorder level", () => expect(stockStatus(item({ quantity: 2, reorder_level: 0, minimum_stock: 2 }))).toBe("low"));
  test("above maximum is flagged", () => expect(stockStatus(item({ quantity: 60, reorder_level: 5, maximum_stock: 50 }))).toBe("over"));
  test("between reorder and maximum is in stock", () => expect(stockStatus(item({ quantity: 20, reorder_level: 5, maximum_stock: 50 }))).toBe("ok"));
});

describe("expiry", () => {
  test("expiry date itself is still usable", () => expect(expiryBucket("2026-11-03", TODAY)).toBe("30"));
  test("the day after expiry is expired", () => expect(expiryBucket("2026-11-02", TODAY)).toBe("expired"));
  test("30 days ahead is within 30", () => expect(expiryBucket("2026-12-03", TODAY)).toBe("30"));
  test("31 days ahead is 31–90", () => expect(expiryBucket("2026-12-04", TODAY)).toBe("90"));
  test("no date recorded", () => expect(expiryBucket(null, TODAY)).toBe("none"));
});

test("stock value is quantity × selling price", () => expect(stockValue(item({ quantity: 40, unit_price: 10 }))).toBe(400));

test("filters combine: tablets that need attention", () => {
  const items = [
    item({ id: "a", formulation: "Tabs", quantity: 0 }),
    item({ id: "b", formulation: "Tabs", quantity: 100, reorder_level: 10 }),
    item({ id: "c", formulation: "Syrup", quantity: 0 }),
  ];
  expect(filterInventory(items, { formulation: "Tabs", status: "attention" }, TODAY).map((i) => i.id)).toEqual(["a"]);
});

test("search matches generic name and batch", () => {
  const items = [item({ id: "a", drug_name: "Etorix", generic_name: "Etoricoxib" }), item({ id: "b", drug_name: "X", batch_number: "5K55A" })];
  expect(filterInventory(items, { text: "etoricox" }, TODAY).map((i) => i.id)).toEqual(["a"]);
  expect(filterInventory(items, { text: "5k55" }, TODAY).map((i) => i.id)).toEqual(["b"]);
});

test("summary counts expired stock value", () => {
  const s = summarizeInventory([item({ quantity: 5, unit_price: 50, expiry_date: "2026-04-01" }), item({ quantity: 0, expiry_date: "2027-01-01" })], TODAY);
  expect(s.expired).toBe(1);
  expect(s.expiredValue).toBe(250);
  expect(s.out).toBe(1);
});

test("movement types", () => {
  expect(moveType({ received_from: "Opening stock (pharmacy stock take)", qty_received: 20 })).toBe("opening");
  expect(moveType({ issued_to: "Stock count adjustment: damaged", qty_received: 0 })).toBe("adjustment");
  expect(moveType({ received_from: "Medisel", qty_received: 50 })).toBe("received");
  expect(moveType({ issued_to: "Patient: Jane", qty_received: 0 })).toBe("issued");
});

test("movement totals per drug", () => {
  const s = summarizeMoves([
    { id: "1", inventory_id: "a", transaction_date: TODAY, qty_received: 20 },
    { id: "2", inventory_id: "a", transaction_date: TODAY, qty_issued: 5, unit_price: 10 },
  ]);
  expect(s.received).toBe(20);
  expect(s.issued).toBe(5);
  expect(s.byDrug.get("a")?.issuedValue).toBe(50);
});
