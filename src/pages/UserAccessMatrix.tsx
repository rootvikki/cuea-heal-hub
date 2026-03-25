import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/auditLog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Shield, Loader2, Info, Grid3X3, Users } from "lucide-react";

type AppRole = "admin" | "doctor" | "nurse" | "receptionist" | "lab_technician" | "pharmacist" | "finance_officer" | "patient" | "super_admin" | "system_admin" | "radiologist" | "cashier" | "accountant" | "hr_admin" | "auditor" | "clinical_officer" | "records_officer" | "ward_manager";

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  roles: string[];
  created_at: string;
  payroll_number: string;
}

interface PendingToggle {
  userId: string;
  userName: string;
  role: string;
  hasRole: boolean;
}

const ROLE_GROUPS = [
  { label: "Administration", roles: ["super_admin", "system_admin", "admin", "hr_admin"] },
  { label: "Clinical", roles: ["doctor", "clinical_officer", "nurse", "ward_manager"] },
  { label: "Diagnostics", roles: ["lab_technician", "radiologist"] },
  { label: "Support Services", roles: ["receptionist", "pharmacist"] },
  { label: "Finance", roles: ["finance_officer", "cashier", "accountant"] },
  { label: "Records & Audit", roles: ["records_officer", "auditor"] },
  { label: "Patient", roles: ["patient"] },
];

const ROLE_META: Record<string, { label: string; short: string; color: string; description: string }> = {
  super_admin: { label: "Super Admin", short: "SA", color: "bg-red-500", description: "Full system access, can manage all users, roles, and settings" },
  system_admin: { label: "Sys Admin", short: "SYS", color: "bg-orange-500", description: "System configuration and technical settings" },
  admin: { label: "Admin", short: "ADM", color: "bg-amber-500", description: "Administrative access to user and staff management" },
  hr_admin: { label: "HR Admin", short: "HR", color: "bg-yellow-500", description: "Human resources, staff onboarding and payroll" },
  doctor: { label: "Doctor", short: "DR", color: "bg-blue-500", description: "Consultations, prescriptions, lab/imaging orders, records" },
  clinical_officer: { label: "Clin. Officer", short: "CO", color: "bg-cyan-500", description: "Clinical consultations and patient care" },
  nurse: { label: "Nurse", short: "NUR", color: "bg-teal-500", description: "Triage, vitals, nursing procedures, inpatient care" },
  ward_manager: { label: "Ward Mgr", short: "WM", color: "bg-emerald-500", description: "Inpatient ward and bed management" },
  lab_technician: { label: "Lab Tech", short: "LAB", color: "bg-violet-500", description: "Process lab orders and enter results" },
  radiologist: { label: "Radiologist", short: "RAD", color: "bg-purple-500", description: "Imaging orders, reports, and diagnostics" },
  receptionist: { label: "Reception", short: "REC", color: "bg-green-500", description: "Patient registration, check-in, appointments, queue" },
  pharmacist: { label: "Pharmacist", short: "PH", color: "bg-pink-500", description: "Dispense medications, manage pharmacy inventory" },
  finance_officer: { label: "Finance", short: "FIN", color: "bg-rose-500", description: "Billing, invoices, payments, insurance claims" },
  cashier: { label: "Cashier", short: "CSH", color: "bg-fuchsia-500", description: "Process payments and issue receipts" },
  accountant: { label: "Accountant", short: "ACC", color: "bg-indigo-500", description: "Financial reports and reconciliation" },
  records_officer: { label: "Records", short: "REC", color: "bg-sky-500", description: "Medical records management and archiving" },
  auditor: { label: "Auditor", short: "AUD", color: "bg-slate-500", description: "Audit logs review and compliance monitoring" },
  patient: { label: "Patient", short: "PAT", color: "bg-gray-500", description: "Patient portal access only" },
};

