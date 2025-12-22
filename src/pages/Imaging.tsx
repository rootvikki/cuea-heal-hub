import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Camera, Search, FileImage, Clock, CheckCircle, AlertCircle, Upload } from "lucide-react";

interface ImagingOrder {
  id: string;
  patient_id: string;
  encounter_id: string;
  imaging_id: string;
  status: string;
  priority: string;
  clinical_indication: string;
  scheduled_at: string | null;
  findings: string | null;
  impression: string | null;
  created_at: string;
  imaging_catalog?: {
    modality: string;
    name: string;
    body_part: string;
    preparation_instructions: string;
  };
  patient?: {
    patient_id: string;
    profiles?: {
      full_name: string;
      phone: string;
    };
  };
}

interface ImagingCatalog {
  id: string;
  modality: string;
  name: string;
  body_part: string;
  price: number;
  preparation_instructions: string;
  turnaround_hours: number;
}

const Imaging = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<ImagingOrder[]>([]);
  const [catalog, setCatalog] = useState<ImagingCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<ImagingOrder | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");

  useEffect(() => {
    fetchOrders();
    fetchCatalog();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("imaging_orders")
        .select(`
          *,
          imaging_catalog (modality, name, body_part, preparation_instructions)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch patient info separately
      const ordersWithPatients = await Promise.all(
        (data || []).map(async (order) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", order.patient_id)
            .single();

          let profile = null;
          if (patient) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, phone")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          return {
            ...order,
            patient: patient ? { ...patient, profiles: profile } : null,
          };
        })
      );

      setOrders(ordersWithPatients);
    } catch (error) {
      console.error("Error fetching imaging orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from("imaging_catalog")
        .select("*")
        .eq("active", true)
        .order("modality", { ascending: true });

      if (error) throw error;
      setCatalog(data || []);
    } catch (error) {
      console.error("Error fetching imaging catalog:", error);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const updates: Record<string, unknown> = { status };
      
      if (status === "in_progress") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.performed_by = user?.id;
        updates.performed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("imaging_orders")
        .update(updates)
        .eq("id", orderId);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Order status changed to ${status}`,
      });

      fetchOrders();
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    }
  };

  const submitResults = async () => {
    if (!selectedOrder) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("imaging_orders")
        .update({
          status: "completed",
          findings,
          impression,
          reported_by: user?.id,
          reported_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      toast({
        title: "Results Submitted",
        description: "Imaging results have been recorded",
      });

      setResultDialogOpen(false);
      setFindings("");
      setImpression("");
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      console.error("Error submitting results:", error);
      toast({
        title: "Error",
        description: "Failed to submit results",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "scheduled": return "bg-blue-100 text-blue-800";
      case "in_progress": return "bg-purple-100 text-purple-800";
      case "completed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "stat": return "bg-red-100 text-red-800";
      case "urgent": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.patient?.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.patient?.patient_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.imaging_catalog?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingOrders = filteredOrders.filter((o) => o.status === "pending" || o.status === "scheduled");
  const inProgressOrders = filteredOrders.filter((o) => o.status === "in_progress");
  const completedOrders = filteredOrders.filter((o) => o.status === "completed");

  const groupedCatalog = catalog.reduce((acc, item) => {
    if (!acc[item.modality]) acc[item.modality] = [];
    acc[item.modality].push(item);
    return acc;
  }, {} as Record<string, ImagingCatalog[]>);

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
          <h1 className="text-3xl font-bold">Imaging & Radiology</h1>
          <p className="text-muted-foreground">Manage imaging orders and results</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{pendingOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100">
              <Camera className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold">{inProgressOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed Today</p>
              <p className="text-2xl font-bold">
                {completedOrders.filter(
                  (o) => new Date(o.created_at).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Urgent/STAT</p>
              <p className="text-2xl font-bold">
                {orders.filter((o) => (o.priority === "stat" || o.priority === "urgent") && o.status !== "completed").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="worklist" className="space-y-4">
        <TabsList>
          <TabsTrigger value="worklist">Worklist</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="catalog">Services Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="worklist">
          <Card>
            <CardHeader>
              <CardTitle>Active Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingOrders.length === 0 && inProgressOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending imaging orders</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Clinical Indication</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...pendingOrders, ...inProgressOrders].map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.patient?.profiles?.full_name || "Unknown"}</p>
                            <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.imaging_catalog?.name}</p>
                            <p className="text-sm text-muted-foreground">{order.imaging_catalog?.modality}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(order.priority)}>
                            {order.priority.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {order.clinical_indication || "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(order.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {order.status === "pending" && (
                              <Button
                                size="sm"
                                onClick={() => updateOrderStatus(order.id, "in_progress")}
                              >
                                Start
                              </Button>
                            )}
                            {order.status === "in_progress" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setResultDialogOpen(true);
                                }}
                              >
                                Enter Results
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Studies</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Study</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead>Impression</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.patient?.profiles?.full_name || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.imaging_catalog?.name}</p>
                          <p className="text-sm text-muted-foreground">{order.imaging_catalog?.modality}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(order.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate">{order.findings || "-"}</p>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate">{order.impression || "-"}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog">
          <div className="grid gap-6">
            {Object.entries(groupedCatalog).map(([modality, items]) => (
              <Card key={modality}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    {modality}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Study Name</TableHead>
                        <TableHead>Body Part</TableHead>
                        <TableHead>Price (KES)</TableHead>
                        <TableHead>Turnaround</TableHead>
                        <TableHead>Preparation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.body_part}</TableCell>
                          <TableCell>{item.price.toLocaleString()}</TableCell>
                          <TableCell>{item.turnaround_hours}h</TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground truncate">
                            {item.preparation_instructions}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Result Entry Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enter Imaging Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-medium">{selectedOrder?.patient?.profiles?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedOrder?.imaging_catalog?.modality} - {selectedOrder?.imaging_catalog?.name}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Findings</Label>
              <Textarea
                placeholder="Describe the imaging findings..."
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Impression/Conclusion</Label>
              <Textarea
                placeholder="Provide the overall impression..."
                value={impression}
                onChange={(e) => setImpression(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitResults} disabled={!findings || !impression}>
                Submit Results
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Imaging;
