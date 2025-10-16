import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PatientTicket {
  id: string;
  ticket_number: string;
  status: string;
  workflow_stage: string;
  department_id: string;
  checked_in_at: string;
  priority: number;
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

      // Fetch tickets
      const { data: ticketsData, error: ticketsError } = await supabase
        .from("tickets")
        .select("*")
        .eq("patient_id", patientData.id)
        .order("created_at", { ascending: false });

      if (ticketsError) throw ticketsError;
      setTickets(ticketsData || []);
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
      in_consultation: "secondary",
      awaiting_lab: "outline",
      awaiting_pharmacy: "outline",
      checked_out: "destructive",
    };
    return variants[status] || "outline";
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Check-in Time</TableHead>
                <TableHead>Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">{ticket.ticket_number}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(ticket.status)}>
                      {ticket.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {ticket.workflow_stage.replace(/_/g, " ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {new Date(ticket.checked_in_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ticket.priority > 1 ? "destructive" : "outline"}>
                      {ticket.priority > 1 ? "High" : "Normal"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
