import { describe, expect, test } from "bun:test";
import { handledBy, lastActivity, sheetStage, sheetTimeline, since, sortSheets } from "./pharmacyFlow";

const rx = (status: string, extra: Record<string, string | null> = {}) => ({ status, created_at: "2026-11-05T06:00:00Z", ...extra });

describe("sheetStage", () => {
  test("new prescriptions need checking", () => expect(sheetStage([rx("sent"), rx("received")])).toBe("new"));
  test("billed while the ticket is at billing waits for payment", () => expect(sheetStage([rx("billed")], "at_billing")).toBe("billing"));
  test("billed after billing is ready to give", () => expect(sheetStage([rx("billed")], "at_pharmacy")).toBe("dispense"));
  test("all dispensed or not available is done", () => expect(sheetStage([rx("dispensed"), rx("not_dispensed")])).toBe("done"));
});

describe("sheetTimeline", () => {
  test("shows each step with who did it", () => {
    const items = [rx("dispensed", { received_at: "2026-11-05T07:00:00Z", received_by: "me", billed_at: "2026-11-05T07:05:00Z", reviewed_by: "me", dispensed_at: "2026-11-05T07:30:00Z", dispensed_by: "other" })];
    const t = sheetTimeline(items, "done", "me");
    expect(t.map((s) => s.done)).toEqual([true, true, true, true]);
    expect(t[0].byMe).toBe(true);
    expect(t[3].byMe).toBe(false);
    expect(t[3].at).toBe("2026-11-05T07:30:00Z");
  });
  test("a sheet with nothing available is not shown as paid", () => {
    const t = sheetTimeline([rx("not_dispensed")], "done", "me");
    expect(t[1].label).toBe("Nothing to bill");
    expect(t[2].done).toBe(false);
    expect(t[3].label).toBe("Not dispensed");
  });
  test("at billing: received and billed done, paid not yet", () => {
    const t = sheetTimeline([rx("billed", { received_at: "2026-11-05T07:00:00Z", billed_at: "2026-11-05T07:05:00Z" })], "billing");
    expect(t.map((s) => s.done)).toEqual([true, true, false, false]);
  });
});

test("paid without a recorded billing time still shows billing as done", () => {
  const t = sheetTimeline([rx("billed")], "dispense");
  expect(t.map((s) => s.done)).toEqual([true, true, true, false]);
});

describe("ordering and helpers", () => {
  test("paid patients come first, then new oldest first, then billing", () => {
    const s = (stage: "new" | "billing" | "dispense" | "done", createdAt: string) => ({ stage, createdAt, items: [] });
    const out = sortSheets([s("billing", "1"), s("new", "3"), s("dispense", "5"), s("new", "2")]);
    expect(out.map((x) => `${x.stage}${x.createdAt}`)).toEqual(["dispense5", "new2", "new3", "billing1"]);
  });
  test("lastActivity and handledBy", () => {
    const items = [rx("dispensed", { dispensed_at: "2026-11-05T09:00:00Z", dispensed_by: "me" })];
    expect(lastActivity(items)).toBe("2026-11-05T09:00:00Z");
    expect(handledBy(items, "me")).toBe(true);
    expect(handledBy(items, "you")).toBe(false);
    expect(handledBy(items, null)).toBe(false);
  });
  test("since", () => {
    const now = Date.parse("2026-11-05T10:00:00Z");
    expect(since("2026-11-05T09:55:00Z", now)).toBe("5 min");
    expect(since("2026-11-05T07:50:00Z", now)).toBe("2 h 10 min");
    expect(since("2026-11-03T10:00:00Z", now)).toBe("2 d");
  });
});
