import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  patients: "Patients",
  appointments: "Appointments",
  queue: "Patient Queue",
  "queue-display": "Queue Display",
  consultation: "Consultation",
  vitals: "Nursing / Triage",
  dental: "Dental",
  records: "Medical Records",
  inpatient: "Inpatient",
  laboratory: "Laboratory",
  imaging: "Imaging",
  pharmacy: "Pharmacy",
  billing: "Billing & Payments",
  insurance: "Insurance",
  portal: "Patient Portal",
  staff: "Staff Management",
  reports: "Reports",
  settings: "Settings",
  profile: "My Profile",
  admin: "Administration",
  users: "User Management",
  roles: "Role Management",
  "onboard-staff": "Staff Onboarding",
  "audit-logs": "Audit Logs",
};

export function PageBreadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((seg, idx) => {
          const path = "/" + segments.slice(0, idx + 1).join("/");
          const label = ROUTE_LABELS[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          const isLast = idx === segments.length - 1;

          return (
            <span key={path} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={path}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
