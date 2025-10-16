import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialAnalytics } from "@/components/dashboard/FinancialAnalytics";
import { DepartmentSummary } from "@/components/dashboard/DepartmentSummary";
import { UserManagementOverview } from "@/components/dashboard/UserManagementOverview";
import { RoleBasedDashboard } from "@/components/RoleBasedDashboard";
import { UserManagement } from "@/components/UserManagement";
import { supabase } from "@/integrations/supabase/client";
import { 
  LayoutDashboard, 
  DollarSign, 
  Building2, 
  Users, 
  Activity,
  FileText,
  Settings,
  Shield,
  Bell
} from "lucide-react";

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [userRole, setUserRole] = useState("super_admin");
  const [userName, setUserName] = useState("");
  const [stats] = useState({});

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .single();
        
        if (profile) {
          setUserName(profile.full_name);
        }
      }
    };
    fetchUserData();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          CUEA Infirmary - Super Admin Dashboard
        </h1>
        <p className="text-lg text-muted-foreground">
          Complete system oversight and management
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 gap-2 bg-muted p-2 h-auto">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Financial</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Departments</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <RoleBasedDashboard role={userRole} stats={stats} />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialAnalytics />
        </TabsContent>

        <TabsContent value="departments">
          <DepartmentSummary />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserManagement />
        </TabsContent>

        <TabsContent value="operations">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Operations & Patient Flow</h2>
              <p className="text-muted-foreground">Real-time operational metrics</p>
            </div>
            <div className="text-center py-20 text-muted-foreground">
              <Activity className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Patient flow visualization coming soon</p>
              <p className="text-sm">This will show real-time patient journey through departments</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Reports & Analytics</h2>
              <p className="text-muted-foreground">Comprehensive reporting center</p>
            </div>
            <div className="text-center py-20 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Advanced reporting module coming soon</p>
              <p className="text-sm">Generate and export comprehensive reports</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Security & Audit Logs</h2>
              <p className="text-muted-foreground">System security and access monitoring</p>
            </div>
            <div className="text-center py-20 text-muted-foreground">
              <Shield className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Security monitoring dashboard coming soon</p>
              <p className="text-sm">Track user activity, login history, and system changes</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">System Settings</h2>
              <p className="text-muted-foreground">Global configuration and preferences</p>
            </div>
            <div className="text-center py-20 text-muted-foreground">
              <Settings className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>System configuration panel coming soon</p>
              <p className="text-sm">Manage departments, pricing, integrations, and branding</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
