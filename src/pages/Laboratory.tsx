import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TestTube, Plus } from "lucide-react";

const Laboratory = () => {
  const { toast } = useToast();
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [testsCatalog, setTestsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLabOrders();
    fetchTestsCatalog();
  }, []);

  const fetchLabOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lab_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      const ordersWithDetails = await Promise.all(
        data.map(async (order) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", order.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient?.user_id)
            .single();

          const { data: test } = await supabase
            .from("lab_tests_catalog")
            .select("test_name, test_code, normal_range")
            .eq("id", order.test_id)
            .single();

          return { ...order, patient: { ...patient, profile }, test };
        })
      );
      setLabOrders(ordersWithDetails);
    }
    setLoading(false);
  };

  const fetchTestsCatalog = async () => {
    const { data } = await supabase
      .from("lab_tests_catalog")
      .select("*")
      .order("test_name");
    setTestsCatalog(data || []);
  };

  const handleUpdateResult = async (orderId: string, resultValue: string, resultNotes: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", user.id)
      .single();

    const { error } = await supabase
      .from("lab_orders")
      .update({
        status: "completed",
        result_value: resultValue,
        result_notes: resultNotes,
        result_entered_by: staff?.id,
        result_entered_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      toast({
        title: "Error updating result",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Result saved",
        description: "Lab result has been recorded successfully",
      });
      fetchLabOrders();
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-status-pending",
      collected: "bg-warning",
      in_progress: "bg-status-in-progress",
      completed: "bg-status-completed",
    };
    return colors[status] || "bg-muted";
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Laboratory</h1>
          <p className="text-muted-foreground mt-1">
            Manage lab orders and results
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {labOrders.filter(o => o.status === "pending").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {labOrders.filter(o => o.status === "in_progress").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {labOrders.filter(o => {
                if (o.status !== "completed") return false;
                const today = new Date().toISOString().split('T')[0];
                return o.result_entered_at?.startsWith(today);
              }).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Lab Orders
          </CardTitle>
          <CardDescription>Process test orders and enter results</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading orders...</p>
          ) : labOrders.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No lab orders yet</p>
          ) : (
            <div className="space-y-4">
              {labOrders.map((order) => (
                <LabOrderCard
                  key={order.id}
                  order={order}
                  onUpdateResult={handleUpdateResult}
                  getStatusColor={getStatusColor}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const LabOrderCard = ({ order, onUpdateResult, getStatusColor }: any) => {
  const [resultValue, setResultValue] = useState(order.result_value || "");
  const [resultNotes, setResultNotes] = useState(order.result_notes || "");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = () => {
    onUpdateResult(order.id, resultValue, resultNotes);
    setDialogOpen(false);
  };

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{order.patient?.profile?.full_name}</p>
          <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
        </div>
        <Badge className={getStatusColor(order.status)}>
          {order.status}
        </Badge>
      </div>

      <div className="space-y-1 text-sm">
        <p><strong>Test:</strong> {order.test?.test_name} ({order.test?.test_code})</p>
        {order.test?.normal_range && (
          <p><strong>Normal Range:</strong> {order.test?.normal_range}</p>
        )}
        <p><strong>Ordered:</strong> {new Date(order.created_at).toLocaleString()}</p>
      </div>

      {order.status === "completed" ? (
        <div className="space-y-1 p-3 bg-muted rounded-lg text-sm">
          <p><strong>Result:</strong> {order.result_value}</p>
          {order.result_notes && <p><strong>Notes:</strong> {order.result_notes}</p>}
          <p className="text-muted-foreground">
            Completed: {new Date(order.result_entered_at).toLocaleString()}
          </p>
        </div>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full">
              Enter Result
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Lab Result</DialogTitle>
              <DialogDescription>
                {order.test?.test_name} for {order.patient?.profile?.full_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {order.test?.normal_range && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <strong>Normal Range:</strong> {order.test?.normal_range}
                </div>
              )}

              <div className="space-y-2">
                <Label>Result Value *</Label>
                <Input
                  value={resultValue}
                  onChange={(e) => setResultValue(e.target.value)}
                  placeholder="e.g., 5.2 mmol/L"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={resultNotes}
                  onChange={(e) => setResultNotes(e.target.value)}
                  placeholder="Any additional observations..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!resultValue}>
                  Save Result
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Laboratory;
