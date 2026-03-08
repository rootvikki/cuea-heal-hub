import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import {
  Home, Users, Calendar, FileText, Pill, TestTube, Receipt, Settings,
  LogOut, ClipboardList, Activity, Camera, Bed, Shield, UserCog,
  BarChart3, Stethoscope, UserCircle, UserPlus, ShieldCheck, Monitor, FileSearch,
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
  const { roles: userRoles, isAdmin: hasAdminAccess, profile } = useUser();

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
    { title: "Reception", url: "/reception", icon: ClipboardList, roles: ["admin", "super_admin", "receptionist"] },
    { title: "Patients", url: "/patients", icon: Users, roles: ["admin", "super_admin", "doctor", "nurse", "receptionist"] },
    { title: "Appointments", url: "/appointments", icon: Calendar, roles: ["doctor", "nurse", "clinical_officer"] },
    { title: "Patient Queue", url: "/queue", icon: ClipboardList, roles: ["admin", "super_admin", "doctor", "nurse"] },
    { title: "Queue Display", url: "/queue-display", icon: Monitor, roles: ["admin", "super_admin", "receptionist"], isExternal: true },
    { title: "Consultation", url: "/consultation", icon: Stethoscope, roles: ["admin", "super_admin", "doctor", "clinical_officer"] },
    { title: "Nursing/Triage", url: "/vitals", icon: Activity, roles: ["admin", "super_admin", "doctor", "nurse"] },
    { title: "Dental", url: "/dental", icon: Stethoscope, roles: ["admin", "super_admin", "doctor", "clinical_officer"] },
    { title: "Medical Records", url: "/records", icon: FileText, roles: ["admin", "super_admin", "doctor", "clinical_officer"] },
    { title: "Inpatient", url: "/inpatient", icon: Bed, roles: ["admin", "super_admin", "doctor", "nurse", "ward_manager"] },
  ];

  const diagnosticsItems = [
    { title: "Laboratory", url: "/laboratory", icon: TestTube, roles: ["admin", "super_admin", "lab_technician", "doctor"] },
    { title: "Imaging", url: "/imaging", icon: Camera, roles: ["admin", "super_admin", "radiologist", "doctor"] },
  ];

  const supportItems = [
    { title: "Pharmacy", url: "/pharmacy", icon: Pill, roles: ["admin", "super_admin", "pharmacist", "doctor"] },
    { title: "Billing", url: "/billing", icon: Receipt, roles: ["admin", "super_admin", "finance_officer", "cashier"] },
    { title: "Insurance", url: "/insurance", icon: Shield, roles: ["admin", "super_admin", "finance_officer", "receptionist", "cashier"] },
  ];

  const adminItems = [
    { title: "User Management", url: "/admin/users", icon: Users, roles: ["admin", "super_admin"] },
    { title: "Staff Onboarding", url: "/admin/onboard-staff", icon: UserPlus, roles: ["admin", "super_admin", "hr_admin"] },
    { title: "Role Management", url: "/admin/roles", icon: ShieldCheck, roles: ["super_admin"] },
    { title: "Staff", url: "/staff", icon: UserCog, roles: ["admin", "super_admin"] },
    { title: "Audit Logs", url: "/admin/audit-logs", icon: FileSearch, roles: ["admin", "super_admin"] },
    { title: "Reports", url: "/reports", icon: BarChart3, roles: ["admin", "super_admin", "finance_officer"] },
    { title: "My Profile", url: "/profile", icon: UserCircle, roles: ["all"] },
    { title: "Settings", url: "/settings", icon: Settings, roles: ["admin", "super_admin", "system_admin"] },
  ];

  const filterItems = (items: typeof clinicalItems) =>
    items.filter(item => 
      item.roles.includes("all") || 
      hasAdminAccess ||
      userRoles.some(role => item.roles.includes(role))
    );

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img 
            src="/favicon.png" 
            alt="CUEA Logo" 
            className="w-10 h-10 flex-shrink-0"
          />
          <div className="flex flex-col">
            <span className="font-bold text-lg">CUEA Infirmary</span>
            <span className="text-xs opacity-80">Hospital MS</span>
          </div>
        </div>
        {profile && (
          <div className="mt-3 pt-3 border-t border-sidebar-border">
            <p className="text-sm font-medium truncate">{profile.full_name}</p>
            <p className="text-xs opacity-70 capitalize">{userRoles[0]?.replace(/_/g, " ") || "User"}</p>
          </div>
        )}
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
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary" : "border-l-2 border-transparent"}
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
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary" : "border-l-2 border-transparent"}
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
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary" : "border-l-2 border-transparent"}
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
                          className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary" : "border-l-2 border-transparent"}
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
          className="w-full justify-start gap-2 min-w-0"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
