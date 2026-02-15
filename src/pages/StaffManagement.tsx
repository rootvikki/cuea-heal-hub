import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Search, Building } from "lucide-react";

interface StaffMember {
  id: string;
  user_id: string;
  staff_id: string;
  department_id: string | null;
  specialization: string | null;
  license_number: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    phone: string;
    email?: string;
  };
  department?: {
    name: string;
  };
  roles?: string[];
}

interface Department {
  id: string;
  name: string;
  description: string;
}

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "system_admin", label: "System Admin" },
  { value: "doctor", label: "Doctor" },
  { value: "clinical_officer", label: "Clinical Officer" },
  { value: "nurse", label: "Nurse" },
  { value: "ward_manager", label: "Ward Manager" },
  { value: "receptionist", label: "Receptionist" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "radiologist", label: "Radiologist" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "cashier", label: "Cashier" },
  { value: "accountant", label: "Accountant" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "records_officer", label: "Records Officer" },
  { value: "auditor", label: "Auditor" },
  { value: "patient", label: "Patient" },
];

const StaffManagement = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch departments and staff in parallel
      const [deptRes, staffRes, usersRes] = await Promise.all([
        supabase.from("departments").select("*").order("name"),
        supabase.from("staff").select(`*, department:departments(name)`).order("created_at", { ascending: false }),
        supabase.rpc("get_all_users_with_roles"),
      ]);

      if (deptRes.error) throw deptRes.error;
      if (staffRes.error) throw staffRes.error;

      setDepartments(deptRes.data || []);

      // Build lookup maps from the single RPC call
      const usersMap = new Map<string, { email?: string; roles: string[]; full_name?: string; phone?: string }>();
      for (const u of (usersRes.data || [])) {
        usersMap.set(u.user_id, {
          email: u.email,
          roles: u.roles || [],
          full_name: u.full_name,
          phone: u.phone,
        });
      }

      // Join in memory — no N+1
      const staffWithDetails = (staffRes.data || []).map((member) => {
        const userData = usersMap.get(member.user_id);
        return {
          ...member,
          profile: userData
            ? { full_name: userData.full_name || "", phone: userData.phone || "", email: userData.email }
            : null,
          roles: userData?.roles || [],
        };
      });

      setStaff(staffWithDetails);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStaffDepartment = async (staffId: string, departmentId: string) => {
    try {
      const { error } = await supabase
        .from("staff")
        .update({ department_id: departmentId })
        .eq("id", staffId);

      if (error) throw error;

      toast({ title: "Staff Updated", description: "Department assignment updated successfully" });
      fetchData();
    } catch (error) {
      console.error("Error updating staff:", error);
      toast({ title: "Error", description: "Failed to update staff", variant: "destructive" });
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin":
      case "super_admin":
        return "bg-purple-100 text-purple-800";
      case "doctor":
        return "bg-blue-100 text-blue-800";
      case "nurse":
        return "bg-green-100 text-green-800";
      case "receptionist":
        return "bg-yellow-100 text-yellow-800";
      case "lab_technician":
        return "bg-orange-100 text-orange-800";
      case "pharmacist":
        return "bg-pink-100 text-pink-800";
      case "radiologist":
        return "bg-cyan-100 text-cyan-800";
      case "finance_officer":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredStaff = staff.filter(
    (member) =>
      member.profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.staff_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const staffByRole = ROLES.reduce((acc, role) => {
    acc[role.value] = staff.filter((s) => s.roles?.includes(role.value)).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Staff Management</h1>
          <p className="text-muted-foreground">Manage hospital staff and assignments</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button onClick={() => navigate("/admin/onboard-staff")}>
            <UserPlus className="mr-2 h-4 w-4" />Onboard Staff
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {ROLES.filter(r => staffByRole[r.value] > 0).map((role) => (
          <Card key={role.value}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{staffByRole[role.value]}</p>
              <p className="text-xs text-muted-foreground">{role.label}s</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Department Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => {
          const deptStaff = staff.filter((s) => s.department_id === dept.id);
          return (
            <Card key={dept.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {dept.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{deptStaff.length}</p>
                <p className="text-sm text-muted-foreground">Staff members</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {deptStaff.slice(0, 3).map((s) => (
                    <Badge key={s.id} variant="outline" className="text-xs">
                      {s.profile?.full_name?.split(" ")[0]}
                    </Badge>
                  ))}
                  {deptStaff.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{deptStaff.length - 3} more
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Staff ({filteredStaff.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStaff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No staff members found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>License #</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-sm">{member.staff_id}</TableCell>
                    <TableCell>
                      <p className="font-medium">{member.profile?.full_name || "Unknown"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{member.profile?.phone}</p>
                        <p className="text-muted-foreground">{member.profile?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={member.department_id || ""}
                        onValueChange={(value) => updateStaffDepartment(member.id, value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Assign department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{member.specialization || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{member.license_number || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.roles?.map((role) => (
                          <Badge key={role} className={getRoleColor(role)}>
                            {role.replace("_", " ")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStaff(member);
                          setEditDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Staff Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Details</DialogTitle>
          </DialogHeader>
          {selectedStaff && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium">{selectedStaff.profile?.full_name}</p>
                <p className="text-sm text-muted-foreground">Staff ID: {selectedStaff.staff_id}</p>
              </div>
              <div className="space-y-2">
                <Label>Specialization</Label>
                <Input
                  value={selectedStaff.specialization || ""}
                  onChange={(e) =>
                    setSelectedStaff({ ...selectedStaff, specialization: e.target.value })
                  }
                  placeholder="e.g., Cardiology, Pediatrics"
                />
              </div>
              <div className="space-y-2">
                <Label>License Number</Label>
                <Input
                  value={selectedStaff.license_number || ""}
                  onChange={(e) =>
                    setSelectedStaff({ ...selectedStaff, license_number: e.target.value })
                  }
                  placeholder="Professional license number"
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={selectedStaff.department_id || ""}
                  onValueChange={(value) =>
                    setSelectedStaff({ ...selectedStaff, department_id: value })
                  }
                >
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      const { error } = await supabase
                        .from("staff")
                        .update({
                          specialization: selectedStaff.specialization,
                          license_number: selectedStaff.license_number,
                          department_id: selectedStaff.department_id,
                        })
                        .eq("id", selectedStaff.id);

                      if (error) throw error;

                      toast({
                        title: "Staff Updated",
                        description: "Staff details updated successfully",
                      });

                      setEditDialogOpen(false);
                      fetchData();
                    } catch (error) {
                      console.error("Error updating staff:", error);
                      toast({
                        title: "Error",
                        description: "Failed to update staff",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffManagement;
