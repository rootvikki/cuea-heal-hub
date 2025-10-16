import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, MapPin, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

interface PatientTicket {
  id: string;
  ticket_number: string;
  status: string;
  workflow_stage: string;
  department_id: string;
  checked_in_at: string;
  priority: number;
  assigned_to: string | null;
  department: {
    name: string;
  };
}

export const PatientTicketView = () => {
  const [tickets, setTickets] = useState<PatientTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [patientId, setPatientId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPatientTickets();
  }, []);

  const fetchPatientTickets = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get patient record
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (patientError) throw patientError;
      if (!patientData) {
        toast({
          title: "No patient record found",
          description: "Please contact the reception desk",
          variant: "destructive",
        });
        return;
      }

      setPatientId(patientData.id);

      // Fetch tickets with department info
      const { data: ticketsData, error: ticketsError } = await supabase
        .from("tickets")
        .select("*, departments(name)")
        .eq("patient_id", patientData.id)
        .order("created_at", { ascending: false });

      if (ticketsError) throw ticketsError;
      setTickets((ticketsData || []) as any);
    } catch (error: any) {
      toast({
        title: "Error loading tickets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      checked_in: "default",
      triage: "secondary",
      waiting_for_doctor: "secondary",
      in_consult: "secondary",
      order_placed_lab: "outline",
      at_lab: "outline",
      at_pharmacy: "outline",
      at_billing: "outline",
      checked_out: "default",
    };
    return variants[status] || "outline";
  };

  const getProgressPercentage = (status: string) => {
    const stages = [
      "checked_in",
      "triage",
      "waiting_for_doctor",
      "in_consult",
      "at_lab",
      "at_pharmacy",
      "at_billing",
      "checked_out"
    ];
    const index = stages.indexOf(status);
    return index >= 0 ? ((index + 1) / stages.length) * 100 : 0;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">Loading your tickets...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              My Tickets
            </CardTitle>
            <CardDescription>
              View your current and past visit tickets
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <div className="text-center py-8">
            <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No tickets found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Visit the reception desk to check in for your appointment
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <Card key={ticket.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold">{ticket.ticket_number}</span>
                          <Badge variant={getStatusBadge(ticket.status)}>
                            {ticket.status.replace(/_/g, " ")}
                          </Badge>
                          {ticket.priority > 1 && (
                            <Badge variant="destructive">High Priority</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {ticket.department?.name || "N/A"}
                        </p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(ticket.checked_in_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Current Stage:</span>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ticket.status.replace(/_/g, " ")}
                        </div>
                      </div>
                      <Progress value={getProgressPercentage(ticket.status)} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">
                        {Math.round(getProgressPercentage(ticket.status))}% Complete
                      </p>
                    </div>

                    {ticket.status !== "checked_out" && (
                      <div className="pt-3 border-t">
                        <p className="text-sm text-muted-foreground">
                          Your visit is in progress. Please wait for your turn.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
