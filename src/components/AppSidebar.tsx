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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user role
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .limit(1)
          .single();
        
        console.log("Fetched user role:", roles, "Error:", error, "User ID:", user.id);
        
        if (roles) {
          setUserRole(roles.role);
          console.log("User role set to:", roles.role);
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

  const menuItems = [
    { title: "Dashboard", url: "/dashboard", icon: Home, roles: ["all"] },
    { title: "Patients", url: "/patients", icon: Users, roles: ["super_admin", "admin", "doctor", "nurse", "receptionist"] },
    { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["all"] },
    { title: "Patient Queue", url: "/queue", icon: ClipboardList, roles: ["super_admin", "admin", "doctor", "nurse", "receptionist"] },
    { title: "Medical Records", url: "/records", icon: FileText, roles: ["super_admin", "admin", "doctor", "nurse"] },
    { title: "Vitals", url: "/vitals", icon: Activity, roles: ["super_admin", "admin", "doctor", "nurse"] },
    { title: "Pharmacy", url: "/pharmacy", icon: Pill, roles: ["super_admin", "admin", "pharmacist", "doctor"] },
    { title: "Laboratory", url: "/laboratory", icon: TestTube, roles: ["super_admin", "admin", "lab_technician", "radiologist", "doctor"] },
    { title: "Billing", url: "/billing", icon: Receipt, roles: ["super_admin", "admin", "finance_officer", "cashier", "accountant"] },
    { title: "Settings", url: "/settings", icon: Settings, roles: ["all"] },
  ];

  // Super admin sees everything, others see filtered menu
  const filteredMenuItems = userRole === "super_admin" 
    ? menuItems 
    : menuItems.filter(item => item.roles.includes("all") || (userRole && item.roles.includes(userRole)));

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
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => {
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
