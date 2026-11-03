import { describe, expect, test } from "bun:test";
import { applyConfirmedCharges } from "./billConfirm";

const recorded = [
  { id: "proc", description: "Procedure: Ear Syringing", amount: 500 },
  { id: "rx", description: "Pharmacy: Wax Softener 10ML x1", amount: 450 },
  { id: "triage", description: "Triage / Vitals Assessment Fee (no charge — CUEA student)", amount: 0 },
];

describe("billing desk confirms the final amounts", () => {
  test("amounts edited at billing are the ones billed (500 -> 600, 450 -> 360)", () => {
    const { lines, total } = applyConfirmedCharges(recorded, [
      { id: "proc", description: "Procedure: Ear Syringing", amount: 600 },
      { id: "rx", description: "Pharmacy: Wax Softener 10ML x1", amount: 360 },
      { id: "triage", description: recorded[2].description, amount: 0 },
    ]);
    expect(lines.map((l) => l.amount)).toEqual([600, 360, 0]);
    expect(total).toBe(960);
  });

  test("edited lines are reported so the charge records are updated too", () => {
    const { changed } = applyConfirmedCharges(recorded, [
      { id: "proc", description: "Procedure: Ear Syringing", amount: 600 },
      { id: "rx", description: "Pharmacy: Wax Softener 10ML x1", amount: 450 },
    ]);
    expect(changed.map((c) => c.id)).toEqual(["proc"]);
  });

  test("charges not on screen at Confirm are left for the next bill", () => {
    const { lines } = applyConfirmedCharges(recorded, [{ id: "proc", description: "Procedure: Ear Syringing", amount: 500 }]);
    expect(lines.map((l) => l.id)).toEqual(["proc"]);
  });

  test("a negative amount typed at billing is billed as 0", () => {
    const { total } = applyConfirmedCharges(recorded, [{ id: "proc", description: "Procedure: Ear Syringing", amount: -50 }]);
    expect(total).toBe(0);
  });
});
