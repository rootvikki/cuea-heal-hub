import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, TrendingUp, Users, DollarSign, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export const AdvancedReports = () => {
  const { toast } = useToast();
  const [reportData, setReportData] = useState({
    totalPatients: 0,
    totalRevenue: 0,
    totalEncounters: 0,
    totalAppointments: 0,
    pendingInvoices: 0,
    lowStockItems: 0,
    monthlyRevenue: [] as any[],
    departmentStats: [] as any[],
    paymentMethods: [] as any[],
  });

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    // Fetch all necessary data
    const [patients, invoices, encounters, appointments, inventory] = await Promise.all([
      supabase.from('patients').select('id', { count: 'exact', head: true }),
      supabase.from('invoices').select('net_amount, amount_paid, status, created_at'),
      supabase.from('encounters').select('id', { count: 'exact', head: true }),
      supabase.from('appointments').select('id', { count: 'exact', head: true }),
      supabase.from('pharmacy_inventory').select('quantity, reorder_level'),
    ]);

    const totalRevenue = invoices.data?.reduce((sum, inv) => 
      sum + parseFloat(String(inv.amount_paid || '0')), 0
    ) || 0;

    const pendingInvoices = invoices.data?.filter(inv => inv.status === 'pending').length || 0;
    const lowStock = inventory.data?.filter(item => item.quantity <= item.reorder_level).length || 0;

    // Calculate monthly revenue (last 6 months)
    const monthlyRevenue = calculateMonthlyRevenue(invoices.data || []);

    // Fetch department statistics
    const { data: departments } = await supabase.from('departments').select('id, name');
    const departmentStats = await Promise.all(
      (departments || []).map(async (dept) => {
        const { count } = await supabase
          .from('encounters')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', dept.id);
        
        return {
          name: dept.name,
          encounters: count || 0,
        };
      })
    );

    // Payment methods distribution
    const { data: payments } = await supabase.from('payments').select('payment_method, amount');
    const paymentMethods = calculatePaymentMethodsDistribution(payments || []);

    setReportData({
      totalPatients: patients.count || 0,
      totalRevenue,
      totalEncounters: encounters.count || 0,
      totalAppointments: appointments.count || 0,
      pendingInvoices,
      lowStockItems: lowStock,
      monthlyRevenue,
      departmentStats,
      paymentMethods,
    });
  };

  const calculateMonthlyRevenue = (invoices: any[]) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const now = new Date();
    
    return months.map((month, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const monthInvoices = invoices.filter(inv => {
        const invDate = new Date(inv.created_at);
        return invDate.getMonth() === monthDate.getMonth() && 
               invDate.getFullYear() === monthDate.getFullYear();
      });
      
      const revenue = monthInvoices.reduce((sum, inv) => 
        sum + parseFloat(String(inv.amount_paid || '0')), 0
      );
      
      return { month, revenue };
    });
  };

  const calculatePaymentMethodsDistribution = (payments: any[]) => {
    const distribution: Record<string, number> = {};
    
    payments.forEach(payment => {
      const method = payment.payment_method || 'unknown';
      distribution[method] = (distribution[method] || 0) + parseFloat(String(payment.amount || '0'));
    });
    
    const colors: Record<string, string> = {
      mpesa: '#22c55e',
      card: '#3b82f6',
      cash: '#8b5cf6',
      insurance: '#f59e0b',
    };
    
    return Object.entries(distribution).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: colors[name] || '#6b7280',
    }));
  };

  const handleExportCSV = () => {
    toast({
      title: "Export Started",
      description: "Your report is being prepared for download",
    });
    // In production, implement actual CSV export
  };

  const handleExportPDF = () => {
    toast({
      title: "Export Started",
      description: "Your PDF report is being generated",
    });
    // In production, implement actual PDF export
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advanced Reports & Analytics</h2>
          <p className="text-muted-foreground">Comprehensive insights and data visualization</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF} className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{reportData.totalPatients}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">KES {reportData.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Encounters</CardTitle>
            <Activity className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{reportData.totalEncounters}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
            <TrendingUp className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{reportData.pendingInvoices}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="revenue">Revenue Analysis</TabsTrigger>
          <TabsTrigger value="clinical">Clinical Metrics</TabsTrigger>
          <TabsTrigger value="operational">Operational KPIs</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Revenue Trend</CardTitle>
                <CardDescription>Revenue over the last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={reportData.monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods Distribution</CardTitle>
                <CardDescription>Revenue breakdown by payment type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.paymentMethods}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportData.paymentMethods.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Activity</CardTitle>
              <CardDescription>Encounters by department</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={reportData.departmentStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="encounters" fill="#3b82f6" name="Encounters" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operational" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.totalAppointments}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">{reportData.lowStockItems}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pending Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{reportData.pendingInvoices}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
