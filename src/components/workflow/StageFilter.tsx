import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];

interface StageFilterProps {
  currentStage: string;
  onStageChange: (stage: string) => void;
  stageCounts: Record<string, number>;
}

export const StageFilter = ({
  currentStage,
  onStageChange,
  stageCounts,
}: StageFilterProps) => {
  const stages: { value: string; label: string }[] = [
    { value: "all", label: "All" },
    { value: "checked_in", label: "Check-in" },
    { value: "triage", label: "Triage" },
    { value: "waiting_for_doctor", label: "Waiting" },
    { value: "in_consult", label: "Consultation" },
    { value: "order_placed_lab", label: "Lab Orders" },
    { value: "at_lab", label: "Lab" },
    { value: "at_pharmacy", label: "Pharmacy" },
    { value: "at_billing", label: "Billing" },
  ];

  return (
    <Tabs value={currentStage} onValueChange={onStageChange} className="w-full">
      <TabsList className="w-full justify-start flex-wrap h-auto">
        {stages.map((stage) => (
          <TabsTrigger
            key={stage.value}
            value={stage.value}
            className="gap-2"
          >
            {stage.label}
            {stageCounts[stage.value] > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stageCounts[stage.value]}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
