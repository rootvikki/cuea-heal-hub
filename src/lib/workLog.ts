/** "My work" log: what each department has received, has pending and has finished. Pure rules (tested). */

export type WorkStation = "pharmacy" | "laboratory" | "imaging" | "triage" | "consultation" | "dental" | "billing" | "reception";

export const WORK_STATIONS: Record<string, WorkStation> = {
  "/pharmacy": "pharmacy", "/laboratory": "laboratory", "/imaging": "imaging", "/vitals": "triage",
  "/consultation": "consultation", "/dental": "dental", "/billing": "billing", "/reception": "reception",
};

export const STATION_TITLE: Record<WorkStation, string> = {
  pharmacy: "Pharmacy", laboratory: "Laboratory", imaging: "Imaging", triage: "Triage", consultation: "Consultation",
  dental: "Dental", billing: "Billing", reception: "Reception",
};

/** Status groups shown as filter chips, in workflow order. `done` marks the finished group(s). */
export type Group = { key: string; label: string; statuses: string[]; done?: boolean };
export const GROUPS: Record<WorkStation, Group[]> = {
  pharmacy: [
    { key: "waiting", label: "Waiting to receive", statuses: ["sent", "pending"] },
    { key: "received", label: "Received / in progress", statuses: ["received", "reviewed", "dispensing"] },
    { key: "billing", label: "At billing", statuses: ["billed"] },
    { key: "dispensed", label: "Dispensed", statuses: ["dispensed", "collected"], done: true },
    { key: "not_dispensed", label: "Not dispensed", statuses: ["not_dispensed"], done: true },
  ],
  laboratory: [
    { key: "pending", label: "Pending", statuses: ["pending"] },
    { key: "received", label: "Received / in progress", statuses: ["received", "collected", "in_progress"] },
    { key: "completed", label: "Completed", statuses: ["completed"], done: true },
    { key: "rejected", label: "Sample rejected", statuses: ["rejected"], done: true },
  ],
  imaging: [
    { key: "pending", label: "Pending", statuses: ["ordered", "pending", "scheduled"] },
    { key: "progress", label: "In progress", statuses: ["in_progress", "performed"] },
    { key: "completed", label: "Reported", statuses: ["completed", "reported"], done: true },
    { key: "cancelled", label: "Cancelled", statuses: ["cancelled"], done: true },
  ],
  triage: [{ key: "triaged", label: "Triaged", statuses: ["triaged"], done: true }],
  consultation: [
    { key: "open", label: "Seen — visit still open", statuses: ["open"] },
    { key: "closed", label: "Seen — visit finished", statuses: ["closed"], done: true },
  ],
  dental: [{ key: "done", label: "Procedures done", statuses: ["done"], done: true }],
  billing: [
    { key: "unpaid", label: "Unpaid", statuses: ["pending"] },
    { key: "partial", label: "Part paid", statuses: ["partial"] },
    { key: "paid", label: "Paid", statuses: ["paid"], done: true },
    { key: "other", label: "Refunded / cancelled", statuses: ["refunded", "cancelled"], done: true },
  ],
  reception: [
    { key: "in_clinic", label: "Still in the clinic", statuses: ["open"] },
    { key: "checked_out", label: "Checked out", statuses: ["checked_out"], done: true },
  ],
};

export type WorkRow = {
  id: string;
  at: string;           // ISO time the work item was created / recorded
  patient: string;
  opd: string;
  ticket: string;
  item: string;         // drug, test, procedure, bill no. …
  detail: string;       // dosage, result, amount …
  status: string;       // raw status
  byIds: string[];      // staff ids and/or auth user ids of everyone who handled it
  byNames: string;
  amount?: number;
};

export const groupOf = (station: WorkStation, status: string): Group | undefined =>
  GROUPS[station].find((g) => g.statuses.includes(status));

export const statusLabel = (station: WorkStation, status: string) =>
  groupOf(station, status)?.label ?? (status ? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "-");

/** True when one of my ids (staff record id or sign-in id) handled the row. */
export const isMine = (row: Pick<WorkRow, "byIds">, myIds: (string | null | undefined)[]) =>
  row.byIds.some((id) => !!id && myIds.includes(id));

export type WorkFilters = { group: string; mine: boolean; search: string };

export function filterWork(rows: WorkRow[], station: WorkStation, f: WorkFilters, myIds: (string | null | undefined)[]): WorkRow[] {
  const s = f.search.trim().toLowerCase();
  return rows.filter((r) =>
    (f.group === "all" || groupOf(station, r.status)?.key === f.group || (f.group === "other" && !groupOf(station, r.status))) &&
    (!f.mine || isMine(r, myIds)) &&
    (!s || [r.patient, r.opd, r.ticket, r.item].some((v) => v.toLowerCase().includes(s))),
  );
}

/** Counts per status group plus distinct patients — for the summary chips. */
export function summarizeWork(rows: WorkRow[], station: WorkStation) {
  const byGroup: Record<string, number> = Object.fromEntries(GROUPS[station].map((g) => [g.key, 0]));
  for (const r of rows) { const g = groupOf(station, r.status); if (g) byGroup[g.key]++; }
  const done = rows.filter((r) => groupOf(station, r.status)?.done).length;
  return { total: rows.length, patients: new Set(rows.map((r) => r.opd)).size, done, open: rows.length - done, byGroup };
}
