import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Queue from "./pages/Queue";
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
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import PatientPortal from "./pages/PatientPortal";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Dashboard /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/patients" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Patients /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/appointments" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Appointments /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/queue" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Queue /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/records" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Records /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/consultation" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Consultation /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/vitals" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Vitals /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/pharmacy" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Pharmacy /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/laboratory" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Laboratory /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/billing" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Billing /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/imaging" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Imaging /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/insurance" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Insurance /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/inpatient" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Inpatient /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/staff" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><StaffManagement /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Reports /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full">
                  <AppSidebar />
                  <main className="flex-1"><Settings /></main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          } />
          <Route path="/portal" element={
            <ProtectedRoute>
              <PatientPortal />
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
