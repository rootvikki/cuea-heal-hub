

# CUEA Infirmary System - Enterprise Audit Report

## Executive Summary

**System Health Score: 62 / 100**

The CUEA Hospital Management System is a substantial full-stack React/Supabase application covering patient registration, queuing, triage, consultation, lab/imaging, pharmacy, billing, and administration. The core architecture is sound, with proper role-based access control, real-time queue subscriptions, and a well-designed clinical workflow. However, there are critical functional gaps, performance anti-patterns, security weaknesses, and incomplete features that prevent production readiness.

---

## 1. SYSTEM ARCHITECTURE REVIEW

### Current Architecture

```text
+------------------+     +-------------------+     +------------------+
|  React SPA       | --> | Supabase Backend  | --> | PostgreSQL DB    |
|  (Vite/TS/TW)    |     | (Edge Functions)  |     | (39 tables, RLS) |
+------------------+     +-------------------+     +------------------+
|                         |                         |
| - 27 page routes        | - 10 edge functions     | - has_role() fn  |
| - 11 components         | - SMTP email            | - 18 user roles  |
| - 1 custom hook         | - M-Pesa integration    | - audit_logs     |
| - No state management   | - Patient registration  | - service_charges|
+------------------+     +-------------------+     +------------------+
```

### Issues Identified

| # | Issue | Severity |
|---|-------|----------|
| A1 | **No shared layout component** -- Every route in `App.tsx` duplicates the same `ProtectedRoute > SidebarProvider > div > AppSidebar > main` wrapper (lines 50-264). This is ~200 lines of pure boilerplate. | Medium |
| A2 | **No global state management** -- User roles, session, and profile are fetched independently in `AppSidebar`, `Dashboard`, `ProtectedRoute`, `PatientRegistrationDialog`, and every page that needs user context. Each component calls `supabase.auth.getUser()` separately. | High |
| A3 | **N+1 query pattern everywhere** -- Queue.tsx, Laboratory.tsx, Pharmacy.tsx, Imaging.tsx, Consultation.tsx, QueueDisplay.tsx all fetch tickets then loop through each ticket making individual queries for patient, profile, and department. With 50 patients in queue, that's 150+ separate database calls per page load. | Critical |
| A4 | **No error boundaries** -- A single component crash (like the `roles.replace()` null error) takes down the entire app with a blank screen. | High |
| A5 | **`PatientPortal` route has no sidebar layout** -- Line 251-253 in `App.tsx` wraps PatientPortal in `ProtectedRoute` but not in `SidebarProvider`, making it the only layout-inconsistent page. | Low |

### Recommended Architecture Improvements

1. Create a `ProtectedLayout` component that combines `ProtectedRoute + SidebarProvider + AppSidebar + main` -- reduces `App.tsx` from 270 to ~60 lines
2. Implement a `UserContext` (React Context) that fetches user, roles, and profile once and provides them to all children
3. Replace N+1 queries with Supabase joins or batch queries using `.in()` filters
4. Add a React Error Boundary wrapper around each route

---

## 2. FUNCTIONALITY VERIFICATION (Module-by-Module)

### Module Status Table

