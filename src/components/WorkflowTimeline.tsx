import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  { key: "checked_in", label: "Check-in" },
  { key: "triage", label: "Triage" },
  { key: "waiting_for_doctor", label: "Consultation" },
  { key: "at_lab", label: "Laboratory" },
  { key: "at_imaging", label: "Imaging" },
  { key: "at_dental", label: "Dental" },
  { key: "at_pharmacy", label: "Pharmacy" },
  { key: "at_billing", label: "Billing" },
];

// Map aliases to canonical keys
const STAGE_ALIASES: Record<string, string> = {
  checked_in: "checked_in",
  triage: "triage",
  waiting_for_doctor: "waiting_for_doctor",
  in_consult: "waiting_for_doctor",
  at_lab: "at_lab",
  at_imaging: "at_imaging",
  at_dental: "at_dental",
  at_pharmacy: "at_pharmacy",
  at_billing: "at_billing",
  checked_out: "checked_out",
};

function getStepStatus(stepKey: string, currentStage: string) {
  const canonical = STAGE_ALIASES[currentStage] || currentStage;
  const stepIndex = WORKFLOW_STEPS.findIndex((s) => s.key === stepKey);
  const currentIndex = WORKFLOW_STEPS.findIndex((s) => s.key === canonical);

  if (stepIndex < 0 || currentIndex < 0) return "future";
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "future";
}

interface WorkflowTimelineProps {
  currentStage: string;
  className?: string;
}

export const WorkflowTimeline = ({ currentStage, className }: WorkflowTimelineProps) => {
  // Filter out unused branches: only show dental if patient is at/past dental, etc.
  const canonical = STAGE_ALIASES[currentStage] || currentStage;
  const isDental = canonical === "at_dental";
  const isLab = canonical === "at_lab" || canonical === "at_imaging";

  const steps = WORKFLOW_STEPS.filter((step) => {
    // Always show check-in, triage, consultation, pharmacy, billing
    if (["checked_in", "triage", "waiting_for_doctor", "at_pharmacy", "at_billing"].includes(step.key)) return true;
    // Show dental only if patient is in dental flow
    if (step.key === "at_dental") return isDental;
    // Show lab/imaging if patient went through them or is currently there
    if (step.key === "at_lab") return !isDental;
    if (step.key === "at_imaging") return !isDental;
    return true;
  });

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto py-2", className)}>
      {steps.map((step, idx) => {
        const status = getStepStatus(step.key, currentStage);
        return (
          <div key={step.key} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <div
                className={cn(
                  "w-4 md:w-6 h-[2px] rounded-full",
                  status === "completed" ? "bg-primary" : status === "current" ? "bg-primary/50" : "bg-border"
                )}
              />
            )}
            <div className="flex items-center gap-1">
              {status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : status === "current" ? (
                <CircleDot className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={cn(
                  "text-[10px] md:text-xs font-medium whitespace-nowrap",
                  status === "completed" ? "text-primary" : status === "current" ? "text-foreground font-semibold" : "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
