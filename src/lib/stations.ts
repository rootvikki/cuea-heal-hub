import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";
import {
  Activity, Stethoscope, TestTube, Camera, Smile, Pill, Receipt, LogOut, type LucideIcon,
} from "lucide-react";

/**
 * One place that knows every department a patient can be sent to.
 * Every station uses `sendPatientTo` so the queues always move the same way.
 */
export type StationKey = "triage" | "doctor" | "lab" | "imaging" | "dental" | "pharmacy" | "billing" | "checkout";

export interface Station {
  key: StationKey;
  label: string;
  stage: "triage" | "waiting_for_doctor" | "at_lab" | "at_imaging" | "at_dental" | "at_pharmacy" | "at_billing" | "checked_out";
  roles: string[];
  link: string;
  icon: LucideIcon;
  color: string;
}

export const STATIONS: Station[] = [
  { key: "triage", label: "Triage", stage: "triage", roles: ["nurse"], link: "/vitals", icon: Activity, color: "text-sky-700 bg-sky-50 border-sky-200" },
  { key: "doctor", label: "Doctor", stage: "waiting_for_doctor", roles: ["doctor", "clinical_officer"], link: "/consultation", icon: Stethoscope, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { key: "lab", label: "Laboratory", stage: "at_lab", roles: ["lab_technician"], link: "/laboratory", icon: TestTube, color: "text-blue-700 bg-blue-50 border-blue-200" },
  { key: "dental", label: "Dental", stage: "at_dental", roles: ["doctor", "clinical_officer"], link: "/dental", icon: Smile, color: "text-teal-700 bg-teal-50 border-teal-200" },
  { key: "pharmacy", label: "Pharmacy", stage: "at_pharmacy", roles: ["pharmacist"], link: "/pharmacy", icon: Pill, color: "text-violet-700 bg-violet-50 border-violet-200" },
  { key: "billing", label: "Billing", stage: "at_billing", roles: ["cashier", "finance_officer"], link: "/billing", icon: Receipt, color: "text-amber-700 bg-amber-50 border-amber-200" },
  { key: "imaging", label: "Imaging", stage: "at_imaging", roles: ["radiologist"], link: "/imaging", icon: Camera, color: "text-purple-700 bg-purple-50 border-purple-200" },
  { key: "checkout", label: "Check out", stage: "checked_out", roles: [], link: "/reception", icon: LogOut, color: "text-muted-foreground bg-muted border-border" },
];

export const stationByKey = (key: StationKey) => STATIONS.find((s) => s.key === key)!;

/** Friendly name for a ticket stage, e.g. "at_lab" → "Laboratory". */
export const STAGE_LABELS: Record<string, string> = {
  checked_in: "Checked in",
  triage: "Awaiting triage",
  triage_in_progress: "On triage",
  waiting_for_doctor: "Waiting for doctor",
  in_consult: "With doctor",
  at_lab: "Laboratory",
  order_placed_lab: "Laboratory",
  at_imaging: "Imaging",
  order_placed_imaging: "Imaging",
  at_dental: "Dental",
  at_pharmacy: "Pharmacy",
  at_billing: "Billing",
  checked_out: "Checked out",
};
export const stageLabel = (stage?: string | null) => (stage ? STAGE_LABELS[stage] ?? stage.replace(/_/g, " ") : "—");

export interface SendOptions {
  ticketId: string;
  patientName?: string;
  to: StationKey;
  from: string;
  note?: string;
  /** Extra ticket columns to set at the same time (e.g. priority). */
  extra?: Record<string, unknown>;
}

/** Moves the patient's ticket to another station, notifies that station and records an audit entry. */
export async function sendPatientTo({ ticketId, patientName, to, from, note, extra }: SendOptions) {
  const station = stationByKey(to);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: station.stage,
    workflow_stage: station.stage,
    assigned_to: null,
    claimed_at: null,
    updated_at: now,
    ...extra,
  };
  if (to === "checkout") update.checked_out_at = now;

  const { error } = await supabase.from("tickets").update(update as any).eq("id", ticketId);
  if (error) throw new Error(`Could not move the patient: ${error.message}`);

  if (note?.trim()) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("ticket_comments").insert({ ticket_id: ticketId, user_id: user.id, stage: station.stage, comment: `[${from} → ${station.label}] ${note.trim()}` });
    }
  }

  if (station.roles.length) {
    await notifyRoles(station.roles, {
      title: `Patient sent to ${station.label}`,
      message: `${patientName || "A patient"} was sent from ${from}.${note?.trim() ? ` Note: ${note.trim()}` : ""}`,
      category: "queue",
      referenceId: ticketId,
      link: station.link,
    });
  }

  logAuditEvent({ action: "patient_routed", module: from.toLowerCase(), details: { ticket_id: ticketId, to: station.stage, note: note || null } });
  return station;
}

/** The current staff record id for the signed-in user (or null). */
export async function currentStaffId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle();
  return data?.id ?? null;
}