const MODULE_ACCESS: Record<string, string[]> = {
  "Dashboard": ["all"],
  "Reception": ["receptionist", "admin", "super_admin"],
  "Patients": ["doctor", "nurse", "clinical_officer", "receptionist", "finance_officer", "admin", "super_admin"],
  "Appointments": ["doctor", "nurse", "clinical_officer", "receptionist", "admin", "super_admin"],
  "Queue": ["doctor", "nurse", "clinical_officer", "receptionist", "admin", "super_admin"],
  "Consultation": ["doctor", "clinical_officer", "admin", "super_admin"],
  "Nursing/Triage": ["nurse", "doctor", "clinical_officer", "admin", "super_admin"],
  "Dental": ["doctor", "clinical_officer", "admin", "super_admin"],
  "Medical Records": ["doctor", "clinical_officer", "records_officer", "admin", "super_admin"],
  "Laboratory": ["lab_technician", "doctor", "admin", "super_admin"],
  "Imaging": ["radiologist", "doctor", "admin", "super_admin"],
  "Pharmacy": ["pharmacist", "doctor", "admin", "super_admin"],
  "Billing": ["finance_officer", "cashier", "admin", "super_admin"],
  "Insurance": ["finance_officer", "cashier", "receptionist", "admin", "super_admin"],
  "Inpatient": ["doctor", "nurse", "clinical_officer", "ward_manager", "admin", "super_admin"],
  "Staff Management": ["admin", "super_admin", "hr_admin"],
  "User Management": ["admin", "super_admin"],
  "Role Management": ["super_admin"],
  "Audit Logs": ["super_admin", "auditor"],
  "Reports": ["admin", "super_admin", "finance_officer"],
  "Settings": ["admin", "super_admin", "system_admin"],
  "Patient Portal": ["patient"],
};

const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles);
const STAFF_ROLES = ["doctor", "nurse", "lab_technician", "pharmacist", "receptionist", "finance_officer", "admin", "super_admin", "system_admin", "radiologist", "cashier", "accountant", "hr_admin", "auditor", "clinical_officer", "records_officer", "ward_manager"];

