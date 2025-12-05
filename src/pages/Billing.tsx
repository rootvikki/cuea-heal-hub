import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Plus, CreditCard, Smartphone } from "lucide-react";

const Billing = () => {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [formData, setFormData] = useState({
    patientId: "",
    items: [{ description: "", quantity: 1, unitPrice: "" }],
  });

  useEffect(() => {
    fetchInvoices();
    fetchPatients();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const invoicesWithDetails = await Promise.all(
        data.map(async (invoice) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", invoice.patient_id)
            .single();

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("user_id", patient?.user_id)
            .single();

          const { data: items } = await supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", invoice.id);

          return { ...invoice, patient: { ...patient, profile }, items };
        })
      );
      setInvoices(invoicesWithDetails);
    }
    setLoading(false);
  };

  const fetchPatients = async () => {
    const { data } = await supabase.from("patients").select("id, patient_id, user_id");
    if (data) {
      const patientsWithProfiles = await Promise.all(
        data.map(async (patient) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", patient.user_id)
            .single();
          return { ...patient, profile };
        })
      );
      setPatients(patientsWithProfiles);
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: "", quantity: 1, unitPrice: "" }],
    });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
    const totalAmount = formData.items.reduce(
      (sum, item) => sum + (parseFloat(item.unitPrice) || 0) * item.quantity,
      0
    );

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        patient_id: formData.patientId,
        total_amount: totalAmount,
        net_amount: totalAmount,
        balance: totalAmount,
        status: "pending",
      })
      .select()
      .single();

    if (invoiceError) {
      toast({
        title: "Error creating invoice",
        description: invoiceError.message,
        variant: "destructive",
      });
      return;
    }

    const itemsToInsert = formData.items.map((item) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: parseFloat(item.unitPrice),
      total_price: parseFloat(item.unitPrice) * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemsToInsert);

    if (itemsError) {
      toast({
        title: "Error adding items",
        description: itemsError.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Invoice created",
        description: `Invoice ${invoiceNumber} created successfully`,
      });
      setDialogOpen(false);
      setFormData({
        patientId: "",
        items: [{ description: "", quantity: 1, unitPrice: "" }],
      });
      fetchInvoices();
    }
  };

  const handleMpesaPayment = async () => {
    if (!selectedInvoice || !paymentPhone) return;

    toast({
      title: "Processing M-Pesa payment",
      description: "STK push sent to " + paymentPhone,
    });

    // In production, this would call an edge function to initiate M-Pesa STK Push
    // For now, we'll simulate a successful payment
    setTimeout(async () => {
      const { error: paymentError } = await supabase.from("payments").insert({
        invoice_id: selectedInvoice.id,
        patient_id: selectedInvoice.patient_id,
        amount: selectedInvoice.balance,
        payment_method: "mpesa",
        transaction_ref: `MPE${Date.now().toString().slice(-10)}`,
        status: "completed",
      });

      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          amount_paid: selectedInvoice.net_amount,
          balance: 0,
          status: "paid",
        })
        .eq("id", selectedInvoice.id);

      if (paymentError || invoiceError) {
        toast({
          title: "Payment error",
          description: "Failed to record payment",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment successful",
          description: "M-Pesa payment completed",
        });
        setPaymentDialogOpen(false);
        setPaymentPhone("");
        fetchInvoices();
      }
    }, 2000);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-warning",
      partial: "bg-status-in-progress",
      paid: "bg-status-completed",
      cancelled: "bg-status-cancelled",
    };
    return colors[status] || "bg-muted";
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Payments</h1>
          <p className="text-muted-foreground mt-1">
            Manage invoices and process payments
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
              <DialogDescription>Generate invoice for patient services</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select
                  value={formData.patientId}
                  onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.patient_id} - {patient.profile?.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Invoice Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    Add Item
                  </Button>
                </div>

                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value))}
                        required
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Unit Price (KES)"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Total: KES{" "}
                  {formData.items
                    .reduce((sum, item) => sum + (parseFloat(item.unitPrice) || 0) * item.quantity, 0)
                    .toFixed(2)}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Invoice</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              KES {invoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {invoices.filter(i => i.status === "pending").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              KES {invoices.reduce((sum, inv) => sum + parseFloat(inv.balance || 0), 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoices
          </CardTitle>
          <CardDescription>Recent invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No invoices yet
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <div>
                          <p>{invoice.patient?.profile?.full_name}</p>
                          <p className="text-sm text-muted-foreground">{invoice.patient?.patient_id}</p>
                        </div>
                      </TableCell>
                      <TableCell>KES {parseFloat(invoice.net_amount).toFixed(2)}</TableCell>
                      <TableCell>KES {parseFloat(invoice.balance).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(invoice.status)}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <Smartphone className="h-4 w-4 mr-2" />
                            M-Pesa
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>M-Pesa Payment</DialogTitle>
            <DialogDescription>
              {selectedInvoice && (
                <>
                  Invoice: {selectedInvoice.invoice_number} | Amount: KES {selectedInvoice.balance}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                type="tel"
                placeholder="254712345678"
                value={paymentPhone}
                onChange={(e) => setPaymentPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter phone number in format: 254XXXXXXXXX
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleMpesaPayment} disabled={!paymentPhone}>
                <Smartphone className="h-4 w-4 mr-2" />
                Send STK Push
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
