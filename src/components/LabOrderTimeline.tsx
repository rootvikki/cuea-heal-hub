import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type LabOrderStatus = "pending" | "received" | "collected" | "in_progress" | "completed";

export interface LabOrderTimelineOrder {
  status: string | null;
  created_at?: string | null;
  received_at?: string | null;
  sample_collected_at?: string | null;
  processing_started_at?: string | null;
  completed_at?: string | null;
  result_entered_at?: string | null;
}

export const LAB_ORDER_STEPS: { key: LabOrderStatus; label: string }[] = [
  { key: "pending", label: "Sent" },
  { key: "received", label: "Received" },
  { key: "collected", label: "Sample Collected" },
  { key: "in_progress", label: "Processing" },
  { key: "completed", label: "Completed" },
];

export const labOrderStepIndex = (status: string | null | undefined) => {
  const idx = LAB_ORDER_STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
};

export const nextLabOrderStatus = (status: string | null | undefined): LabOrderStatus | null => {
  const idx = labOrderStepIndex(status);
  if (idx >= LAB_ORDER_STEPS.length - 1) return null;
  return LAB_ORDER_STEPS[idx + 1].key;
};

export const labOrderStatusLabel = (status: string | null | undefined) =>
  LAB_ORDER_STEPS[labOrderStepIndex(status)].label;

const stepTime = (order: LabOrderTimelineOrder, key: LabOrderStatus) => {
  switch (key) {
    case "pending": return order.created_at;
    case "received": return order.received_at;
    case "collected": return order.sample_collected_at;
    case "in_progress": return order.processing_started_at;
    case "completed": return order.completed_at || order.result_entered_at;
  }
};

const fmt = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

interface LabOrderTimelineProps {
  order: LabOrderTimelineOrder;
  compact?: boolean;
  className?: string;
}

export function LabOrderTimeline({ order, compact = false, className }: LabOrderTimelineProps) {
  const current = labOrderStepIndex(order.status);

  return (
    <div className={cn("flex items-start gap-1 w-full overflow-x-auto", className)}>
      {LAB_ORDER_STEPS.map((step, i) => {
        const done = i < current || order.status === "completed";
        const isCurrent = i === current && order.status !== "completed";
        const time = fmt(stepTime(order, step.key));
        return (
          <div key={step.key} className="flex items-start gap-1 shrink-0">
            <div className="flex flex-col items-center gap-1 min-w-[68px]">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : isCurrent ? (
                <CircleDot className="h-4 w-4 text-primary animate-pulse" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  "text-[10px] leading-tight text-center",
                  done ? "text-green-700 font-medium" : isCurrent ? "text-primary font-semibold" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
              {!compact && time && (done || isCurrent) && (
                <span className="text-[9px] text-muted-foreground text-center">{time}</span>
              )}
            </div>
            {i < LAB_ORDER_STEPS.length - 1 && (
              <div className={cn("h-px w-5 mt-2", i < current ? "bg-green-500" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
