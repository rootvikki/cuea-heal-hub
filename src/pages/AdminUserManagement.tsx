import { useState, useEffect } from "react";
import { Pager, usePaged } from "@/components/Pager";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/auditLog";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, UserPlus, Search, MoreHorizontal, Shield, KeyRound, Users, RefreshCw, Pencil, Ban, Trash2, CheckCircle, XCircle, Eye,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

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

const AdminUserManagement = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user: currentUser } = useUser();

  const readFunctionError = async (error: unknown): Promise<string> => {
    const ctx = (error as { context?: Response }).context;
    try {
      const body = ctx ? await ctx.clone().json() : null;
      if (body?.error) return String(body.error);
    } catch { /* not JSON */ }
    return error instanceof Error ? error.message : String(error);
  };

  /** Opens a new tab signed in as this user (their own session, nothing else changes here). */
  const loginAs = async (target: { user_id: string; full_name?: string | null }) => {
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups for this site, then try Log in as again.", variant: "destructive" });
      return;
    }
    tab.document.title = "Signing in…";
    const { data, error } = await supabase.functions.invoke("admin-login-as", { body: { userId: target.user_id } });
    const message = (data as { error?: string } | null)?.error || (error ? await readFunctionError(error) : null);
    if (message || !data?.tokenHash) {
      tab.close();
      toast({ title: "Could not log in as this user", description: message || "No sign-in token was returned.", variant: "destructive" });
      return;
    }
    tab.opener = null;
    tab.location.href = `${window.location.origin}/login-as#t=${encodeURIComponent(data.tokenHash)}`;
    toast({ title: `Opened a new tab as ${data.name || target.full_name || "this user"}`, description: "Your own tab stays signed in as you." });
  };
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Create user form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<AppRole[]>([]);
  const [newUserDepartment, setNewUserDepartment] = useState<string>("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Role management
  const [userRolesToUpdate, setUserRolesToUpdate] = useState<AppRole[]>([]);
  const [updatingRoles, setUpdatingRoles] = useState(false);

  // Edit profile
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", email: "", dateOfBirth: "", gender: "", address: "", payrollNumber: "" });
  const [editLoading, setEditLoading] = useState(false);

  // Change password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Suspend
  const [suspendLoading, setSuspendLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_all_users_with_roles");
      if (error) throw error;

      // Enrich with profile status; last login comes from the sign-in system itself
      // (every password, link and code sign-in is recorded there).
      const userIds = (data || []).map((u: any) => u.user_id);
      const [{ data: profiles }, { data: signIns }] = await Promise.all([
        supabase.from("profiles").select("user_id, status, last_login_at").in("user_id", userIds),
        supabase.rpc("get_users_last_sign_in"),
      ]);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const signInMap = new Map((signIns || []).map((s: any) => [s.user_id, s.last_sign_in_at as string | null]));

      const enriched = (data || []).map((u: any) => {
        const profile = profileMap.get(u.user_id);
        const times = [signInMap.get(u.user_id), profile?.last_login_at].filter(Boolean) as string[];
        const last = times.sort().pop();
        return { ...u, status: profile?.status || "active", last_login_at: last };
      });

      setUsers(enriched);
    } catch (error: any) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("id, name");
    setDepartments(data || []);
  };

  useEffect(() => { fetchUsers(); fetchDepartments(); }, []);

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserFullName || newUserRoles.length === 0) {
      toast({ title: "Missing required fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setCreatingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await supabase.functions.invoke("admin-create-user", {
        body: { email: newUserEmail, fullName: newUserFullName, phone: newUserPhone, roles: newUserRoles, departmentId: newUserDepartment || null, adminUserId: session.user.id },
      });
      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);
      toast({ title: "User created", description: `${newUserFullName} added. Welcome email sent.` });
      setCreateDialogOpen(false);
      setNewUserEmail(""); setNewUserFullName(""); setNewUserPhone(""); setNewUserRoles([]); setNewUserDepartment("");
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
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
      await supabase.from("user_roles").delete().eq("user_id", selectedUser.user_id);
      for (const role of userRolesToUpdate) {
        await supabase.from("user_roles").insert({ user_id: selectedUser.user_id, role });
      }
      toast({ title: "Roles updated", description: `${selectedUser.full_name}'s roles updated.` });
      logAuditEvent({ action: "UPDATE_ROLES", module: "user_management", details: { target_user_id: selectedUser.user_id, target_email: selectedUser.email, old_roles: selectedUser.roles, new_roles: userRolesToUpdate } });
      setRolesDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Failed to update roles", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingRoles(false);
    }
  };

  const openEditDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setEditForm({
      fullName: user.full_name || "",
      phone: user.phone || "",
      email: user.email || "",
      dateOfBirth: "", gender: "", address: "",
      payrollNumber: user.payroll_number || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditProfile = async () => {
    if (!selectedUser) return;
    setEditLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: {
          action: "update_profile",
          userId: selectedUser.user_id,
          fullName: editForm.fullName,
          phone: editForm.phone,
          email: editForm.email,
          dateOfBirth: editForm.dateOfBirth || null,
          gender: editForm.gender || null,
          address: editForm.address || null,
          payrollNumber: editForm.payrollNumber || null,
        },
      });
      if (res.error) {
        let message = res.error.message;
        try { const body = await res.error.context?.json(); message = body?.error || message; } catch { /* use client message */ }
        throw new Error(message);
      }
      if (!res.data.success) throw new Error(res.data.error);
      logAuditEvent({ action: "UPDATE_PROFILE", module: "user_management", details: { target_user_id: selectedUser.user_id, target_email: selectedUser.email } });
      toast({ title: "Profile updated", description: res.data.message });
      setEditDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  const openPasswordDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = async () => {
    if (!selectedUser) return;
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" });
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "change_password", userId: selectedUser.user_id, newPassword },
      });
      if (res.error) throw res.error;
      if (!res.data.success) throw new Error(res.data.error);
      toast({ title: "Password changed", description: `Password updated for ${selectedUser.full_name}` });
      setPasswordDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSuspendToggle = async (user: UserWithRoles) => {
    const isSuspended = user.status === "suspended";
    setSuspendLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: isSuspended ? "unsuspend" : "suspend", userId: user.user_id },
      });
      if (res.error) throw res.error;
      if (!res.data.success) throw new Error(res.data.error);
      toast({ title: isSuspended ? "User unsuspended" : "User suspended", description: res.data.message });
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } finally {
      setSuspendLoading(false);
    }
  };

  const openDeleteDialog = (user: UserWithRoles) => {
    setSelectedUser(user);
    setDeleteConfirmEmail("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || deleteConfirmEmail !== selectedUser.email) {
      toast({ title: "Email mismatch", description: "Type the user's email to confirm", variant: "destructive" });
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "delete", userId: selectedUser.user_id },
      });
      if (res.error) {
        let message = res.error.message;
        try { const body = await res.error.context?.json(); message = body?.error || message; } catch { /* use client message */ }
        throw new Error(message);
      }
      if (!res.data.success) throw new Error(res.data.error);
      toast({ title: "User deleted", description: `${selectedUser.full_name} has been permanently removed.` });
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter);
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const userPages = usePaged(filteredUsers, { resetKey: `${searchQuery}|${roleFilter}|${statusFilter}` });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive";
      case "admin": return "default";
      case "doctor": return "secondary";
      default: return "outline";
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "suspended") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Suspended</Badge>;
    return <Badge variant="outline" className="gap-1 text-green-700 border-green-300"><CheckCircle className="h-3 w-3" />Active</Badge>;
  };

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user accounts, roles, and access control</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" />Add User</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new staff member. They'll receive a welcome email with login credentials.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="user@cuea.edu" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label>Full Name *</Label><Input placeholder="John Doe" value={newUserFullName} onChange={(e) => setNewUserFullName(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Phone</Label><Input placeholder="+254..." value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>{departments.map((dept) => (<SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Roles *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {ALL_ROLES.map((role) => (
                    <div key={role.value} className="flex items-center space-x-2">
                      <Checkbox id={`new-role-${role.value}`} checked={newUserRoles.includes(role.value)} onCheckedChange={(checked) => {
                        if (checked) setNewUserRoles([...newUserRoles, role.value]);
                        else setNewUserRoles(newUserRoles.filter((r) => r !== role.value));
                      }} />
                      <Label htmlFor={`new-role-${role.value}`} className="text-sm font-normal">{role.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateUser} disabled={creatingUser}>
                {creatingUser ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create User"}
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
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
          <CardDescription>{users.length} total users in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Filter by role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ALL_ROLES.map((role) => (<SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Payroll No</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                  ) : (
                    userPages.pageItems.map((user) => (
                      <TableRow key={user.user_id} className={user.status === "suspended" ? "opacity-60" : ""}>
                        <TableCell>
                          <p className="font-medium">{user.full_name || "No name"}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{user.payroll_number || "—"}</TableCell>
                        <TableCell>{getStatusBadge(user.status || "active")}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles?.filter(Boolean).map((role) => (
                              <Badge key={role} variant={getRoleBadgeVariant(role)} className="text-xs">{role?.replace("_", " ") ?? "unknown"}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.last_login_at ? format(new Date(user.last_login_at), "MMM d, h:mm a") : "Never"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                <Pencil className="mr-2 h-4 w-4" />Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openRolesDialog(user)}>
                                <Shield className="mr-2 h-4 w-4" />Manage Roles
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                                <KeyRound className="mr-2 h-4 w-4" />Change Password
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={user.user_id === currentUser?.id} onClick={() => void loginAs(user)}>
                                <Eye className="mr-2 h-4 w-4" />Login As
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleSuspendToggle(user)} disabled={suspendLoading}>
                                <Ban className="mr-2 h-4 w-4" />
                                {user.status === "suspended" ? "Unsuspend User" : "Suspend User"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => openDeleteDialog(user)}>
                                <Trash2 className="mr-2 h-4 w-4" />Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <Pager pager={userPages} label="users" className="px-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roles Dialog */}
      <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Roles</DialogTitle>
            <DialogDescription>Update roles for {selectedUser?.full_name || selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {ALL_ROLES.map((role) => (
                <div key={role.value} className="flex items-center space-x-2">
                  <Checkbox id={`update-role-${role.value}`} checked={userRolesToUpdate.includes(role.value)} onCheckedChange={(checked) => {
                    if (checked) setUserRolesToUpdate([...userRolesToUpdate, role.value]);
                    else setUserRolesToUpdate(userRolesToUpdate.filter((r) => r !== role.value));
                  }} />
                  <Label htmlFor={`update-role-${role.value}`} className="text-sm font-normal">{role.label}</Label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRoles} disabled={updatingRoles}>
              {updatingRoles ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : "Save Roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update profile for {selectedUser?.full_name || selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Full Name</Label><Input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={editForm.gender} onValueChange={(v) => setEditForm({ ...editForm, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Payroll Number</Label><Input value={editForm.payrollNumber} onChange={(e) => setEditForm({ ...editForm, payrollNumber: e.target.value })} placeholder="e.g., PAY-001" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditProfile} disabled={editLoading}>
              {editLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Set a new password for {selectedUser?.full_name || selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleChangePassword} disabled={passwordLoading || !newPassword}>
              {passwordLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Changing...</> : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete <strong>{selectedUser?.full_name}</strong>'s account, profile, and all associated data.
              <br /><br />
              Type <strong>{selectedUser?.email}</strong> to confirm:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deleteConfirmEmail} onChange={(e) => setDeleteConfirmEmail(e.target.value)} placeholder="Type email to confirm" className="my-2" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteUser}
              disabled={deleteLoading || deleteConfirmEmail !== selectedUser?.email}
            >
              {deleteLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUserManagement;
