/** Ward (inpatient) nursing care: note kinds, shifts and the default shift for a time. */

export const WARD_NOTE_TYPES = [
  { value: "admission", label: "Admission note" },
  { value: "progress", label: "Progress / observation" },
  { value: "medication", label: "Medication given" },
  { value: "intake_output", label: "Fluids in / out" },
  { value: "handover", label: "Shift handover" },
  { value: "incident", label: "Incident" },
  { value: "discharge", label: "Discharge note" },
] as const;

export const WARD_SHIFTS = [
  { value: "morning", label: "Morning (7am – 2pm)" },
  { value: "evening", label: "Evening (2pm – 9pm)" },
  { value: "night", label: "Night (9pm – 7am)" },
] as const;

export type WardShift = (typeof WARD_SHIFTS)[number]["value"];

export const noteTypeLabel = (v?: string | null) => WARD_NOTE_TYPES.find((t) => t.value === v)?.label ?? (v || "Note");
export const shiftLabel = (v?: string | null) => WARD_SHIFTS.find((s) => s.value === v)?.label.split(" (")[0] ?? (v || "");

/** Hour of day in Nairobi (UTC+3, no daylight saving). */
const nairobiHour = (d: Date) => (d.getUTCHours() + 3) % 24;

/** The shift on duty at a moment, by Nairobi clock: 7–14 morning, 14–21 evening, else night. */
export function shiftFor(d: Date = new Date()): WardShift {
  const h = nairobiHour(d);
  if (h >= 7 && h < 14) return "morning";
  if (h >= 14 && h < 21) return "evening";
  return "night";
}
