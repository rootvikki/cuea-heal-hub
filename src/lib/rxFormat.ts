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
