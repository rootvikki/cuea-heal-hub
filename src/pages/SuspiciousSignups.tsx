import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert, Trash2, Ban, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { format } from "date-fns";

interface SuspiciousSignup {
  id: string;
  user_id: string | null;
  email: string;
  reason: string;
  detected_domain: string | null;
  signup_metadata: any;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

const STATUS_VARIANTS: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  pending: "destructive",
  reviewed: "secondary",
  dismissed: "outline",
  actioned: "default",
};

const SuspiciousSignups = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SuspiciousSignup[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SuspiciousSignup | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("suspicious_signups")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setItems(data as any);
    }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = items.filter((i) => {
    const matchesStatus = statusFilter === "all" || i.status === statusFilter;
    const matchesSearch = !search ||
      i.email.toLowerCase().includes(search.toLowerCase()) ||
      (i.detected_domain ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = items.filter(i => i.status === "pending").length;

  const updateStatus = async (id: string, status: string, notes?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("suspicious_signups")
      .update({
        status,
        review_notes: notes ?? null,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) throw error;
  };

  const handleDismiss = async (item: SuspiciousSignup) => {
    setActionLoading(true);
    try {
      await updateStatus(item.id, "dismissed", reviewNotes || "Reviewed and dismissed");
      logAuditEvent({
        action: "DISMISS_SUSPICIOUS_SIGNUP",
        module: "security",
        details: { suspicious_signup_id: item.id, email: item.email },
      });
      toast({ title: "Dismissed", description: `${item.email} marked as safe.` });
      setReviewOpen(false);
      setReviewNotes("");
      fetchItems();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handleSuspend = async (item: SuspiciousSignup) => {
    if (!item.user_id) {
      toast({ title: "No user account", description: "This signup has no linked auth user.", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "suspend", userId: item.user_id },
      });
      if (res.error) throw res.error;
      if (!res.data.success) throw new Error(res.data.error);
      await updateStatus(item.id, "actioned", reviewNotes || "User account suspended");
      logAuditEvent({
        action: "SUSPEND_SUSPICIOUS_USER",
        module: "security",
        details: { suspicious_signup_id: item.id, email: item.email, user_id: item.user_id },
      });
      toast({ title: "User suspended", description: `${item.email} has been suspended.` });
      setReviewOpen(false);
      setReviewNotes("");
      fetchItems();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (deleteConfirm !== selected.email) {
      toast({ title: "Email mismatch", description: "Type the user's email to confirm.", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      if (selected.user_id) {
        const res = await supabase.functions.invoke("admin-manage-user", {
          body: { action: "delete", userId: selected.user_id },
        });
        if (res.error) throw res.error;
        if (!res.data.success) throw new Error(res.data.error);
      }
      await updateStatus(selected.id, "actioned", reviewNotes || "User account permanently deleted");
      logAuditEvent({
        action: "DELETE_SUSPICIOUS_USER",
        module: "security",
        details: { suspicious_signup_id: selected.id, email: selected.email, user_id: selected.user_id },
      });
      toast({ title: "User deleted", description: `${selected.email} permanently removed.` });
      setDeleteOpen(false);
      setReviewOpen(false);
      setDeleteConfirm("");
      setReviewNotes("");
      fetchItems();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const openReview = (item: SuspiciousSignup) => {
    setSelected(item);
    setReviewNotes(item.review_notes || "");
    setReviewOpen(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-destructive" /> Suspicious Signups
          </h1>
          <p className="text-muted-foreground">
            Review and act on flagged user accounts (disposable emails, anomalous registrations).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> {pendingCount} pending
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Flagged Accounts</CardTitle>
          <CardDescription>
            Accounts created using disposable email domains or showing other anomalies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Search email or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="actioned">Actioned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-600" />
              No suspicious signups in this view.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.email}</TableCell>
                      <TableCell className="font-mono text-xs">{item.detected_domain || "—"}</TableCell>
                      <TableCell className="text-sm max-w-xs">{item.reason}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[item.status] || "outline"} className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openReview(item)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Flagged Signup</DialogTitle>
            <DialogDescription>{selected?.email}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-muted-foreground">Domain</Label><p className="font-mono">{selected.detected_domain || "—"}</p></div>
                <div><Label className="text-muted-foreground">Status</Label><p className="capitalize">{selected.status}</p></div>
                <div className="col-span-2"><Label className="text-muted-foreground">Reason</Label><p>{selected.reason}</p></div>
                <div className="col-span-2"><Label className="text-muted-foreground">User account</Label><p className="font-mono text-xs">{selected.user_id || "Not yet linked"}</p></div>
              </div>
              <div className="space-y-2">
                <Label>Review notes</Label>
                <Textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Document your decision..."
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button
              variant="secondary"
              onClick={() => selected && handleDismiss(selected)}
              disabled={actionLoading}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Safe
            </Button>
            <Button
              variant="default"
              onClick={() => selected && handleSuspend(selected)}
              disabled={actionLoading || !selected?.user_id}
            >
              <Ban className="mr-2 h-4 w-4" /> Suspend Account
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setDeleteOpen(true); setDeleteConfirm(""); }}
              disabled={actionLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{selected?.email}</strong>'s account, profile, and any associated data. This cannot be undone.
              <br /><br />
              Type <strong>{selected?.email}</strong> to confirm:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Type email to confirm"
            className="my-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={actionLoading || deleteConfirm !== selected?.email}
            >
              {actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuspiciousSignups;