| Module | Page | Status | Issues |
|--------|------|--------|--------|
| **Landing** | `Index.tsx` | Fully Functional | None |
| **Auth** | `Auth.tsx` | Fully Functional | Login only (no self-registration by design) |
| **Password Reset** | `ResetPassword.tsx` | Fully Functional | Uses custom SMTP edge function |
| **Dashboard** | `Dashboard.tsx` | Partially Functional | Quick actions wired, but "Recent Activity" is hardcoded placeholder text |
| **Patient Registration** | `PatientRegistrationDialog.tsx` | Fully Functional | Uses `register-patient` edge function correctly |
| **Patient List** | `Patients.tsx` | Partially Functional | Missing: patient_type, DOB, gender columns; "View Details" button is non-functional (no onClick handler) |
| **Queue Check-in** | `Queue.tsx` | Fully Functional | Sets both `status` and `workflow_stage`; progress stepper displays correctly |
| **Queue Display** | `QueueDisplay.tsx` | Fully Functional | Uses `workflow_stage`, real-time updates work |
| **Triage/Vitals** | `Vitals.tsx` | Fully Functional | Station queue, vitals form, nursing procedures, interim payment all work |
| **Consultation** | `Consultation.tsx` | Fully Functional | Separate select/start, SOAP notes, orders, patient journey tab |
| **Laboratory** | `Laboratory.tsx` | Fully Functional | Structured results for Full Hemogram, Urinalysis, UECs, LFTs, Lipid Profile; auto-advance on completion |
| **Imaging** | `Imaging.tsx` | Fully Functional | Worklist, results entry, auto-advance |
| **Pharmacy** | `Pharmacy.tsx` | Fully Functional | Dispensing, stock cards, inventory management, auto-advance |
| **Billing** | `Billing.tsx` | Fully Functional | Charge sheet, invoice generation, M-Pesa STK push, auto-checkout |
| **Dental** | `Dental.tsx` | Partially Functional | Uses StationQueue but the queue stages include `"in_consult"` for dental -- this means dental patients share the doctor queue |
| **Insurance** | `Insurance.tsx` | Not Verified | Could not read full file; needs audit |
| **Inpatient** | `Inpatient.tsx` | Not Verified | Needs audit |
| **Records** | `Records.tsx` | Partially Functional | Displays encounters but allows creating encounters from Records page which bypasses the consultation workflow |
| **Staff Onboarding** | `StaffOnboarding.tsx` | Fully Functional | Multi-step wizard, payroll number, auto-department suggestion |
| **User Management** | `AdminUserManagement.tsx` | Functional with Fix | Null role guard applied; displays payroll numbers |
| **Role Management** | `RoleManagement.tsx` | Not Verified | Needs audit |
| **Audit Logs** | `AuditLogs.tsx` | Fully Functional | Filters, CSV export |
| **Reports** | `Reports.tsx` | Partially Functional | Department filters exist but PDF export needs verification |
| **Settings** | `Settings.tsx` | Partially Functional | AdminTemplates for catalog management; needs verification |
| **Patient Portal** | `PatientPortal.tsx` | Not Verified | Needs audit |
| **Staff Management** | `StaffManagement.tsx` | Not Verified | Needs audit |
| **Appointments** | `Appointments.tsx` | Not Verified | Needs audit |

### Critical Functional Gaps

1. **Patients.tsx "View Details" button does nothing** -- No `onClick` handler, no detail dialog or navigation
2. **Dashboard "Recent Activity" is static/fake** -- Hardcoded "System online" and "Database synchronized" messages, not real activity from audit_logs
3. **Dental workflow conflict** -- Dental StationQueue listens to `"in_consult"` stage, same as general consultation; dental patients need a separate workflow path (e.g., `"in_dental_consult"`)
4. **Records.tsx allows direct encounter creation** -- This bypasses the queue/consultation workflow and creates unlinked encounters
5. **No respiratory rate field displayed in Vitals** -- The `respiratory_rate` column exists in DB but the Vitals form does not have an input field for it

---

## 3. WORKFLOW & PROCESS LOGIC VALIDATION

### Primary Patient Flow

```text
Check-in (Queue) --> Triage (Vitals) --> Doctor Queue --> Consultation
     |                    |                                    |
     | workflow_stage:    | workflow_stage:           | Orders created:
     | "checked_in"       | "waiting_for_doctor"      | Lab/Imaging/Rx
     |                    |                                    |
     v                    v                                    v
                                                    +---> Lab (at_lab)
                                                    |      |
                                                    |      v
                                                    +---> Imaging (at_imaging)
                                                    |      |
                                                    |      v
                                                    +---> Pharmacy (at_pharmacy)
                                                           |
                                                           v
                                                       Billing (at_billing)
                                                           |
                                                           v
                                                       Checked Out
```

### Workflow Issues Found

| # | Issue | Impact |
|---|-------|--------|
| W1 | **Dental workflow shares `in_consult` stage with general consultation** | Dental patients appear in doctor queue; doctors see dental patients and vice versa |
| W2 | **No workflow path from Lab back to Doctor** | After lab results, patient goes to Pharmacy/Billing but doctor never sees results before discharge. Lab-then-return-to-doctor pattern is missing |
| W3 | **Consultation hardcodes department lookup `eq("name", "General")`** (line 260) | If the department is named "General Medicine" (which it is -- verified in DB), this query returns null, causing `department_id: null` on all encounters |
| W4 | **Consultation uses `staff.id` OR `user.id` for `doctor_id`** (line 283, 314, 358) | The `doctor_id` column expects a staff UUID but falls back to auth UUID. These are different tables with different ID spaces. If staff record doesn't exist, foreign key integrity breaks. |
| W5 | **Duplicate ticket prevention missing** | Nothing prevents checking in the same patient twice simultaneously, creating duplicate active tickets |
| W6 | **Ticket number collision risk** | `T-${Date.now().toString().slice(-6)}` can collide if two patients check in within the same millisecond; OPD number in register-patient uses `Math.random()` which is not collision-safe |

