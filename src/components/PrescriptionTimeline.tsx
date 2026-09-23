import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PrescriptionTimelineItem {
  created_at?: string | null;
  dispensed?: boolean | null;
  dispensed_at?: string | null;
}

const formatStamp = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const prescriptionStatusLabel = (item: PrescriptionTimelineItem) =>
  item.dispensed ? "Dispensed" : "Sent to Pharmacy";

interface PrescriptionTimelineProps {
  prescription: PrescriptionTimelineItem;
  compact?: boolean;
  className?: string;
}

export function PrescriptionTimeline({ prescription, compact, className }: PrescriptionTimelineProps) {
  const steps = [
    { label: "Prescribed", time: prescription.created_at, done: true },
    { label: "Sent to Pharmacy", time: prescription.created_at, done: true },
    { label: "Dispensed", time: prescription.dispensed_at, done: Boolean(prescription.dispensed) },
  ];

  const currentIndex = prescription.dispensed ? 2 : 1;

  return (
    <div className={cn("flex items-start gap-1", className)}>
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = step.done && index <= currentIndex;
        const stamp = formatStamp(step.time);
        return (
          <div key={step.label} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0 flex-1">
              {isDone && !isCurrent ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              ) : isCurrent ? (
                <CircleDot className={cn("h-4 w-4", isDone ? "text-[hsl(var(--success))]" : "text-primary animate-pulse")} />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span className={cn("mt-1 text-[10px] text-center leading-tight", isDone ? "font-medium" : "text-muted-foreground")}>
                {step.label}
              </span>
              {!compact && stamp && isDone && (
                <span className="text-[9px] text-muted-foreground text-center leading-tight">{stamp}</span>
              )}
            </div>
            {index < steps.length - 1 && (
              <div className={cn("h-[2px] flex-1 mt-2 min-w-3", index < currentIndex ? "bg-[hsl(var(--success))]" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
