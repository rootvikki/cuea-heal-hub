export const FORMULATIONS = ["Tabs", "Caps", "Syrup", "Susp", "Inj", "Cream", "Ointment", "Drops", "Inhaler", "Supp", "Sachet", "Gel"];
export const FREQUENCIES = ["OD", "BD", "TDS", "QID", "Q4H", "Q6H", "Q8H", "PRN", "Nocte", "STAT"];

/** "Tabs, Lysodol, 100mg, BD, x 5 days" */
export const formatRx = (rx: {
  formulation?: string | null;
  medication_name: string;
  strength?: string | null;
  frequency?: string | null;
  duration?: string | null;
}) =>
  [rx.formulation, rx.medication_name, rx.strength, rx.frequency, rx.duration ? `x ${rx.duration}` : null]
    .filter(Boolean)
    .join(", ");

/** Hospital notation: x/7 = days, x/52 = weeks, x/12 = months. */
export const DURATIONS: { value: string; label: string }[] = [
  ...[1, 2, 3, 4, 5, 6].map(n => ({ value: `${n}/7`, label: `${n}/7 — ${n} day${n > 1 ? "s" : ""}` })),
  ...[1, 2, 3].map(n => ({ value: `${n}/52`, label: `${n}/52 — ${n} week${n > 1 ? "s" : ""}` })),
  ...[1, 2, 3, 6].map(n => ({ value: `${n}/12`, label: `${n}/12 — ${n} month${n > 1 ? "s" : ""}` })),
  { value: "STAT", label: "STAT — single dose" },
];
