import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

interface AssignTicketDialogProps {
  ticketId: string;
  currentAssignedTo: string | null;
  onAssigned: () => void;
}

export const AssignTicketDialog = ({ ticketId, currentAssignedTo, onAssigned }: AssignTicketDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [nurses, setNurses] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState(currentAssignedTo || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchStaff();
    }
  }, [open]);

  const fetchStaff = async () => {
    // Fetch doctors
    const { data: doctorRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "doctor");

    if (doctorRoles) {
      const doctorProfiles = await Promise.all(
        doctorRoles.map(async (role) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .eq("user_id", role.user_id)
            .single();
          return profile;
        })
      );
      setDoctors(doctorProfiles.filter(Boolean) as any);
    }

    // Fetch nurses
    const { data: nurseRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "nurse");

    if (nurseRoles) {
      const nurseProfiles = await Promise.all(
        nurseRoles.map(async (role) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .eq("user_id", role.user_id)
            .single();
          return profile;
        })
      );
      setNurses(nurseProfiles.filter(Boolean) as any);
    }
  };

  const handleAssign = async () => {
    if (!selectedStaff) {
      toast({
        title: "Please select a staff member",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ assigned_to: selectedStaff })
        .eq("id", ticketId);

      if (error) throw error;

      toast({
        title: "Ticket assigned successfully",
      });
      setOpen(false);
      onAssigned();
    } catch (error: any) {
      toast({
        title: "Error assigning ticket",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <UserPlus className="h-3 w-3" />
          {currentAssignedTo ? "Reassign" : "Assign"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Ticket to Staff</DialogTitle>
          <DialogDescription>
            Assign this ticket to a doctor or nurse for treatment
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Staff Member</Label>
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger>
                <SelectValue placeholder="Choose doctor or nurse" />
              </SelectTrigger>
              <SelectContent>
                {doctors.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold">Doctors</div>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.user_id} value={doctor.user_id}>
                        Dr. {doctor.full_name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {nurses.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-sm font-semibold">Nurses</div>
                    {nurses.map((nurse) => (
                      <SelectItem key={nurse.user_id} value={nurse.user_id}>
                        {nurse.full_name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={loading}>
              {loading ? "Assigning..." : "Assign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
