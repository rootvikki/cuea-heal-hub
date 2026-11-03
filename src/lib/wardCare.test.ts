import { describe, expect, test } from "bun:test";
import { shiftFor, noteTypeLabel, shiftLabel } from "./wardCare";

describe("ward shifts (Nairobi time)", () => {
  test("07:00 Nairobi is morning", () => expect(shiftFor(new Date("2026-11-03T04:00:00Z"))).toBe("morning"));
  test("13:59 Nairobi is still morning", () => expect(shiftFor(new Date("2026-11-03T10:59:00Z"))).toBe("morning"));
  test("14:00 Nairobi is evening", () => expect(shiftFor(new Date("2026-11-03T11:00:00Z"))).toBe("evening"));
  test("21:00 Nairobi is night", () => expect(shiftFor(new Date("2026-11-03T18:00:00Z"))).toBe("night"));
  test("02:00 Nairobi is night", () => expect(shiftFor(new Date("2026-11-02T23:00:00Z"))).toBe("night"));
  test("06:59 Nairobi is night", () => expect(shiftFor(new Date("2026-11-03T03:59:00Z"))).toBe("night"));
});

describe("labels", () => {
  test("known note type", () => expect(noteTypeLabel("medication")).toBe("Medication given"));
  test("unknown note type shows raw value", () => expect(noteTypeLabel("other")).toBe("other"));
  test("shift short label", () => expect(shiftLabel("night")).toBe("Night"));
});
