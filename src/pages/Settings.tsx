import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, DollarSign, Activity } from "lucide-react";

const Settings = () => {
  const [stats, setStats] = useState({
    totalPatients: 0,
    totalAppointments: 0,
    completedEncounters: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    activePrescriptions: 0,
    lowStockItems: 0,
    pendingLabOrders: 0,
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    const [
      patientsRes,
      appointmentsRes,
      encountersRes,
      invoicesRes,
      prescriptionsRes,
      inventoryRes,
      labOrdersRes,
    ] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase.from("appointments").select("id", { count: "exact", head: true }),
      supabase.from("encounters").select("id", { count: "exact", head: true }),
      supabase.from("invoices").select("net_amount, amount_paid, status"),
      supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("dispensed", false),
      supabase.from("pharmacy_inventory").select("quantity, reorder_level"),
      supabase.from("lab_orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const totalRevenue = invoicesRes.data?.reduce((sum, inv) => sum + parseFloat(String(inv.amount_paid || "0")), 0) || 0;
    const pendingPayments = invoicesRes.data?.filter(inv => inv.status === "pending").length || 0;
    const lowStock = inventoryRes.data?.filter(item => item.quantity <= item.reorder_level).length || 0;

    setStats({
      totalPatients: patientsRes.count || 0,
      totalAppointments: appointmentsRes.count || 0,
      completedEncounters: encountersRes.count || 0,
      totalRevenue,
      pendingPayments,
      activePrescriptions: prescriptionsRes.count || 0,
      lowStockItems: lowStock,
      pendingLabOrders: labOrdersRes.count || 0,
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics & Reports</h1>
        <p className="text-muted-foreground mt-1">
          Hospital performance and statistics
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Patients
                </CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalPatients}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Registered in system
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Appointments
                </CardTitle>
                <Activity className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalAppointments}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total scheduled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Encounters
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.completedEncounters}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Clinical consultations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue
                </CardTitle>
                <DollarSign className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">KES {stats.totalRevenue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total collected
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Statistics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Pending Lab Orders</span>
                  <span className="font-bold">{stats.pendingLabOrders}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Active Prescriptions</span>
                  <span className="font-bold">{stats.activePrescriptions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Low Stock Items</span>
                  <span className="font-bold text-warning">{stats.lowStockItems}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Pending Payments</span>
                  <span className="font-bold text-destructive">{stats.pendingPayments}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  System Health
                </CardTitle>
                <CardDescription>Overall system status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Patient Registration</span>
                    <span className="text-success font-medium">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Appointment System</span>
                    <span className="text-success font-medium">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Queue Management</span>
                    <span className="text-success font-medium">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Billing System</span>
                    <span className="text-success font-medium">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>M-Pesa Integration</span>
                    <span className="text-warning font-medium">⚠ Demo Mode</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Encounters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.completedEncounters}</div>
                <p className="text-xs text-muted-foreground mt-1">Clinical consultations</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending Lab Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.pendingLabOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting processing</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Active Prescriptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.activePrescriptions}</div>
                <p className="text-xs text-muted-foreground mt-1">To be dispensed</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">KES {stats.totalRevenue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.pendingPayments}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>M-Pesa</span>
                    <span className="font-medium">Available</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Card</span>
                    <span className="font-medium">Available</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cash</span>
                    <span className="font-medium">Available</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