export default function UserAccessMatrix() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"roles" | "modules">("roles");

  // Confirmation dialog state
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);

  // Bulk assignment state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<string>("");
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_all_users_with_roles");
      if (error) throw error;
      setUsers((data || []) as UserWithRoles[]);
    } catch (error: any) {
      toast({ title: "Error fetching users", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    let filtered = [...users];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.payroll_number?.toLowerCase().includes(q)
      );
    }
    if (filterRole !== "all") {
      filtered = filtered.filter(u => u.roles?.includes(filterRole));
    }
    setFilteredUsers(filtered);
  }, [users, searchQuery, filterRole]);

  const handleToggleClick = (userId: string, role: string, hasRole: boolean) => {
    const user = users.find(u => u.user_id === userId);
    setPendingToggle({
      userId,
      userName: user?.full_name || user?.email || "Unknown",
      role,
      hasRole,
    });
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    const { userId, role, hasRole } = pendingToggle;
    setPendingToggle(null);

    const cellKey = `${userId}-${role}`;
    setTogglingCell(cellKey);

    try {
      if (hasRole) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role as AppRole);
        if (error) throw error;

        setUsers(prev => prev.map(u =>
          u.user_id === userId ? { ...u, roles: u.roles.filter(r => r !== role) } : u
        ));

        await logAuditEvent({
          action: "role_removed",
          module: "Access Matrix",
          details: { target_user_id: userId, role, target_user_name: pendingToggle.userName },
        });

        toast({ title: "Role removed", description: `${ROLE_META[role]?.label} removed successfully` });
      } else {
        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: role as AppRole,
        });

        if (error) {
          if (error.code === "23505") {
            toast({ title: "Already assigned", description: "This role is already assigned.", variant: "destructive" });
            return;
          }
          throw error;
        }

        if (STAFF_ROLES.includes(role)) {
          const staffNumber = `STAFF-${Date.now().toString().slice(-6)}`;
          await supabase.from("staff").upsert({
            user_id: userId,
            staff_id: staffNumber,
            department_id: null,
          }, { onConflict: "user_id", ignoreDuplicates: true });
        }

        setUsers(prev => prev.map(u =>
          u.user_id === userId ? { ...u, roles: [...(u.roles || []), role] } : u
        ));

        await logAuditEvent({
          action: "role_assigned",
          module: "Access Matrix",
          details: { target_user_id: userId, role, target_user_name: pendingToggle.userName },
        });

        toast({ title: "Role assigned", description: `${ROLE_META[role]?.label} assigned successfully` });
      }
    } catch (error: any) {
      toast({ title: "Error updating role", description: error.message, variant: "destructive" });
    } finally {
      setTogglingCell(null);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.user_id)));
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkRole || selectedUsers.size === 0) return;
    setIsBulkAssigning(true);

    let successCount = 0;
    let skipCount = 0;

    try {
      for (const userId of selectedUsers) {
        const user = users.find(u => u.user_id === userId);
        if (user?.roles?.includes(bulkRole)) {
          skipCount++;
          continue;
        }

        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: bulkRole as AppRole,
        });

        if (error) {
          if (error.code === "23505") { skipCount++; continue; }
          throw error;
        }

        if (STAFF_ROLES.includes(bulkRole)) {
          const staffNumber = `STAFF-${Date.now().toString().slice(-6)}`;
          await supabase.from("staff").upsert({
            user_id: userId,
            staff_id: staffNumber,
            department_id: null,
          }, { onConflict: "user_id", ignoreDuplicates: true });
        }

        successCount++;
      }

      await logAuditEvent({
        action: "bulk_role_assigned",
        module: "Access Matrix",
        details: { role: bulkRole, users_count: successCount, skipped: skipCount },
      });

      toast({
        title: "Bulk assignment complete",
        description: `${ROLE_META[bulkRole]?.label} assigned to ${successCount} user(s). ${skipCount} skipped (already had role).`,
      });

      setSelectedUsers(new Set());
      setBulkDialogOpen(false);
      setBulkRole("");
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Bulk assignment error", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkAssigning(false);
    }
  };

  const getRoleCount = (role: string) => users.filter(u => u.roles?.includes(role)).length;

  const roleHasModuleAccess = (role: string, module: string) => {
    const allowedRoles = MODULE_ACCESS[module];
    if (!allowedRoles) return false;
    return allowedRoles.includes("all") || allowedRoles.includes(role) || role === "super_admin" || role === "admin";
  };

  return (
    <div className="space-y-6">
      {/* Confirmation Dialog */}
      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.hasRole ? "Remove Role" : "Assign Role"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to <strong>{pendingToggle?.hasRole ? "remove" : "assign"}</strong> the{" "}
              <strong>{ROLE_META[pendingToggle?.role || ""]?.label}</strong> role{" "}
              {pendingToggle?.hasRole ? "from" : "to"}{" "}
              <strong>{pendingToggle?.userName}</strong>?
              {!pendingToggle?.hasRole && " This will grant them access to the associated modules immediately."}
              {pendingToggle?.hasRole && " They will lose access to the associated modules immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle}>
              {pendingToggle?.hasRole ? "Remove Role" : "Assign Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Assign Dialog */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Assign Role</AlertDialogTitle>
            <AlertDialogDescription>
              Assign a role to {selectedUsers.size} selected user(s). Users who already have the role will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={bulkRole} onValueChange={setBulkRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role to assign" />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(role => (
                  <SelectItem key={role} value={role}>{ROLE_META[role]?.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkAssigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAssign} disabled={!bulkRole || isBulkAssigning}>
              {isBulkAssigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign to {selectedUsers.size} user(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Grid3X3 className="h-8 w-8" />
          User Access Matrix
        </h1>
        <p className="text-muted-foreground mt-1">
          Toggle checkboxes to assign or remove roles. Changes take effect immediately.
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or payroll number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full md:w-[220px] h-12">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users ({users.length})</SelectItem>
                {ALL_ROLES.map(role => (
                  <SelectItem key={role} value={role}>
                    {ROLE_META[role]?.label} ({getRoleCount(role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as "roles" | "modules")}>
              <SelectTrigger className="w-full md:w-[200px] h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roles">Role Assignment</SelectItem>
                <SelectItem value="modules">Module Access View</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Bulk action toolbar */}
          {viewMode === "roles" && selectedUsers.size > 0 && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{selectedUsers.size} user(s) selected</span>
              <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                Bulk Assign Role
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUsers(new Set())}>
                Clear Selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {ROLE_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground">{group.label}:</span>
                {group.roles.map(role => (
                  <Tooltip key={role}>
                    <TooltipTrigger asChild>
                      <Badge className={`${ROLE_META[role].color} text-white text-[10px] px-1.5 py-0 cursor-help`}>
                        {ROLE_META[role].short}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-semibold">{ROLE_META[role].label}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_META[role].description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Matrix */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "roles" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role Assignment Matrix ({filteredUsers.length} users × {ALL_ROLES.length} roles)
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Click any checkbox to toggle a role. Use row checkboxes for bulk assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[1200px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="sticky left-0 bg-muted/30 z-20 p-2 w-[280px] min-w-[280px]" />
                      {ROLE_GROUPS.map(group => (
                        <th key={group.label} colSpan={group.roles.length} className="p-1.5 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider border-l border-border">
                          {group.label}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b bg-muted/50">
                      <th className="sticky left-0 bg-muted/50 z-20 p-2 text-left font-semibold w-[280px] min-w-[280px]">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={filteredUsers.length > 0 && selectedUsers.size === filteredUsers.length}
                            onCheckedChange={toggleSelectAll}
                          />
                          <span>User</span>
                        </div>
                      </th>
                      {ROLE_GROUPS.flatMap(group =>
                        group.roles.map((role, i) => (
                          <th key={role} className={`p-1.5 text-center w-[56px] min-w-[56px] ${i === 0 ? 'border-l border-border' : ''}`}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-center gap-0.5 cursor-help">
                                  <div className={`w-2.5 h-2.5 rounded-full ${ROLE_META[role].color}`} />
                                  <span className="text-[10px] font-bold leading-tight">{ROLE_META[role].short}</span>
                                  <span className="text-[9px] text-muted-foreground">({getRoleCount(role)})</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-semibold">{ROLE_META[role].label}</p>
                                <p className="text-xs">{ROLE_META[role].description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={ALL_ROLES.length + 1} className="p-8 text-center text-muted-foreground">
                          No users found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user, idx) => {
                        const userRoleSet = new Set(user.roles || []);
                        const isSelected = selectedUsers.has(user.user_id);
                        return (
                          <tr
                            key={user.user_id}
                            className={`border-b hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                          >
                            <td className="sticky left-0 z-10 p-2 bg-inherit border-r border-border w-[280px] min-w-[280px]">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleUserSelection(user.user_id)}
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm truncate max-w-[220px]">
                                    {user.full_name || "—"}
                                  </span>
                                  <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                                    {user.email}
                                  </span>
                                  {user.payroll_number && (
                                    <span className="text-[10px] text-muted-foreground/70">{user.payroll_number}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {ROLE_GROUPS.flatMap(group =>
                              group.roles.map((role, i) => {
                                const hasRole = userRoleSet.has(role);
                                const cellKey = `${user.user_id}-${role}`;
                                const isToggling = togglingCell === cellKey;
                                return (
                                  <td key={role} className={`p-1.5 text-center ${i === 0 ? 'border-l border-border' : ''} ${hasRole ? 'bg-primary/5' : ''}`}>
                                    {isToggling ? (
                                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                                    ) : (
                                      <Checkbox
                                        checked={hasRole}
                                        onCheckedChange={() => handleToggleClick(user.user_id, role, hasRole)}
                                        className={`mx-auto ${hasRole ? 'data-[state=checked]:bg-primary data-[state=checked]:border-primary' : ''}`}
                                      />
                                    )}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Module Access Overview
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Shows which modules each role can access. Green = access granted.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="sticky left-0 bg-muted/50 z-20 p-3 text-left font-semibold w-[180px] min-w-[180px]">
                        Module
                      </th>
                      {ALL_ROLES.map(role => (
                        <th key={role} className="p-2 text-center w-[52px] min-w-[52px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center gap-0.5 cursor-help">
                                <div className={`w-2.5 h-2.5 rounded-full ${ROLE_META[role].color}`} />
                                <span className="text-[10px] font-bold">{ROLE_META[role].short}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-semibold">{ROLE_META[role].label}</p>
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(MODULE_ACCESS).map(([module, allowedRoles], idx) => (
                      <tr key={module} className={`border-b ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                        <td className="sticky left-0 z-10 p-3 font-medium bg-inherit border-r border-border">
                          {module}
                        </td>
                        {ALL_ROLES.map(role => {
                          const hasAccess = roleHasModuleAccess(role, module);
                          return (
                            <td key={role} className={`p-2 text-center ${hasAccess ? 'bg-green-500/10' : ''}`}>
                              {hasAccess ? (
                                <div className="w-5 h-5 rounded-full bg-green-500 mx-auto flex items-center justify-center">
                                  <span className="text-white text-[10px] font-bold">✓</span>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-muted mx-auto flex items-center justify-center">
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
