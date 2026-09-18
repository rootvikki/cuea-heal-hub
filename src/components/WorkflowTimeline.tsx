import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

// All possible steps with labels
const STEP_LABELS: Record<string, string> = {
  checked_in: "Check-in",
  triage: "Triage",
  triage_in_progress: "On Triage",
  waiting_for_doctor: "Consultation",
  at_lab: "Laboratory",
  at_imaging: "Imaging",
  at_dental: "Dental",
  at_pharmacy: "Pharmacy",
  at_billing: "Billing",
};

// Map aliases to canonical keys
const STAGE_ALIASES: Record<string, string> = {
  checked_in: "checked_in",
  triage: "triage",
  triage_in_progress: "triage",
  waiting_for_doctor: "waiting_for_doctor",
  in_consult: "waiting_for_doctor",
  at_lab: "at_lab",
  at_imaging: "at_imaging",
  at_dental: "at_dental",
  at_pharmacy: "at_pharmacy",
  at_billing: "at_billing",
  checked_out: "at_billing",
};

export interface DerivePathOptions {
  isDental?: boolean;
  hasLabOrders?: boolean;
  hasImagingOrders?: boolean;
  hasPrescriptions?: boolean;
}

/**
 * Build the actual visit path based on what the patient needs.
 * Only shows steps the patient will actually go through.
 */
export function deriveVisitPath(
  currentStage: string,
  options: DerivePathOptions = {}
): string[] {
  const canonical = STAGE_ALIASES[currentStage] || currentStage;
  const { isDental, hasLabOrders, hasImagingOrders, hasPrescriptions } = options;

  // Dental flow: Check-in → Dental → (Pharmacy if prescriptions) → Billing
  if (isDental || canonical === "at_dental") {
    const path = ["checked_in", "at_dental"];
    if (hasPrescriptions || canonical === "at_pharmacy") path.push("at_pharmacy");
    path.push("at_billing");
    return path;
  }

  // General flow
  const path: string[] = ["checked_in", "triage", "waiting_for_doctor"];

  // Add lab/imaging based on actual orders or if patient is currently there
  if (hasLabOrders || canonical === "at_lab") path.push("at_lab");
  if (hasImagingOrders || canonical === "at_imaging") path.push("at_imaging");

  // Add pharmacy only if there are prescriptions or patient is there
  if (hasPrescriptions || canonical === "at_pharmacy") path.push("at_pharmacy");

  path.push("at_billing");
  return path;
}

/**
 * Infer path from current stage alone (heuristic for queue view where we don't have order data).
 * Shows steps up to and including the current stage, plus billing.
 */
export function inferPathFromStage(currentStage: string): string[] {
  const canonical = STAGE_ALIASES[currentStage] || currentStage;

  if (canonical === "at_dental") {
    return ["checked_in", "at_dental", "at_pharmacy", "at_billing"];
  }

  const allSteps = ["checked_in", "triage", "waiting_for_doctor", "at_lab", "at_imaging", "at_pharmacy", "at_billing"];
  const currentIdx = allSteps.indexOf(canonical);

  if (currentIdx < 0) {
    // Unknown stage, show minimal
    return ["checked_in", "triage", "waiting_for_doctor", "at_billing"];
  }

  // Include all steps up to current, plus billing at the end
  const path = allSteps.slice(0, currentIdx + 1);
  if (!path.includes("at_billing")) path.push("at_billing");
  return path;
}

function getStepStatus(stepKey: string, currentStage: string, visitPath: string[]) {
  const canonical = STAGE_ALIASES[currentStage] || currentStage;
  const stepIndex = visitPath.indexOf(stepKey);
  const currentIndex = visitPath.indexOf(canonical);

  if (stepIndex < 0 || currentIndex < 0) return "future";
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "future";
}

interface WorkflowTimelineProps {
  currentStage: string;
  /** Explicit visit path; if not provided, inferred from stage */
  visitPath?: string[];
  className?: string;
}

export const WorkflowTimeline = ({ currentStage, visitPath, className }: WorkflowTimelineProps) => {
  const path = visitPath || inferPathFromStage(currentStage);

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto py-2", className)}>
      {path.map((stepKey, idx) => {
        const status = getStepStatus(stepKey, currentStage, path);
        const label = STEP_LABELS[stepKey] || stepKey.replace(/_/g, " ");
        return (
          <div key={stepKey} className="flex items-center gap-1 shrink-0">
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
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
