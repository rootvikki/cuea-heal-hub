import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BarChart3, TrendingUp, Users, DollarSign, Activity, Settings2, Smartphone, Loader2, CheckCircle2 } from "lucide-react";
import { AdminTemplates } from "@/components/AdminTemplates";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({
    totalPatients: 0, totalAppointments: 0, completedEncounters: 0,
    totalRevenue: 0, pendingPayments: 0, activePrescriptions: 0,
    lowStockItems: 0, pendingLabOrders: 0,
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // M-Pesa config state
  const [mpesaConfig, setMpesaConfig] = useState({
    consumerKey: "",
    consumerSecret: "",
    shortcode: "",
    passkey: "",
  });
  const [mpesaEnvironment, setMpesaEnvironment] = useState("sandbox");
  const [savingMpesa, setSavingMpesa] = useState(false);
  const [mpesaConfigured, setMpesaConfigured] = useState(false);

  useEffect(() => {
    fetchAnalytics();
    checkRole();
  }, []);

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = data?.map(r => r.role) || [];
    const isAdmin = roles.includes("super_admin") || roles.includes("admin");
    setIsSuperAdmin(isAdmin);
    if (isAdmin) fetchMpesaConfig();
  };

  const fetchMpesaConfig = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_shortcode", "mpesa_passkey", "mpesa_environment"]);

    if (data) {
      const map: Record<string, string> = {};
      data.forEach((s: any) => { map[s.key] = s.value || ""; });
      setMpesaConfig({
        consumerKey: map["mpesa_consumer_key"] || "",
        consumerSecret: map["mpesa_consumer_secret"] || "",
        shortcode: map["mpesa_shortcode"] || "",
        passkey: map["mpesa_passkey"] || "",
      });
      setMpesaEnvironment(map["mpesa_environment"] || "sandbox");
      setMpesaConfigured(!!(map["mpesa_consumer_key"] && map["mpesa_shortcode"]));
    }
  };

  const saveMpesaConfig = async () => {
    setSavingMpesa(true);
    try {
      const { error } = await supabase.functions.invoke("update-mpesa-config", {
        body: {
          consumerKey: mpesaConfig.consumerKey,
          consumerSecret: mpesaConfig.consumerSecret,
          shortcode: mpesaConfig.shortcode,
          passkey: mpesaConfig.passkey,
          environment: mpesaEnvironment,
        },
      });
      if (error) throw error;
      toast({ title: "M-Pesa config saved", description: "Credentials updated successfully" });
      setMpesaConfigured(!!(mpesaConfig.consumerKey && mpesaConfig.shortcode));
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingMpesa(false);
    }
  };

  const fetchAnalytics = async () => {
    const [patientsRes, appointmentsRes, encountersRes, invoicesRes, prescriptionsRes, inventoryRes, labOrdersRes] = await Promise.all([
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
    const lowStock = inventoryRes.data?.filter(item => item.quantity <= (item.reorder_level ?? 50)).length || 0;

    setStats({
      totalPatients: patientsRes.count || 0, totalAppointments: appointmentsRes.count || 0,
      completedEncounters: encountersRes.count || 0, totalRevenue, pendingPayments,
      activePrescriptions: prescriptionsRes.count || 0, lowStockItems: lowStock,
      pendingLabOrders: labOrdersRes.count || 0,
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics & Settings</h1>
        <p className="text-muted-foreground mt-1">Hospital performance, statistics & system configuration</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className={`grid w-full ${isSuperAdmin ? "grid-cols-5" : "grid-cols-3"}`}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="mpesa"><Smartphone className="h-3.5 w-3.5 mr-1" />M-Pesa</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="config"><Settings2 className="h-3.5 w-3.5 mr-1" />System Config</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Patients</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats.totalPatients}</div><p className="text-xs text-muted-foreground mt-1">Registered in system</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Appointments</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats.totalAppointments}</div><p className="text-xs text-muted-foreground mt-1">Total scheduled</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Encounters</CardTitle>
                <BarChart3 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{stats.completedEncounters}</div><p className="text-xs text-muted-foreground mt-1">Clinical consultations</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">KES {stats.totalRevenue.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Total collected</p></CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Quick Statistics</CardTitle><CardDescription>Key performance indicators</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between"><span className="text-sm">Pending Lab Orders</span><span className="font-bold">{stats.pendingLabOrders}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm">Active Prescriptions</span><span className="font-bold">{stats.activePrescriptions}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm">Low Stock Items</span><span className="font-bold text-destructive">{stats.lowStockItems}</span></div>
                <div className="flex items-center justify-between"><span className="text-sm">Pending Payments</span><span className="font-bold text-destructive">{stats.pendingPayments}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> System Health</CardTitle>
                <CardDescription>Overall system status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {["Patient Registration", "Appointment System", "Queue Management", "Billing System"].map(s => (
                    <div key={s} className="flex items-center justify-between text-sm">
                      <span>{s}</span><span className="text-primary font-medium">✓ Active</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span>M-Pesa Integration</span>
                    <span className={`font-medium ${mpesaConfigured ? "text-primary" : "text-muted-foreground"}`}>
                      {mpesaConfigured ? "✓ Configured" : "⚠ Not Configured"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-sm">Total Encounters</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.completedEncounters}</div><p className="text-xs text-muted-foreground mt-1">Clinical consultations</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Pending Lab Orders</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.pendingLabOrders}</div><p className="text-xs text-muted-foreground mt-1">Awaiting processing</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Active Prescriptions</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.activePrescriptions}</div><p className="text-xs text-muted-foreground mt-1">To be dispensed</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="financial" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-sm">Total Revenue</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">KES {stats.totalRevenue.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">All time</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Pending Invoices</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{stats.pendingPayments}</div><p className="text-xs text-muted-foreground mt-1">Awaiting payment</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Payment Methods</CardTitle></CardHeader><CardContent>
              <div className="space-y-2 text-sm">
                {["M-Pesa", "Card", "Cash"].map(m => (
                  <div key={m} className="flex justify-between"><span>{m}</span><span className="font-medium">Available</span></div>
                ))}
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="mpesa" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-green-600" /> M-Pesa Configuration
                  {mpesaConfigured && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </CardTitle>
                <CardDescription>Configure M-Pesa STK Push credentials for payment processing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                  <div>
                    <p className="font-medium">Environment</p>
                    <p className="text-sm text-muted-foreground">{mpesaEnvironment === "production" ? "Production (Live)" : "Sandbox (Testing)"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Sandbox</span>
                    <Switch
                      checked={mpesaEnvironment === "production"}
                      onCheckedChange={(checked) => setMpesaEnvironment(checked ? "production" : "sandbox")}
                    />
                    <span className="text-sm text-muted-foreground">Production</span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Consumer Key</Label>
                    <Input
                      type="password"
                      value={mpesaConfig.consumerKey}
                      onChange={e => setMpesaConfig(prev => ({ ...prev, consumerKey: e.target.value }))}
                      placeholder="Enter Consumer Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Consumer Secret</Label>
                    <Input
                      type="password"
                      value={mpesaConfig.consumerSecret}
                      onChange={e => setMpesaConfig(prev => ({ ...prev, consumerSecret: e.target.value }))}
                      placeholder="Enter Consumer Secret"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Business Shortcode</Label>
                    <Input
                      value={mpesaConfig.shortcode}
                      onChange={e => setMpesaConfig(prev => ({ ...prev, shortcode: e.target.value }))}
                      placeholder="e.g. 174379"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Passkey</Label>
                    <Input
                      type="password"
                      value={mpesaConfig.passkey}
                      onChange={e => setMpesaConfig(prev => ({ ...prev, passkey: e.target.value }))}
                      placeholder="Enter Passkey"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveMpesaConfig} disabled={savingMpesa}>
                    {savingMpesa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save M-Pesa Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="config" className="mt-6">
            <AdminTemplates />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Settings;