### Critical Fix: W3 - Department Lookup Failure

The Consultation page looks for department named `"General"` but the database has `"General Medicine"`. This means **every encounter saved from Consultation has `department_id: null`**, breaking any department-based reporting and filtering.

---

## 4. DATA STRUCTURE & DATABASE REVIEW

### Schema Health

- **39 tables** in public schema -- comprehensive coverage
- **All tables have RLS enabled** -- good security posture
- **Proper role enum** (`app_role`) with 18 roles
- **`has_role()` security definer function** prevents recursive RLS -- correct pattern

### Structural Issues

| # | Issue | Severity |
|---|-------|----------|
| D1 | **No indexes on frequently queried columns** -- `tickets.patient_id`, `tickets.workflow_stage`, `tickets.status`, `encounters.patient_id`, `lab_orders.encounter_id`, `prescriptions.encounter_id`, `service_charges.ticket_id` have no indexes beyond primary keys | High |
| D2 | **`tickets.status` is a USER-DEFINED enum but `workflow_stage` is text** -- These should be the same type for consistency; the enum constrains status but workflow_stage accepts any string | Medium |
| D3 | **No foreign key from `encounters.ticket_id` to `tickets.id`** -- The column exists but has no FK constraint, allowing orphaned references | Medium |
| D4 | **`service_charges` has no FK constraints** -- `patient_id`, `encounter_id`, `ticket_id` are all unconstrained UUIDs | Medium |
| D5 | **`lab_result_fields` has no DELETE policy** -- Lab techs can insert and update but cannot delete incorrect entries (they must delete-then-reinsert in the save flow, line 193 of Laboratory.tsx) | Medium |
| D6 | **OPD number generation is not sequential** -- Uses `Math.random()` which can produce duplicates and is not monotonically increasing, confusing for staff | Medium |

### Missing Indexes (Recommended)

```text
tickets(patient_id)
tickets(workflow_stage)
tickets(status, workflow_stage)
encounters(patient_id)
encounters(ticket_id)
lab_orders(encounter_id)
lab_orders(patient_id)
prescriptions(encounter_id)
prescriptions(patient_id)
service_charges(ticket_id)
service_charges(patient_id)
imaging_orders(encounter_id)
```

---

## 5. SECURITY & PERMISSION AUDIT

### Positive Findings

- All 39 tables have RLS enabled
- `has_role()` security definer function prevents infinite recursion
- Roles stored in separate `user_roles` table (not on profiles)
- Admin-controlled registration (no self-signup)
- Edge functions validate authorization headers
- Password reset uses custom SMTP, not default Supabase emails

### Vulnerabilities Found

| # | Vulnerability | Risk Level |
|---|---------------|------------|
| S1 | **Overly permissive RLS on `service_charges`** -- All four policies (SELECT, INSERT, UPDATE, DELETE) use `qual: true` / `with_check: true`, meaning ANY authenticated user can read/write/delete any service charge | Critical |
| S2 | **Overly permissive RLS on `nursing_procedures`** -- INSERT, UPDATE, SELECT all allow `true` for any authenticated user | High |
| S3 | **Overly permissive RLS on `dental_procedures`** -- Same as above | High |
| S4 | **`lab_result_fields` RLS uses `true` for SELECT/INSERT/UPDATE** -- Any authenticated user including patients can view all lab results | High |
| S5 | **`referrals` RLS uses `true` for INSERT and SELECT** -- Any authenticated user can create referrals or view all of them | High |
| S6 | **`pharmacy_stock_transactions` RLS uses `true` for INSERT and SELECT** -- Patients can view stock movements | Medium |
| S7 | **No route-level role checking** -- `ProtectedRoute` only checks if user is authenticated, not if they have the appropriate role for the page. A patient could navigate to `/laboratory` or `/admin/users` directly | Critical |
| S8 | **`register-patient` edge function has `verify_jwt = false`** -- While it checks Authorization header manually, the function is accessible without any JWT, and the manual check only validates the caller exists, not their role | High |
| S9 | **`email_otp_tokens` RLS uses `true` for ALL** -- Any authenticated user can read/write/delete any OTP token | High |
| S10 | **`mpesa_transactions` has a `true`/`true` ALL policy** -- Combined with the finance-only SELECT policy, the ALL policy overrides, allowing any user to manage M-Pesa transactions | High |

