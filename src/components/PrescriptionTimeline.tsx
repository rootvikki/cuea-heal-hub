import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrescriptionStatus =
  | "sent"
  | "received"
  | "reviewed"
  | "dispensing"
  | "dispensed"
  | "collected";

export const PRESCRIPTION_STATUSES: PrescriptionStatus[] = [
  "sent",
  "received",
  "reviewed",
  "dispensing",
  "dispensed",
  "collected",
];

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  sent: "Sent to Pharmacy",
  received: "Received",
  reviewed: "Reviewed",
  dispensing: "Dispensing",
  dispensed: "Dispensed",
  collected: "Collected",
};

export const PRESCRIPTION_ACTION_LABELS: Record<PrescriptionStatus, string> = {
  sent: "Send to Pharmacy",
  received: "Mark Received",
  reviewed: "Mark Reviewed",
  dispensing: "Start Dispensing",
  dispensed: "Dispense",
  collected: "Mark Collected",
};

export interface PrescriptionTimelineItem {
  created_at?: string | null;
  status?: string | null;
  received_at?: string | null;
  reviewed_at?: string | null;
  dispensing_started_at?: string | null;
  dispensed?: boolean | null;
  dispensed_at?: string | null;
  collected_at?: string | null;
}

export const prescriptionStatus = (item: PrescriptionTimelineItem): PrescriptionStatus => {
  const raw = (item.status || "") as PrescriptionStatus;
  if ((item.status as string) === "partially_dispensed") return "dispensing";
  if (PRESCRIPTION_STATUSES.includes(raw)) return raw;
  return item.dispensed ? "dispensed" : "sent";
};

export const prescriptionStepIndex = (item: PrescriptionTimelineItem) =>
  PRESCRIPTION_STATUSES.indexOf(prescriptionStatus(item));

export const nextPrescriptionStatus = (item: PrescriptionTimelineItem): PrescriptionStatus | null => {
  const index = prescriptionStepIndex(item);
  return index >= 0 && index < PRESCRIPTION_STATUSES.length - 1
    ? PRESCRIPTION_STATUSES[index + 1]
    : null;
};

export const prescriptionStatusLabel = (item: PrescriptionTimelineItem) =>
  PRESCRIPTION_STATUS_LABELS[prescriptionStatus(item)];

const formatStamp = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface PrescriptionTimelineProps {
  prescription: PrescriptionTimelineItem;
  compact?: boolean;
  className?: string;
}

export function PrescriptionTimeline({ prescription, compact, className }: PrescriptionTimelineProps) {
  const currentIndex = Math.max(prescriptionStepIndex(prescription), 0);
  const times: Record<PrescriptionStatus, string | null | undefined> = {
    sent: prescription.created_at,
    received: prescription.received_at,
    reviewed: prescription.reviewed_at,
    dispensing: prescription.dispensing_started_at,
    dispensed: prescription.dispensed_at,
    collected: prescription.collected_at,
  };

  return (
    <div className={cn("flex items-start gap-1", className)}>
      {PRESCRIPTION_STATUSES.map((status, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index <= currentIndex;
        const stamp = formatStamp(times[status]);
        return (
          <div key={status} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0 flex-1">
              {isDone && !isCurrent ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : isCurrent ? (
                <CircleDot className="h-4 w-4 text-primary animate-pulse" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "mt-1 text-[10px] text-center leading-tight",
                  isDone ? "font-medium" : "text-muted-foreground",
                )}
              >
                {PRESCRIPTION_STATUS_LABELS[status]}
              </span>
              {!compact && stamp && isDone && (
                <span className="text-[9px] text-muted-foreground text-center leading-tight">{stamp}</span>
              )}
            </div>
            {index < PRESCRIPTION_STATUSES.length - 1 && (
              <div
                className={cn(
                  "h-[2px] flex-1 mt-2 min-w-3",
                  index < currentIndex ? "bg-[hsl(var(--success))]" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
