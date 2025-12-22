import { useState } from "react";
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
import { UserCog } from "lucide-react";

interface AdminRoleAssignmentProps {
  userId?: string;
  userEmail?: string;
}

export const AdminRoleAssignment = ({ userId, userEmail }: AdminRoleAssignmentProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [staffId, setStaffId] = useState("");

  const handleAssignRole = async () => {
    if (!userId || !selectedRole) return;

    try {
      // Assign role - try insert with explicit type casting
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: selectedRole as "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager",
      });

      // Ignore duplicate key errors
      if (roleError && !roleError.message.toLowerCase().includes("duplicate")) {
        throw roleError;
      }

      // If staff role, create staff record
      const staffRoles = ["doctor", "nurse", "lab_technician", "pharmacist", "receptionist", "finance_officer", "admin", "super_admin", "system_admin", "radiologist", "cashier", "accountant", "hr_admin", "auditor", "clinical_officer", "records_officer", "ward_manager"];
      if (staffRoles.includes(selectedRole)) {
        const staffNumber = `STAFF-${Date.now().toString().slice(-6)}`;
        
        const { error: staffError } = await supabase.from("staff").upsert({
          user_id: userId,
          staff_id: staffNumber,
          department_id: null, // Can be set later
        }, {
          onConflict: "user_id",
          ignoreDuplicates: true,
        });

        if (staffError && !staffError.message.includes("duplicate")) {
          console.error("Staff creation error:", staffError);
        }
      }

      toast({
        title: "Role assigned",
        description: `${selectedRole} role assigned successfully`,
      });

      setOpen(false);
      window.location.reload(); // Refresh to update sidebar
    } catch (error: any) {
      toast({
        title: "Error assigning role",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserCog className="h-4 w-4" />
          Assign Role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign User Role</DialogTitle>
          <DialogDescription>
            {userEmail && `Assigning role for: ${userEmail}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="super_admin">Super Administrator</SelectItem>
                <SelectItem value="system_admin">System Administrator</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="doctor">Doctor</SelectItem>
                <SelectItem value="clinical_officer">Clinical Officer</SelectItem>
                <SelectItem value="nurse">Nurse</SelectItem>
                <SelectItem value="ward_manager">Ward Manager</SelectItem>
                <SelectItem value="receptionist">Receptionist</SelectItem>
                <SelectItem value="lab_technician">Lab Technician</SelectItem>
                <SelectItem value="radiologist">Radiologist</SelectItem>
                <SelectItem value="pharmacist">Pharmacist</SelectItem>
                <SelectItem value="finance_officer">Finance Officer</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="accountant">Accountant</SelectItem>
                <SelectItem value="hr_admin">HR Administrator</SelectItem>
                <SelectItem value="records_officer">Records Officer</SelectItem>
                <SelectItem value="auditor">Auditor</SelectItem>
                <SelectItem value="patient">Patient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignRole} disabled={!selectedRole}>
              Assign Role
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
