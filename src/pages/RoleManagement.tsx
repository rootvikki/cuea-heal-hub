import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Shield, Plus, Trash2, Users, Loader2 } from "lucide-react";

type AppRole = "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager";

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  roles: string[];
  created_at: string;
}

interface RoleCount {
  role: AppRole;
  count: number;
  label: string;
  color: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Administrator", color: "bg-red-500" },
  system_admin: { label: "System Administrator", color: "bg-orange-500" },
  admin: { label: "Administrator", color: "bg-amber-500" },
  hr_admin: { label: "HR Administrator", color: "bg-yellow-500" },
  doctor: { label: "Doctor", color: "bg-blue-500" },
  clinical_officer: { label: "Clinical Officer", color: "bg-cyan-500" },
  nurse: { label: "Nurse", color: "bg-teal-500" },
  ward_manager: { label: "Ward Manager", color: "bg-emerald-500" },
  receptionist: { label: "Receptionist", color: "bg-green-500" },
  lab_technician: { label: "Lab Technician", color: "bg-violet-500" },
  radiologist: { label: "Radiologist", color: "bg-purple-500" },
  pharmacist: { label: "Pharmacist", color: "bg-pink-500" },
  finance_officer: { label: "Finance Officer", color: "bg-rose-500" },
  cashier: { label: "Cashier", color: "bg-fuchsia-500" },
  accountant: { label: "Accountant", color: "bg-indigo-500" },
  records_officer: { label: "Records Officer", color: "bg-sky-500" },
  auditor: { label: "Auditor", color: "bg-slate-500" },
  patient: { label: "Patient", color: "bg-gray-500" },
};

export default function RoleManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithRoles[]>([]);
  const [roleCounts, setRoleCounts] = useState<RoleCount[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [isRemovingRole, setIsRemovingRole] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<string>("");

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery, filterRole]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_all_users_with_roles");
      
      if (error) throw error;

      const usersData = (data || []) as UserWithRoles[];
      setUsers(usersData);

      // Calculate role counts
      const counts: Record<string, number> = {};
      usersData.forEach(user => {
        user.roles?.forEach(role => {
          counts[role] = (counts[role] || 0) + 1;
        });
      });

      const roleCountsArray: RoleCount[] = Object.entries(ROLE_CONFIG).map(([role, config]) => ({
        role: role as AppRole,
        count: counts[role] || 0,
        label: config.label,
        color: config.color,
      }));

      setRoleCounts(roleCountsArray);
    } catch (error: any) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        user =>
          user.full_name?.toLowerCase().includes(query) ||
          user.email?.toLowerCase().includes(query)
      );
    }

    if (filterRole && filterRole !== "all") {
      filtered = filtered.filter(user => user.roles?.includes(filterRole));
    }

    setFilteredUsers(filtered);
  };

  const handleAddRole = async () => {
    if (!selectedUser || !newRole) return;

    setIsAddingRole(true);
    try {
      const { error } = await supabase.from("user_roles").insert({
        user_id: selectedUser.user_id,
        role: newRole as "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager",
      });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Role Already Assigned",
            description: `${selectedUser.full_name} already has the ${ROLE_CONFIG[newRole]?.label || newRole} role.`,
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Role Added",
          description: `${ROLE_CONFIG[newRole]?.label || newRole} role has been assigned to ${selectedUser.full_name}.`,
        });
        fetchUsers();
      }
    } catch (error: any) {
      toast({
        title: "Error adding role",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAddingRole(false);
      setNewRole("");
      setSelectedUser(null);
    }
  };

  const handleRemoveRole = async () => {
    if (!selectedUser || !roleToRemove) return;

    setIsRemovingRole(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", selectedUser.user_id)
        .eq("role", roleToRemove as "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager");

      if (error) throw error;

      toast({
        title: "Role Removed",
        description: `${ROLE_CONFIG[roleToRemove]?.label || roleToRemove} role has been removed from ${selectedUser.full_name}.`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error removing role",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRemovingRole(false);
      setRoleToRemove("");
      setSelectedUser(null);
    }
  };

  const getRoleBadgeColor = (role: string): string => {
    return ROLE_CONFIG[role]?.color || "bg-gray-500";
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Role Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage user roles and permissions across the system
        </p>
      </div>

      {/* Role Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        {roleCounts.filter(rc => rc.count > 0).map(roleCount => (
          <Card
            key={roleCount.role}
            className={`cursor-pointer transition-all hover:shadow-md ${
              filterRole === roleCount.role ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setFilterRole(filterRole === roleCount.role ? "all" : roleCount.role)}
          >
            <CardContent className="p-4 text-center">
              <div className={`w-3 h-3 rounded-full ${roleCount.color} mx-auto mb-2`} />
              <p className="text-2xl font-bold">{roleCount.count}</p>
              <p className="text-xs text-muted-foreground truncate">{roleCount.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filter */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                  <SelectItem key={role} value={role}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users ({filteredUsers.length})
          </CardTitle>
          <CardDescription>
            {filterRole !== "all" 
              ? `Showing users with ${ROLE_CONFIG[filterRole]?.label || filterRole} role`
              : "All users in the system"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found matching your criteria.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(user => (
                  <TableRow key={user.user_id}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.map(role => (
                          <Badge
                            key={role}
                            className={`${getRoleBadgeColor(role)} text-white text-xs`}
                          >
                            {ROLE_CONFIG[role]?.label || role}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {/* Add Role Dialog */}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Role</DialogTitle>
                              <DialogDescription>
                                Add a new role to {user.full_name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Select value={newRole} onValueChange={setNewRole}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(ROLE_CONFIG)
                                    .filter(([role]) => !user.roles?.includes(role))
                                    .map(([role, config]) => (
                                      <SelectItem key={role} value={role}>
                                        {config.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={handleAddRole}
                                disabled={!newRole || isAddingRole}
                              >
                                {isAddingRole ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Plus className="h-4 w-4 mr-2" />
                                )}
                                Add Role
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        {/* Remove Role Dialog */}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Remove Role</DialogTitle>
                              <DialogDescription>
                                Remove a role from {user.full_name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Select value={roleToRemove} onValueChange={setRoleToRemove}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role to remove" />
                                </SelectTrigger>
                                <SelectContent>
                                  {user.roles?.map(role => (
                                    <SelectItem key={role} value={role}>
                                      {ROLE_CONFIG[role]?.label || role}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <DialogFooter>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    disabled={!roleToRemove}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove Role
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove the{" "}
                                      <strong>{ROLE_CONFIG[roleToRemove]?.label || roleToRemove}</strong>{" "}
                                      role from <strong>{user.full_name}</strong>? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={handleRemoveRole}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {isRemovingRole ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : null}
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
