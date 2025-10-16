import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Loader2 } from "lucide-react";

interface Department {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  user_id: string;
  staff_id: string;
  department_id: string | null;
  specialization: string | null;
  license_number: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  roles: string[];
  department_name: string | null;
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    department_id: "",
    specialization: "",
    license_number: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchStaff();
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const { data: deptData, error: deptError } = await supabase
        .from("departments")
        .select("id, name");

      if (deptError) {
        toast({ title: "Error fetching departments", description: deptError.message, variant: "destructive" });
        return;
      }
      
      if (deptData) {
        const mappedDepts = deptData.map((d) => ({ id: d.id, name: d.name }));
        setDepartments(mappedDepts);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_all_users_with_roles");

    if (error) {
      toast({ title: "Error fetching staff", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Filter only staff roles
    const staffRoles = ['doctor', 'nurse', 'lab_technician', 'pharmacist', 'receptionist', 'finance_officer'];
    const allUsers = data as any[] || [];
    const staffUsers = allUsers.filter((user) => 
      user.roles?.some((role: string) => staffRoles.includes(role))
    );

    // Get staff details
    const { data: staffDetails, error: staffError } = await supabase
      .from("staff")
      .select(`
        *,
        departments:department_id (name)
      `);

    if (staffError) {
      toast({ title: "Error fetching staff details", description: staffError.message, variant: "destructive" });
    }

    // Merge data
    const staffDetailsArray = staffDetails as any[] || [];
    const mergedStaff: Staff[] = staffUsers.map((user) => {
      const details = staffDetailsArray.find((s) => s.user_id === user.user_id);
      return {
        id: details?.id || user.user_id,
        user_id: user.user_id,
        staff_id: details?.staff_id || 'N/A',
        department_id: details?.department_id,
        specialization: details?.specialization,
        license_number: details?.license_number,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        department_name: details?.departments?.name
      };
    });

    setStaff(mergedStaff);
    setLoading(false);
  };

  const handleEdit = (staffMember: Staff) => {
    setSelectedStaff(staffMember);
    setFormData({
      department_id: staffMember.department_id || "",
      specialization: staffMember.specialization || "",
      license_number: staffMember.license_number || ""
    });
    setEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedStaff) return;

    const { error } = await supabase
      .from("staff")
      .update({
        department_id: formData.department_id || null,
        specialization: formData.specialization || null,
        license_number: formData.license_number || null
      })
      .eq("user_id", selectedStaff.user_id);

    if (error) {
      toast({ title: "Error updating staff", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Staff member updated successfully" });
      setEditDialogOpen(false);
      fetchStaff();
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      super_admin: "destructive",
      admin: "destructive",
      doctor: "default",
      nurse: "secondary",
      lab_technician: "outline",
      pharmacist: "outline",
      receptionist: "outline",
      finance_officer: "outline"
    };
    return variants[role] || "outline";
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Staff Management</CardTitle>
              <CardDescription>Manage hospital staff members and their assignments</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-sm">{member.staff_id}</TableCell>
                    <TableCell className="font-medium">{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.phone || "N/A"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {member.roles?.map((role) => (
                          <Badge key={role} variant={getRoleBadgeVariant(role)}>
                            {role.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{member.department_name || "Not assigned"}</TableCell>
                    <TableCell>{member.specialization || "N/A"}</TableCell>
                    <TableCell>{member.license_number || "N/A"}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => handleEdit(member)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update staff member details and assignment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={formData.department_id} onValueChange={(value) => setFormData({ ...formData, department_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Specialization</Label>
              <Input
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                placeholder="e.g., Cardiology, General Practice"
              />
            </div>
            <div className="space-y-2">
              <Label>License Number</Label>
              <Input
                value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                placeholder="Professional license number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
