import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  Users,
  Calendar,
  FileText,
  Pill,
  TestTube,
  Receipt,
  Settings,
  LogOut,
  Hospital,
  ClipboardList,
  Activity,
  Camera,
  Bed,
  Shield,
  UserCog,
  BarChart3,
  Stethoscope,
  UserCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .limit(1)
          .single();
        
        if (roles) {
          setUserRole(roles.role);
        }
      }
    };

    fetchUserRole();
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  const clinicalItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home, roles: ["all"] },
    { title: "My Portal", url: "/portal", icon: UserCircle, roles: ["patient"] },
    { title: "Patients", url: "/patients", icon: Users, roles: ["admin", "super_admin", "doctor", "nurse", "receptionist"] },
    { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["all"] },
    { title: "Patient Queue", url: "/queue", icon: ClipboardList, roles: ["admin", "super_admin", "doctor", "nurse", "receptionist"] },
    { title: "Consultation", url: "/consultation", icon: Stethoscope, roles: ["admin", "super_admin", "doctor"] },
    { title: "Medical Records", url: "/records", icon: FileText, roles: ["admin", "super_admin", "doctor", "nurse"] },
    { title: "Vitals", url: "/vitals", icon: Activity, roles: ["admin", "super_admin", "doctor", "nurse"] },
    { title: "Inpatient", url: "/inpatient", icon: Bed, roles: ["admin", "super_admin", "doctor", "nurse"] },
  ];

  const diagnosticsItems = [
    { title: "Laboratory", url: "/laboratory", icon: TestTube, roles: ["admin", "super_admin", "lab_technician", "doctor"] },
    { title: "Imaging", url: "/imaging", icon: Camera, roles: ["admin", "super_admin", "radiologist", "doctor"] },
  ];

  const supportItems = [
    { title: "Pharmacy", url: "/pharmacy", icon: Pill, roles: ["admin", "super_admin", "pharmacist", "doctor"] },
    { title: "Billing", url: "/billing", icon: Receipt, roles: ["admin", "super_admin", "finance_officer"] },
    { title: "Insurance", url: "/insurance", icon: Shield, roles: ["admin", "super_admin", "finance_officer", "receptionist"] },
  ];

  const adminItems = [
    { title: "User Management", url: "/admin/users", icon: Users, roles: ["admin", "super_admin"] },
    { title: "Staff", url: "/staff", icon: UserCog, roles: ["admin", "super_admin"] },
    { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin", "super_admin", "finance_officer"] },
    { title: "Settings", url: "/settings", icon: Settings, roles: ["all"] },
  ];

  const filterItems = (items: typeof clinicalItems) =>
    items.filter(item => item.roles.includes("all") || (userRole && item.roles.includes(userRole)));

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Hospital className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg">CUEA Infirmary</span>
            <span className="text-xs text-muted-foreground">Hospital MS</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-[calc(100vh-180px)]">
          {filterItems(clinicalItems).length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Clinical</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filterItems(clinicalItems).map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {filterItems(diagnosticsItems).length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Diagnostics</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filterItems(diagnosticsItems).map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {filterItems(supportItems).length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Support Services</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filterItems(supportItems).map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {filterItems(adminItems).length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filterItems(adminItems).map((item) => {
                    const isActive = location.pathname === item.url;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <Button
          variant="outline"
          onClick={handleLogout}
          className="w-full justify-start"
        >
          <LogOut className="h-4 w-4" />
          <span className="ml-2">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
