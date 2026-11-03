import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Users, DollarSign, Activity, Settings2, Smartphone, Loader2, CheckCircle2, Timer } from "lucide-react";
import { AdminTemplates } from "@/components/AdminTemplates";
import { QueueAndLiveSettings } from "@/components/QueueAndLiveSettings";
import { useToast } from "@/hooks/use-toast";
import { functionErrorMessage } from "@/lib/billing";

const Settings = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({
    totalPatients: 0, totalAppointments: 0, completedEncounters: 0,
    totalRevenue: 0, pendingPayments: 0, activePrescriptions: 0,
    lowStockItems: 0, pendingLabOrders: 0,
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // M-Pesa config state — secret values are never loaded into the browser; blank = keep saved value
  const [mpesaConfig, setMpesaConfig] = useState({
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    paymentType: "till" as "till" | "paybill",
    tillNumber: "",
    storeNumber: "",
    paybillNumber: "",
  });
  const [mpesaSaved, setMpesaSaved] = useState<Record<string, boolean>>({});
  const [mpesaEnvironment, setMpesaEnvironment] = useState("sandbox");
  const [savingMpesa, setSavingMpesa] = useState(false);
  const [testingMpesa, setTestingMpesa] = useState(false);
  const [mpesaTest, setMpesaTest] = useState<{ ok: boolean; message: string; config?: { environment: string; type: string; tillOrPaybill: string; storeNumber: string | null } } | null>(null);
  const [mpesaConfigured, setMpesaConfigured] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState("5");
  const [savingIdle, setSavingIdle] = useState(false);

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
    if (isAdmin) {
      fetchMpesaConfig();
      fetchIdleTimeout();
    }
  };

  const fetchMpesaConfig = async () => {
    const { data } = await supabase.from("system_settings").select("key, value").like("key", "mpesa_%");
    const map: Record<string, string> = {};
    (data || []).forEach((s: any) => { map[s.key] = s.value || ""; });
    setMpesaSaved({ consumerKey: !!map.mpesa_consumer_key, consumerSecret: !!map.mpesa_consumer_secret, passkey: !!map.mpesa_passkey });
    setMpesaConfig((prev) => ({
      ...prev,
      consumerKey: "", consumerSecret: "", passkey: "",
      paymentType: map.mpesa_type === "paybill" ? "paybill" : "till",
      tillNumber: map.mpesa_till_number || "",
      storeNumber: map.mpesa_store_number || "",
      paybillNumber: map.mpesa_type === "paybill" ? map.mpesa_shortcode || "" : "",
    }));
    setMpesaEnvironment(map.mpesa_environment || "sandbox");
    // Show what the payment function is actually using right now (also fills numbers kept in project secrets)
    await testMpesa(true);
  };

  const testMpesa = async (prefill = false) => {
    setTestingMpesa(true);
    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", { body: { action: "test" } });
      const message = await functionErrorMessage(error, data);
      const cfg = data?.config ?? (await (error as any)?.context?.json?.().catch(() => null))?.config;
      const ok = !error && !!data?.success;
      setMpesaTest({ ok, message: ok ? data.message : message, config: cfg });
      setMpesaConfigured(ok);
      if (prefill && cfg) {
        setMpesaConfig((prev) => ({
          ...prev,
          paymentType: cfg.type === "paybill" ? "paybill" : "till",
          tillNumber: prev.tillNumber || (cfg.type === "till" ? cfg.tillOrPaybill || "" : ""),
          storeNumber: prev.storeNumber || cfg.storeNumber || "",
          paybillNumber: prev.paybillNumber || (cfg.type === "paybill" ? cfg.tillOrPaybill || "" : ""),
        }));
      }
    } finally {
      setTestingMpesa(false);
    }
  };

  const saveMpesaConfig = async () => {
    const c = mpesaConfig;
    if (c.paymentType === "till" && (!c.tillNumber.trim() || !c.storeNumber.trim())) {
      toast({ title: "Enter both numbers", description: "A Buy Goods till needs the Till number and the Store (head office) number.", variant: "destructive" });
      return;
    }
    if (c.paymentType === "paybill" && !c.paybillNumber.trim()) {
      toast({ title: "Enter the Paybill number", variant: "destructive" });
      return;
    }
    setSavingMpesa(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-mpesa-config", {
        body: {
          consumerKey: c.consumerKey, consumerSecret: c.consumerSecret, passkey: c.passkey,
          environment: mpesaEnvironment, paymentType: c.paymentType,
          tillNumber: c.paymentType === "till" ? c.tillNumber : undefined,
          storeNumber: c.paymentType === "till" ? c.storeNumber : undefined,
          shortcode: c.paymentType === "paybill" ? c.paybillNumber : undefined,
        },
      });
      if (error || data?.success === false) throw new Error(await functionErrorMessage(error, data));
      toast({ title: "M-Pesa settings saved" });
      await fetchMpesaConfig();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingMpesa(false);
    }
  };

  const fetchIdleTimeout = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "idle_timeout_minutes")
      .maybeSingle();
    if (data?.value) setIdleTimeout(data.value);
  };

  const saveIdleTimeout = async () => {
    setSavingIdle(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "idle_timeout_minutes")
        .maybeSingle();

      if (existing) {
        await supabase.from("system_settings").update({ value: idleTimeout }).eq("key", "idle_timeout_minutes");
      } else {
        await supabase.from("system_settings").insert({ key: "idle_timeout_minutes", value: idleTimeout });
      }
      toast({ title: "Saved", description: `Inactivity timeout set to ${idleTimeout} minutes` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingIdle(false);
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
    <div className="space-y-6">
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
                {["M-Pesa", "School fees / Staff account", "Insurance"].map(m => (
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
                <CardDescription>The till and keys used to send M-Pesa prompts to patients' phones</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className={`rounded-lg border p-4 space-y-2 ${!mpesaTest ? "border-border" : mpesaTest.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Currently in use</p>
                    <Button size="sm" variant="outline" onClick={() => testMpesa(false)} disabled={testingMpesa}>
                      {testingMpesa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Test connection
                    </Button>
                  </div>
                  {mpesaTest?.config && (
                    <div className="grid gap-1 text-sm sm:grid-cols-3">
                      <p><span className="text-muted-foreground">System:</span> {mpesaTest.config.environment === "production" ? "Live" : "Sandbox (test)"}</p>
                      <p><span className="text-muted-foreground">{mpesaTest.config.type === "till" ? "Till number:" : "Paybill:"}</span> <strong>{mpesaTest.config.tillOrPaybill || "—"}</strong></p>
                      {mpesaTest.config.type === "till" && <p><span className="text-muted-foreground">Store / head office:</span> <strong>{mpesaTest.config.storeNumber || "—"}</strong></p>}
                    </div>
                  )}
                  <p className="text-sm">{testingMpesa && !mpesaTest ? "Checking…" : mpesaTest?.message}</p>
                </div>

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

                <div className="space-y-2">
                  <Label>Type of M-Pesa account</Label>
                  <Select value={mpesaConfig.paymentType} onValueChange={(v) => setMpesaConfig(prev => ({ ...prev, paymentType: v as "till" | "paybill" }))}>
                    <SelectTrigger className="h-12 md:w-80"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="till">Buy Goods (Till number)</SelectItem>
                      <SelectItem value="paybill">Paybill</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {mpesaConfig.paymentType === "till" ? (
                    <>
                      <div className="space-y-2">
                        <Label>Till number</Label>
                        <Input className="h-12" inputMode="numeric" value={mpesaConfig.tillNumber} onChange={e => setMpesaConfig(prev => ({ ...prev, tillNumber: e.target.value }))} placeholder="The number patients pay to" />
                      </div>
                      <div className="space-y-2">
                        <Label>Store / head office number</Label>
                        <Input className="h-12" inputMode="numeric" value={mpesaConfig.storeNumber} onChange={e => setMpesaConfig(prev => ({ ...prev, storeNumber: e.target.value }))} placeholder="The number the Passkey was issued for" />
                      </div>
                      <p className="md:col-span-2 text-xs text-muted-foreground">
                        If M-Pesa says “the Agent number and Store number do not match”, these two numbers are wrong or swapped. Safaricom's Go-Live email lists both.
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Paybill number</Label>
                      <Input className="h-12" inputMode="numeric" value={mpesaConfig.paybillNumber} onChange={e => setMpesaConfig(prev => ({ ...prev, paybillNumber: e.target.value }))} placeholder="e.g. 174379" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Consumer Key</Label>
                    <Input className="h-12" type="password" autoComplete="off" value={mpesaConfig.consumerKey} onChange={e => setMpesaConfig(prev => ({ ...prev, consumerKey: e.target.value }))} placeholder={mpesaSaved.consumerKey ? "Saved — leave blank to keep" : "Enter Consumer Key"} />
                  </div>
                  <div className="space-y-2">
                    <Label>Consumer Secret</Label>
                    <Input className="h-12" type="password" autoComplete="off" value={mpesaConfig.consumerSecret} onChange={e => setMpesaConfig(prev => ({ ...prev, consumerSecret: e.target.value }))} placeholder={mpesaSaved.consumerSecret ? "Saved — leave blank to keep" : "Enter Consumer Secret"} />
                  </div>
                  <div className="space-y-2">
                    <Label>Passkey</Label>
                    <Input className="h-12" type="password" autoComplete="off" value={mpesaConfig.passkey} onChange={e => setMpesaConfig(prev => ({ ...prev, passkey: e.target.value }))} placeholder={mpesaSaved.passkey ? "Saved — leave blank to keep" : "Enter Passkey"} />
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
          <TabsContent value="config" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-primary" /> Session Inactivity Timeout
                </CardTitle>
                <CardDescription>
                  Set how long users can be inactive before being automatically logged out
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div className="space-y-2 w-64">
                    <Label>Timeout Duration</Label>
                    <Select value={idleTimeout} onValueChange={setIdleTimeout}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.167">10 seconds (Testing)</SelectItem>
                        <SelectItem value="1">1 minute</SelectItem>
                        <SelectItem value="2">2 minutes</SelectItem>
                        <SelectItem value="3">3 minutes</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="20">20 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={saveIdleTimeout} disabled={savingIdle}>
                    {savingIdle && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Timeout
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Users will see a 6-second warning countdown before being signed out. Currently set to{" "}
                  <strong>
                    {parseFloat(idleTimeout) < 1
                      ? `${Math.round(parseFloat(idleTimeout) * 60)} seconds`
                      : `${idleTimeout} minute${idleTimeout !== "1" ? "s" : ""}`}
                  </strong>.
                </p>
              </CardContent>
            </Card>
            <QueueAndLiveSettings />
            <AdminTemplates />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Settings;
