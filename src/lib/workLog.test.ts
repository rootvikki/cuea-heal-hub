import { describe, expect, test } from "bun:test";
import { filterWork, groupOf, isMine, summarizeWork, type WorkRow } from "./workLog";

const row = (o: Partial<WorkRow>): WorkRow => ({
  id: "x", at: "2026-11-03T08:00:00Z", patient: "Jane Doe", opd: "OPD-1", ticket: "T-1", item: "Paracetamol", detail: "", status: "sent", byIds: [], byNames: "", ...o,
});

describe("pharmacy work log", () => {
  test("statuses fall into received, pending and dispensed groups", () => {
    expect(groupOf("pharmacy", "sent")?.key).toBe("waiting");
    expect(groupOf("pharmacy", "dispensing")?.key).toBe("received");
    expect(groupOf("pharmacy", "collected")?.key).toBe("dispensed");
  });

  test("'Only mine' shows rows I handled, by staff id or sign-in id", () => {
    const rows = [row({ id: "a", byIds: ["staff-1"] }), row({ id: "b", byIds: ["user-1"] }), row({ id: "c", byIds: ["staff-2"] })];
    expect(filterWork(rows, "pharmacy", { group: "all", mine: true, search: "" }, ["staff-1", "user-1"]).map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("group + search combine", () => {
    const rows = [row({ id: "a", status: "dispensed" }), row({ id: "b", status: "sent" }), row({ id: "c", status: "dispensed", patient: "John" })];
    expect(filterWork(rows, "pharmacy", { group: "dispensed", mine: false, search: "jane" }, []).map((r) => r.id)).toEqual(["a"]);
  });

  test("summary counts finished vs still open and distinct patients", () => {
    const s = summarizeWork([row({ status: "dispensed" }), row({ status: "received" }), row({ status: "not_dispensed", opd: "OPD-2" })], "pharmacy");
    expect(s).toMatchObject({ total: 3, patients: 2, done: 2, open: 1 });
    expect(s.byGroup.received).toBe(1);
  });
});

test("lab: completed and rejected are finished, pending is not", () => {
  const s = summarizeWork([row({ status: "completed" }), row({ status: "rejected" }), row({ status: "pending" })], "laboratory");
  expect(s.done).toBe(2);
  expect(s.open).toBe(1);
});

test("nobody's ids never match", () => expect(isMine(row({ byIds: [""] }), [null, undefined])).toBe(false));
