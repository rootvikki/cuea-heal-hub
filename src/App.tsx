import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserProvider } from "@/contexts/UserContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedLayout from "@/components/ProtectedLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminUserManagement from "./pages/AdminUserManagement";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Queue from "./pages/Queue";
import QueueDisplay from "./pages/QueueDisplay";
import Records from "./pages/Records";
import Consultation from "./pages/Consultation";
import Vitals from "./pages/Vitals";
import Pharmacy from "./pages/Pharmacy";
import Laboratory from "./pages/Laboratory";
import Imaging from "./pages/Imaging";
import Billing from "./pages/Billing";
import Insurance from "./pages/Insurance";
import Inpatient from "./pages/Inpatient";
import StaffManagement from "./pages/StaffManagement";
import StaffOnboarding from "./pages/StaffOnboarding";
import RoleManagement from "./pages/RoleManagement";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import MyProfile from "./pages/MyProfile";
import PatientPortal from "./pages/PatientPortal";
import Dental from "./pages/Dental";
import NotFound from "./pages/NotFound";
import AuditLogs from "./pages/AuditLogs";
import Reception from "./pages/Reception";

const queryClient = new QueryClient();

// Role groupings for route access
const CLINICAL_ROLES = ["doctor", "nurse", "clinical_officer"];
const RECEPTION_ROLES = ["receptionist"];
const LAB_ROLES = ["lab_technician"];
const IMAGING_ROLES = ["radiologist"];
const PHARMACY_ROLES = ["pharmacist"];
const FINANCE_ROLES = ["finance_officer", "cashier", "accountant"];
const ADMIN_ROLES = ["super_admin", "admin", "system_admin", "hr_admin"];
const ALL_STAFF = [...CLINICAL_ROLES, ...RECEPTION_ROLES, ...LAB_ROLES, ...IMAGING_ROLES, ...PHARMACY_ROLES, ...FINANCE_ROLES, ...ADMIN_ROLES, "ward_manager", "records_officer", "auditor"];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/queue-display" element={<QueueDisplay />} />

          {/* Dashboard - all authenticated users */}
          <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />

          {/* Reception & Queue */}
          <Route path="/patients" element={<ProtectedLayout allowedRoles={[...CLINICAL_ROLES, ...RECEPTION_ROLES, ...FINANCE_ROLES]}><Patients /></ProtectedLayout>} />
          <Route path="/appointments" element={<ProtectedLayout allowedRoles={[...CLINICAL_ROLES, ...RECEPTION_ROLES]}><Appointments /></ProtectedLayout>} />
          <Route path="/queue" element={<ProtectedLayout allowedRoles={[...CLINICAL_ROLES, ...RECEPTION_ROLES]}><Queue /></ProtectedLayout>} />
          <Route path="/records" element={<ProtectedLayout allowedRoles={["doctor", "clinical_officer"]}><Records /></ProtectedLayout>} />

          {/* Clinical stations */}
          <Route path="/vitals" element={<ProtectedLayout allowedRoles={CLINICAL_ROLES}><Vitals /></ProtectedLayout>} />
          <Route path="/consultation" element={<ProtectedLayout allowedRoles={["doctor", "clinical_officer"]}><Consultation /></ProtectedLayout>} />
          <Route path="/dental" element={<ProtectedLayout allowedRoles={["doctor", "clinical_officer"]}><Dental /></ProtectedLayout>} />
          <Route path="/laboratory" element={<ProtectedLayout allowedRoles={LAB_ROLES}><Laboratory /></ProtectedLayout>} />
          <Route path="/imaging" element={<ProtectedLayout allowedRoles={IMAGING_ROLES}><Imaging /></ProtectedLayout>} />
          <Route path="/pharmacy" element={<ProtectedLayout allowedRoles={PHARMACY_ROLES}><Pharmacy /></ProtectedLayout>} />

          {/* Finance */}
          <Route path="/billing" element={<ProtectedLayout allowedRoles={FINANCE_ROLES}><Billing /></ProtectedLayout>} />
          <Route path="/insurance" element={<ProtectedLayout allowedRoles={FINANCE_ROLES}><Insurance /></ProtectedLayout>} />

          {/* Inpatient */}
          <Route path="/inpatient" element={<ProtectedLayout allowedRoles={[...CLINICAL_ROLES, "ward_manager"]}><Inpatient /></ProtectedLayout>} />

          {/* Staff & Admin */}
          <Route path="/staff" element={<ProtectedLayout allowedRoles={ADMIN_ROLES}><StaffManagement /></ProtectedLayout>} />
          <Route path="/admin/onboard-staff" element={<ProtectedLayout allowedRoles={ADMIN_ROLES}><StaffOnboarding /></ProtectedLayout>} />
          <Route path="/admin/users" element={<ProtectedLayout allowedRoles={ADMIN_ROLES}><AdminUserManagement /></ProtectedLayout>} />
          <Route path="/admin/roles" element={<ProtectedLayout allowedRoles={["super_admin"]}><RoleManagement /></ProtectedLayout>} />
          <Route path="/admin/audit-logs" element={<ProtectedLayout allowedRoles={["super_admin", "auditor"]}><AuditLogs /></ProtectedLayout>} />

          {/* Reports & Settings */}
          <Route path="/reports" element={<ProtectedLayout allowedRoles={ALL_STAFF}><Reports /></ProtectedLayout>} />
          <Route path="/profile" element={<ProtectedLayout><MyProfile /></ProtectedLayout>} />
          <Route path="/settings" element={<ProtectedLayout allowedRoles={ADMIN_ROLES}><Settings /></ProtectedLayout>} />

          {/* Patient Portal - separate layout */}
          <Route path="/portal" element={<ProtectedRoute><PatientPortal /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
