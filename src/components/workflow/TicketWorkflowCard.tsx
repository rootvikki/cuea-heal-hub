import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  User,
  Calendar,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { AssignTicketDialog } from "./AssignTicketDialog";
import { TicketCommentsDialog } from "./TicketCommentsDialog";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];

interface TicketWorkflowCardProps {
  ticket: any;
  onUpdate: () => void;
  userRoles: string[];
}

export const TicketWorkflowCard = ({
  ticket,
  onUpdate,
  userRoles,
}: TicketWorkflowCardProps) => {
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(null);

  useEffect(() => {
    if (ticket.assigned_to) {
      fetchAssignedStaffName();
    }
  }, [ticket.assigned_to]);

  const fetchAssignedStaffName = async () => {
    if (!ticket.assigned_to) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", ticket.assigned_to)
      .single();
    
    if (data) {
      setAssignedStaffName(data.full_name);
    }
  };

  const workflowStages: { status: TicketStatus; label: string; roles: string[] }[] = [
    { status: "checked_in", label: "Checked In", roles: ["receptionist", "admin", "super_admin"] },
    { status: "triage", label: "Triage", roles: ["nurse", "admin", "super_admin"] },
    { status: "waiting_for_doctor", label: "Waiting", roles: ["nurse", "admin", "super_admin"] },
    { status: "in_consult", label: "Consultation", roles: ["doctor", "admin", "super_admin"] },
    { status: "order_placed_lab", label: "Lab Order", roles: ["doctor", "admin", "super_admin"] },
    { status: "at_lab", label: "At Lab", roles: ["lab_technician", "admin", "super_admin"] },
    { status: "at_pharmacy", label: "Pharmacy", roles: ["pharmacist", "admin", "super_admin"] },
    { status: "at_billing", label: "Billing", roles: ["finance_officer", "admin", "super_admin"] },
    { status: "checked_out", label: "Completed", roles: ["receptionist", "admin", "super_admin"] },
  ];

  const currentStageIndex = workflowStages.findIndex(
    (s) => s.status === ticket.status
  );

  const canMoveToStage = (stage: { roles: string[] }) => {
    return userRoles.some((role) => stage.roles.includes(role));
  };

  const updateStatus = async (newStatus: TicketStatus) => {
    setUpdating(true);
    try {
      const updateData: any = { status: newStatus };
      
      if (newStatus === "checked_out") {
        updateData.checked_out_at = new Date().toISOString();
      }

      const { error} = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", ticket.id);

      if (error) throw error;

      toast({
        title: "Status updated",
        description: `Ticket moved to ${workflowStages.find(s => s.status === newStatus)?.label}`,
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const getNextStages = () => {
    if (ticket.status === "in_consult") {
      return [
        workflowStages.find((s) => s.status === "order_placed_lab"),
        workflowStages.find((s) => s.status === "at_pharmacy"),
        workflowStages.find((s) => s.status === "at_billing"),
      ].filter(Boolean);
    }
    
    if (ticket.status === "at_lab" || ticket.status === "at_pharmacy") {
      return [workflowStages.find((s) => s.status === "at_billing")].filter(Boolean);
    }

    const nextIndex = currentStageIndex + 1;
    if (nextIndex < workflowStages.length) {
      return [workflowStages[nextIndex]];
    }
    return [];
  };

  const getPriorityBadge = (priority: number) => {
    if (priority === 3)
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Emergency
        </Badge>
      );
    if (priority === 2)
      return (
        <Badge className="bg-warning gap-1">
          <AlertCircle className="h-3 w-3" />
          High
        </Badge>
      );
    return <Badge variant="outline">Normal</Badge>;
  };

  const nextStages = getNextStages();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{ticket.ticket_number}</span>
              {getPriorityBadge(ticket.priority)}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="font-medium">
                {ticket.patient?.profile?.full_name}
              </span>
              <span>•</span>
              <span>{ticket.patient?.patient_id}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(ticket.checked_in_at).toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">
              {ticket.department?.name}
            </p>
          </div>

          <Badge
            variant={ticket.status === "checked_out" ? "default" : "secondary"}
            className="gap-1"
          >
            {ticket.status === "checked_out" && (
              <CheckCircle className="h-3 w-3" />
            )}
            {ticket.status.replace(/_/g, " ")}
          </Badge>
        </div>

        {assignedStaffName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <User className="h-4 w-4" />
            <span>Assigned to: <span className="font-medium">{assignedStaffName}</span></span>
          </div>
        )}

        {ticket.status !== "checked_out" && (
          <div className="flex gap-2 flex-wrap pt-3 border-t mt-3">
            {nextStages.length > 0 && nextStages.map((stage: any) => (
              <Button
                key={stage.status}
                size="sm"
                variant="outline"
                onClick={() => updateStatus(stage.status)}
                disabled={updating || !canMoveToStage(stage)}
                className="gap-1"
              >
                Move to {stage.label}
                <ArrowRight className="h-3 w-3" />
              </Button>
            ))}
            
            {userRoles.some((r) => ["super_admin", "admin", "doctor"].includes(r)) && (
              <AssignTicketDialog
                ticketId={ticket.id}
                currentAssignedTo={ticket.assigned_to}
                onAssigned={onUpdate}
              />
            )}
            
            <TicketCommentsDialog
              ticketId={ticket.id}
              currentStage={ticket.status}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
