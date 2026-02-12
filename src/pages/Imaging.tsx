import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueueTransition } from "@/hooks/useQueueTransition";
import { StationQueue } from "@/components/StationQueue";
import { Camera, Search, Clock, CheckCircle, AlertCircle, FileImage } from "lucide-react";
import { InterimPayment } from "@/components/InterimPayment";
import { logAuditEvent } from "@/lib/auditLog";

const Imaging = () => {
  const { toast } = useToast();
  const { getActiveTicket, onImagingComplete } = useQueueTransition();
  const [orders, setOrders] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchCatalog();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data } = await supabase.from("imaging_orders").select("*, imaging_catalog (modality, name, body_part, preparation_instructions)").order("created_at", { ascending: false });
      const ordersWithPatients = await Promise.all(
        (data || []).map(async (order) => {
          const { data: patient } = await supabase.from("patients").select("patient_id, user_id").eq("id", order.patient_id).single();
          let profile = null;
          if (patient) {
            const { data: p } = await supabase.from("profiles").select("full_name, phone").eq("user_id", patient.user_id).single();
            profile = p;
          }
          return { ...order, patient: patient ? { ...patient, profiles: profile } : null };
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
    const { data } = await supabase.from("imaging_catalog").select("*").eq("active", true).order("modality");
    setCatalog(data || []);
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "in_progress") {
      const { data: { user } } = await supabase.auth.getUser();
      updates.performed_by = user?.id;
      updates.performed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("imaging_orders").update(updates).eq("id", orderId);
    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    } else {
      toast({ title: "Updated", description: `Status changed to ${status}` });
      fetchOrders();
    }
  };

  const submitResults = async () => {
    if (!selectedOrder) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user?.id).single();

    const { error } = await supabase.from("imaging_orders").update({
      status: "completed", findings, impression,
      reported_by: staff?.id || user?.id,
      reported_at: new Date().toISOString(),
    }).eq("id", selectedOrder.id);

    if (error) {
      toast({ title: "Error", description: "Failed to submit results", variant: "destructive" });
    } else {
      toast({ title: "Results submitted", description: "Imaging results recorded" });
      logAuditEvent({ action: "imaging_result_submitted", module: "imaging", details: { order_id: selectedOrder.id, patient_id: selectedOrder.patient_id } });

      // Auto-advance: check if all imaging for this encounter complete
      const { data: pendingImaging } = await supabase
        .from("imaging_orders")
        .select("id")
        .eq("encounter_id", selectedOrder.encounter_id)
        .neq("status", "completed");

      if ((pendingImaging?.length || 0) === 0) {
        const ticket = await getActiveTicket(selectedOrder.patient_id);
        if (ticket && (ticket.status === "at_imaging" || ticket.workflow_stage === "at_imaging")) {
          await onImagingComplete({ ticketId: ticket.id, encounterId: selectedOrder.encounter_id });
        }
      }

      setResultDialogOpen(false);
      setFindings("");
      setImpression("");
      setSelectedOrder(null);
      fetchOrders();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "in_progress": return "bg-purple-100 text-purple-800";
      case "completed": return "bg-green-100 text-green-800";
      default: return "bg-muted";
    }
  };

  const filteredOrders = orders.filter(o =>
    o.patient?.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.patient?.patient_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.imaging_catalog?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingOrders = filteredOrders.filter(o => o.status !== "completed");
  const completedOrders = filteredOrders.filter(o => o.status === "completed");

  if (loading) {
    return <div className="p-6 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["at_imaging"]}
        nextStage="at_pharmacy"
        title="Imaging Queue"
        onSelectPatient={setSelectedTicket}
        selectedTicketId={selectedTicket?.id}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Imaging & Radiology</h1>
            <p className="text-muted-foreground">CUEA Radiology — manage orders and results</p>
          </div>
          <div className="flex gap-2 items-center">
            {selectedTicket && <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 w-64" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-yellow-100"><Clock className="h-6 w-6 text-yellow-600" /></div><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{pendingOrders.filter(o => o.status === "pending").length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-purple-100"><Camera className="h-6 w-6 text-purple-600" /></div><div><p className="text-sm text-muted-foreground">In Progress</p><p className="text-2xl font-bold">{pendingOrders.filter(o => o.status === "in_progress").length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-green-100"><CheckCircle className="h-6 w-6 text-green-600" /></div><div><p className="text-sm text-muted-foreground">Completed Today</p><p className="text-2xl font-bold">{completedOrders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-full bg-red-100"><AlertCircle className="h-6 w-6 text-red-600" /></div><div><p className="text-sm text-muted-foreground">Urgent/STAT</p><p className="text-2xl font-bold">{orders.filter(o => (o.priority === "stat" || o.priority === "urgent") && o.status !== "completed").length}</p></div></CardContent></Card>
        </div>

        <Tabs defaultValue="worklist" className="space-y-4">
          <TabsList>
            <TabsTrigger value="worklist">Worklist ({pendingOrders.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedOrders.length})</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>

          <TabsContent value="worklist">
            <Card>
              <CardContent className="pt-6">
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground"><FileImage className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No pending imaging orders</p></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Study</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Clinical Indication</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <p className="font-medium">{order.patient?.profiles?.full_name || "Unknown"}</p>
                            <p className="text-sm text-muted-foreground">{order.patient?.patient_id}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{order.imaging_catalog?.name}</p>
                            <p className="text-sm text-muted-foreground">{order.imaging_catalog?.modality}</p>
                          </TableCell>
                          <TableCell><Badge className={order.priority === "stat" ? "bg-red-100 text-red-800" : "bg-muted"}>{(order.priority || "routine").toUpperCase()}</Badge></TableCell>
                          <TableCell className="max-w-xs truncate">{order.clinical_indication || "-"}</TableCell>
                          <TableCell><Badge className={getStatusColor(order.status)}>{order.status}</Badge></TableCell>
                          <TableCell>
                            {order.status === "pending" && (
                              <Button size="sm" onClick={() => updateOrderStatus(order.id, "in_progress")}>Start</Button>
                            )}
                            {order.status === "in_progress" && (
                              <Button size="sm" onClick={() => { setSelectedOrder(order); setResultDialogOpen(true); }}>Enter Results</Button>
                            )}
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
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Study</TableHead>
                      <TableHead>Findings</TableHead>
                      <TableHead>Impression</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell><p className="font-medium">{order.patient?.profiles?.full_name}</p></TableCell>
                        <TableCell>{order.imaging_catalog?.name}</TableCell>
                        <TableCell className="max-w-xs truncate">{order.findings || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">{order.impression || "-"}</TableCell>
                        <TableCell>{order.reported_at ? new Date(order.reported_at).toLocaleString() : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalog">
            <div className="grid gap-6">
              {Object.entries(catalog.reduce((acc: Record<string, any[]>, item) => {
                if (!acc[item.modality]) acc[item.modality] = [];
                acc[item.modality].push(item);
                return acc;
              }, {})).map(([modality, items]) => (
                <Card key={modality}>
                  <CardHeader><CardTitle>{modality}</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Study</TableHead><TableHead>Body Part</TableHead><TableHead>Price (KES)</TableHead><TableHead>Turnaround</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {(items as any[]).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>{item.body_part || "-"}</TableCell>
                            <TableCell>{item.price}</TableCell>
                            <TableCell>{item.turnaround_hours ? `${item.turnaround_hours}h` : "-"}</TableCell>
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
      </div>

      {/* Results Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enter Radiology Results</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>Patient:</strong> {selectedOrder.patient?.profiles?.full_name}</p>
                <p><strong>Study:</strong> {selectedOrder.imaging_catalog?.name} ({selectedOrder.imaging_catalog?.modality})</p>
                <p><strong>Clinical Indication:</strong> {selectedOrder.clinical_indication || "Not specified"}</p>
              </div>
              <div className="space-y-2">
                <Label>Findings *</Label>
                <Textarea value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Describe radiological findings..." rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Impression *</Label>
                <Textarea value={impression} onChange={(e) => setImpression(e.target.value)} placeholder="Radiological impression / conclusion..." rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setResultDialogOpen(false)}>Cancel</Button>
                <Button variant="secondary" onClick={async () => {
                  if (!selectedOrder || !findings || !impression) return;
                  await submitResults();
                  const ticket = await getActiveTicket(selectedOrder.patient_id);
                  if (ticket && (ticket.status === "at_imaging" || ticket.workflow_stage === "at_imaging")) {
                    await onImagingComplete({ ticketId: ticket.id, encounterId: selectedOrder.encounter_id }, true);
                  }
                }} disabled={!findings || !impression}>Submit & Return to Doctor</Button>
                <Button onClick={submitResults} disabled={!findings || !impression}>Submit & Advance</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Imaging;
