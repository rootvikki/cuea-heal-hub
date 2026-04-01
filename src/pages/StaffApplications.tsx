import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Eye, Search, UserPlus } from "lucide-react";
import { format } from "date-fns";

interface StaffApplication {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  national_id: string | null;
  desired_role: string;
  specialization: string | null;
  license_number: string | null;
  years_of_experience: number | null;
  preferred_shift: string | null;
  notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const StaffApplications = () => {
  const { toast } = useToast();
  const { user } = useUser();
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<StaffApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_applications" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setApplications(data as unknown as StaffApplication[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchApplications(); }, []);

  const filtered = applications.filter(app => {
    const matchesSearch = app.full_name.toLowerCase().includes(search.toLowerCase()) ||
      app.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (app: StaffApplication) => {
    setActionLoading(true);
    try {
      // Call admin-create-user edge function
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: app.email,
          fullName: app.full_name,
          phone: app.phone,
          roles: [app.desired_role],
          adminUserId: user?.id,
        },
      });

      if (res.error || !res.data?.success) {
        throw new Error(res.data?.error || res.error?.message || "Failed to create user");
      }

      // Update application status
      await supabase
        .from("staff_applications" as any)
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
        .eq("id", app.id);

      toast({ title: "Application Approved", description: `${app.full_name} has been onboarded. Temporary password: ${res.data.tempPassword}` });
      setSelected(null);
      fetchApplications();
    } catch (error: any) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await supabase
        .from("staff_applications" as any)
        .update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), notes: rejectReason ? `REJECTED: ${rejectReason}` : selected.notes } as any)
        .eq("id", selected.id);

      toast({ title: "Application Rejected", description: `${selected.full_name}'s application has been rejected.` });
      setSelected(null);
      setShowRejectDialog(false);
      setRejectReason("");
      fetchApplications();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff Registrations</h1>
        <p className="text-muted-foreground">Review submitted staff details and onboard them into the system</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 h-12" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>No applications found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(app => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.full_name}</TableCell>
                    <TableCell>{app.email}</TableCell>
                    <TableCell className="capitalize">{app.desired_role.replace(/_/g, " ")}</TableCell>
                    <TableCell>{format(new Date(app.created_at), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{statusBadge(app.status)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(app)}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected && !showRejectDialog} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.full_name}</DialogTitle>
            <DialogDescription>Application submitted {selected && format(new Date(selected.created_at), "MMMM dd, yyyy 'at' h:mm a")}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{selected.email}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{selected.phone}</p></div>
                <div><span className="text-muted-foreground">National ID:</span><p className="font-medium">{selected.national_id || "—"}</p></div>
                <div><span className="text-muted-foreground">Desired Role:</span><p className="font-medium capitalize">{selected.desired_role.replace(/_/g, " ")}</p></div>
                <div><span className="text-muted-foreground">Specialization:</span><p className="font-medium">{selected.specialization || "—"}</p></div>
                <div><span className="text-muted-foreground">License #:</span><p className="font-medium">{selected.license_number || "—"}</p></div>
                <div><span className="text-muted-foreground">Experience:</span><p className="font-medium">{selected.years_of_experience != null ? `${selected.years_of_experience} years` : "—"}</p></div>
                <div><span className="text-muted-foreground">Preferred Shift:</span><p className="font-medium capitalize">{selected.preferred_shift?.replace(/_/g, " ") || "—"}</p></div>
              </div>
              {selected.notes && (
                <div><span className="text-sm text-muted-foreground">Notes:</span><p className="text-sm mt-1 bg-muted p-3 rounded-md">{selected.notes}</p></div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                {statusBadge(selected.status)}
              </div>
            </div>
          )}
          {selected?.status === "pending" && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)} disabled={actionLoading}>
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
              <Button onClick={() => handleApprove(selected)} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve & Onboard
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>Provide a reason for rejecting {selected?.full_name}'s application.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffApplications;