### Recommendations

1. Replace all `true`/`true` RLS policies with proper role-based checks using `has_role()`
2. Add role-based route guards in `ProtectedRoute` (accept a `requiredRoles` prop)
3. Add role verification in `register-patient` edge function (check caller is receptionist/admin)
4. Fix `email_otp_tokens` to restrict access to the token owner only

---

## 6. PERFORMANCE & SCALABILITY

### Critical Performance Issues

| # | Issue | Pages Affected | Impact |
|---|-------|----------------|--------|
| P1 | **N+1 query waterfall** -- For each ticket/order, individual queries fetch patient, profile, department separately | Queue, QueueDisplay, Consultation, Laboratory, Pharmacy, Imaging | 150+ queries on page load with 50 patients |
| P2 | **No pagination** -- Patients list, lab orders, invoices all load unbounded data (only limited by Supabase's 1000-row default) | Patients, Laboratory, Billing, Pharmacy | Will degrade with scale |
| P3 | **Real-time refetches entire dataset** -- Every Supabase real-time event triggers a full `fetchTickets()` reload instead of updating the changed record in state | Queue, QueueDisplay, Consultation | Unnecessary load |
| P4 | **No data caching** -- TanStack Query is installed but never used. Every navigation triggers fresh fetches | All pages | Wasted bandwidth, slow UX |
| P5 | **Dashboard makes 4 parallel count queries** -- Could be a single RPC or database view | Dashboard | Minor |

### Optimization Plan

1. **Replace N+1 with joins** -- Use Supabase's `.select("*, patients(*, profiles(*)), departments(name)")` syntax
2. **Use TanStack Query** -- Already installed; wrap all fetches in `useQuery` for caching, deduplication, and background refetch
3. **Add pagination** -- Implement cursor-based or offset pagination on all list views
4. **Optimize real-time handlers** -- Update state locally from the payload instead of full refetch

---

## 7. CRITICAL GAP ANALYSIS

### Missing Core Features

| # | Feature | Priority | Complexity |
|---|---------|----------|------------|
| G1 | **Route-level role authorization** -- Patients can access staff-only pages by URL | Critical | Low |
| G2 | **Patient detail view** -- "View Details" button on Patients page does nothing | High | Medium |
| G3 | **Respiratory rate in Vitals form** -- Column exists in DB but no input field | Medium | Low |
| G4 | **Real dashboard activity feed** -- Currently shows static text | Medium | Medium |
| G5 | **Dental-specific workflow stage** -- Dental patients need `in_dental_consult` stage to avoid mixing with general queue | High | Medium |
| G6 | **Lab-to-Doctor return path** -- After lab results, option to return patient to doctor for review | High | Medium |
| G7 | **Print/PDF for individual patient invoice** -- Only charge sheet dialog exists, no print-optimized view | Medium | Medium |
| G8 | **Patient search in check-in dialog** -- Current dropdown lists all patients with no search filter, unusable at scale | High | Low |
| G9 | **Appointment-to-Queue link** -- Appointments exist but no flow connects them to check-in | Medium | Medium |
| G10 | **Discharge summary generation** -- No clinical discharge document is generated when patient checks out | Medium | High |

### Missing Validations

| # | Missing Validation | Location |
|---|-------------------|----------|
| V1 | Phone number format validation (Kenyan format) | PatientRegistrationDialog, StaffOnboarding |
| V2 | Duplicate patient check (by national ID or email) | register-patient edge function |
| V3 | Duplicate active ticket prevention | Queue.tsx handleCheckIn |
| V4 | Required vitals before advancing (at minimum BP or weight) | Vitals.tsx handleSaveAndAdvance |
| V5 | Required chief complaint before saving encounter | Consultation.tsx saveEncounter |

---

## 8. FULL IMPLEMENTATION MASTER PLAN

### Phase 1 -- Critical Fixes (Immediate, 1-2 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Fix Consultation department lookup ("General" --> "General Medicine") | `Consultation.tsx` line 260 | Low | High (all encounters have null dept) |
| Fix `doctor_id` fallback to auth UUID (should error instead of fall back) | `Consultation.tsx` lines 283, 314, 358 | Low | High |
| Add route-level role guards to `ProtectedRoute` | `ProtectedRoute.tsx`, `App.tsx` | Medium | Critical |
| Fix overly permissive RLS on `service_charges`, `nursing_procedures`, `dental_procedures`, `lab_result_fields`, `referrals`, `pharmacy_stock_transactions` | SQL migration | Medium | Critical |
| Fix `email_otp_tokens` and `mpesa_transactions` RLS | SQL migration | Low | High |
| Add DELETE policy for `lab_result_fields` (lab_technician role) | SQL migration | Low | Medium |
| Add duplicate active ticket check in Queue.tsx | `Queue.tsx` | Low | Medium |

### Phase 2 -- Workflow Optimization (2-3 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Add dental-specific workflow stages (`at_dental`, `in_dental_consult`) | DB migration + `Dental.tsx`, `StationQueue.tsx` | Medium | Medium |
| Add "Return to Doctor" option after lab/imaging results | `useQueueTransition.ts`, `Laboratory.tsx`, `Imaging.tsx` | Medium | Medium |
| Connect Appointments to Queue check-in | `Appointments.tsx`, `Queue.tsx` | Medium | Low |
| Add duplicate patient detection in `register-patient` | `register-patient/index.ts` | Low | Low |
| Add respiratory rate to Vitals form | `Vitals.tsx` | Low | Low |
| Add patient search/filter to check-in dialog | `Queue.tsx` | Low | Low |

### Phase 3 -- Feature Completion (3-5 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Build Patient Detail view (demographics, history, vitals, encounters) | New component | High | Low |
| Real-time Dashboard activity feed from audit_logs | `Dashboard.tsx` | Medium | Low |
| Printable/PDF invoice view | `Billing.tsx` | Medium | Low |
| Discharge summary generation | New component | High | Low |
| Verify and fix Insurance, Inpatient, PatientPortal, StaffManagement pages | Multiple files | High | Medium |

### Phase 4 -- Security Hardening (1-2 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Add role check to `register-patient` edge function | `register-patient/index.ts` | Low | Medium |
| Add input validation (phone format, email format, length limits) across all forms | Multiple files | Medium | Low |
| Add React Error Boundary | New component, `App.tsx` | Low | Low |
| Review and tighten all remaining `true`/`true` RLS policies | SQL migration | Medium | High |

### Phase 5 -- Performance Optimization (2-3 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Replace N+1 queries with Supabase joins across all pages | All station pages | High | Medium |
| Implement TanStack Query for data fetching + caching | All pages | High | Low |
| Add database indexes on frequently queried columns | SQL migration | Low | Low |
| Add pagination to list views (Patients, Lab Orders, Invoices) | Multiple files | Medium | Low |
| Optimize real-time handlers to use payload updates | Queue, QueueDisplay, Consultation | Medium | Low |

### Phase 6 -- Production Readiness (1-2 days)

| Task | File(s) | Complexity | Risk |
|------|---------|------------|------|
| Create shared `ProtectedLayout` component to eliminate route boilerplate | `App.tsx`, new component | Medium | Low |
| Create `UserContext` provider for global user/role state | New context | Medium | Low |
| Add sequential OPD number generation (counter-based) | `register-patient/index.ts`, DB | Medium | Low |
| Add loading skeletons to all pages | Multiple files | Low | Low |
| Comprehensive error handling and user feedback | Multiple files | Medium | Low |

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 55/100 | Sound foundation but heavy boilerplate, no state management, N+1 queries |
| Functionality | 70/100 | Core workflow works end-to-end; several buttons/features are stubs |
| Workflow Logic | 60/100 | Main flow works but department lookup broken, dental overlap, no lab-return path |
| Database | 65/100 | Good schema, RLS enabled everywhere, but missing indexes and some loose FK constraints |
| Security | 50/100 | 10+ tables with overly permissive RLS; no route-level authorization |
| Performance | 45/100 | N+1 queries on every page; no caching despite TanStack Query being installed |
| Completeness | 65/100 | Major feature gaps: patient details, discharge summaries, dental separation |

**Overall: 62/100** -- The system has a strong foundation and the clinical workflow logic is well-designed. The critical path from check-in to checkout works. However, the security gaps (permissive RLS, no route guards), the broken department lookup in Consultation, and the N+1 performance pattern must be resolved before production deployment.

