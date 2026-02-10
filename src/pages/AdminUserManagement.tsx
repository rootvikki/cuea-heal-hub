import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  UserPlus,
  Search,
  MoreHorizontal,
  Shield,
  UserX,
  KeyRound,
  Mail,
  Users,
  RefreshCw,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  roles: string[];
  created_at: string;
  payroll_number?: string | null;
  status?: string;
  last_login_at?: string;
}

const ALL_ROLES: { value: AppRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "receptionist", label: "Receptionist" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "radiologist", label: "Radiologist" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "clinical_officer", label: "Clinical Officer" },
  { value: "records_officer", label: "Records Officer" },
  { value: "ward_manager", label: "Ward Manager" },
  { value: "patient", label: "Patient" },
];

const AdminUserManagement = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  
  // New user form state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<AppRole[]>([]);
  const [newUserDepartment, setNewUserDepartment] = useState<string>("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Role management state
  const [userRolesToUpdate, setUserRolesToUpdate] = useState<AppRole[]>([]);
  const [updatingRoles, setUpdatingRoles] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_all_users_with_roles");
      
      if (error) throw error;
      
      setUsers(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("id, name");
    setDepartments(data || []);
  };

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserFullName || newUserRoles.length === 0) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setCreatingUser(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newUserEmail,
          fullName: newUserFullName,
          phone: newUserPhone,
          roles: newUserRoles,
          departmentId: newUserDepartment || null,
          adminUserId: session.user.id,
        },
      });

      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);

      toast({
        title: "User created successfully",
        description: `${newUserFullName} has been added. A welcome email with credentials has been sent.`,
      });

      setCreateDialogOpen(false);
      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserPhone("");
      setNewUserRoles([]);
      setNewUserDepartment("");
      
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const openRolesDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setUserRolesToUpdate(user.roles as AppRole[]);
    setRolesDialogOpen(true);
  };

  const handleUpdateRoles = async () => {
    if (!selectedUser) return;

    setUpdatingRoles(true);

    try {
      // Delete existing roles
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", selectedUser.user_id);

      // Insert new roles
      for (const role of userRolesToUpdate) {
        await supabase.from("user_roles").insert({
          user_id: selectedUser.user_id,
          role: role,
        });
      }

      toast({
        title: "Roles updated",
        description: `${selectedUser.full_name}'s roles have been updated.`,
      });

      setRolesDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Failed to update roles",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdatingRoles(false);
    }
  };

  const handleResetPassword = async (user: UserWithRoles) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: `A password reset link has been sent to ${user.email}.`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to send reset email",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter);
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin":
        return "destructive";
      case "admin":
        return "default";
      case "doctor":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts and role assignments
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new staff member or user to the system. They will receive a welcome email with their login credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">Email *</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="user@cuea.edu"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-name">Full Name *</Label>
                <Input
                  id="new-name"
                  placeholder="John Doe"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-phone">Phone</Label>
                <Input
                  id="new-phone"
                  placeholder="+254..."
                  value={newUserPhone}
                  onChange={(e) => setNewUserPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
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
                <Label>Roles *</Label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {ALL_ROLES.map((role) => (
                    <div key={role.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`new-role-${role.value}`}
                        checked={newUserRoles.includes(role.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewUserRoles([...newUserRoles, role.value]);
                          } else {
                            setNewUserRoles(newUserRoles.filter((r) => r !== role.value));
                          }
                        }}
                      />
                      <Label
                        htmlFor={`new-role-${role.value}`}
                        className="text-sm font-normal"
                      >
                        {role.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={creatingUser}>
                {creatingUser ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>All Users</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <CardDescription>
            {users.length} total users in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ALL_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Payroll No</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.full_name || "No name"}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                            {user.phone && (
                              <p className="text-xs text-muted-foreground">{user.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {user.payroll_number || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles?.map((role) => (
                              <Badge
                                key={role}
                                variant={getRoleBadgeVariant(role)}
                                className="text-xs"
                              >
                                {role.replace("_", " ")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openRolesDialog(user)}>
                                <Shield className="mr-2 h-4 w-4" />
                                Manage Roles
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset Password
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roles Management Dialog */}
      <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Roles</DialogTitle>
            <DialogDescription>
              Update roles for {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {ALL_ROLES.map((role) => (
                <div key={role.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`update-role-${role.value}`}
                    checked={userRolesToUpdate.includes(role.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setUserRolesToUpdate([...userRolesToUpdate, role.value]);
                      } else {
                        setUserRolesToUpdate(userRolesToUpdate.filter((r) => r !== role.value));
                      }
                    }}
                  />
                  <Label
                    htmlFor={`update-role-${role.value}`}
                    className="text-sm font-normal"
                  >
                    {role.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRoles} disabled={updatingRoles}>
              {updatingRoles ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Roles"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUserManagement;
