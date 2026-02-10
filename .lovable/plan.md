

# CUEA Infirmary System - Comprehensive Fix & Enhancement Plan

This plan addresses all the issues you've raised: fixing broken features, streamlining workflows, adding audit logging, enhancing reports, and ensuring a fully functional system.

---

## 1. Fix Staff Creation Error (Critical)

**Problem**: The `admin-create-user` edge function fails with "Missing required fields" because the Staff Onboarding page does not send `adminUserId` in the request body.

**Fix**:
- Update `StaffOnboarding.tsx` to include `adminUserId` (from the current session) when calling `admin-create-user`
- Add a `payrollNumber` field to the onboarding Step 1 (required, alongside email)
- Pass `payrollNumber` to the edge function
- Update the edge function to accept and store `payrollNumber` in the staff table (requires adding a `payroll_number` column to `staff`)

---

## 2. Fix User Management Page

**Problem**: The `AdminUserManagement.tsx` page calls `get_all_users_with_roles` RPC which may fail due to RLS or permission issues.

**Fix**:
- Add error handling and fallback if the RPC call fails
- Ensure the RPC function works correctly with the current user's admin status
- Add the "Payroll Number" column to the user table display

---

## 3. Remove Blood Type from Patient Registration

- Remove the Blood Type field and related state from `PatientRegistrationDialog.tsx`

---

## 4. Add Payroll Number to Staff Table (Database)

**Migration**:
- `ALTER TABLE staff ADD COLUMN payroll_number TEXT`
- Update the `admin-create-user` edge function to accept and store `payrollNumber`

---

## 5. Audit Logs - Make Fully Functional

**Current state**: The `audit_logs` table exists but has no `staff_id` or `payroll_number` columns and no automatic logging.

**Changes**:
- Add `staff_id` and `payroll_number` columns to `audit_logs`
- Create a reusable `logAuditEvent()` utility function in `src/lib/auditLog.ts`
- Integrate audit logging into all key actions:
  - Patient registration
  - Ticket creation / queue transitions
  - Consultation save
  - Lab result entry
  - Prescription dispensing
  - Payment processing
  - Staff creation
  - Role assignment changes
- Create an Audit Log viewer page at `/admin/audit-logs` for super_admin to search and filter logs by module, user, date, and action

---

## 6. Staff Onboarding Enhancements

- Make **Email** and **Payroll Number** the primary identifiers (both required in Step 1)
- Add shift option: **"All Day (8AM - 5PM)"** to the shifts list
- Fix Role-to-Department mapping logic so roles are assigned to logical departments:
  - Doctor/Clinical Officer --> General Medicine
  - Nurse/Ward Manager --> General Medicine
  - Lab Technician --> Laboratory
  - Radiologist --> Imaging
  - Pharmacist --> Pharmacy
  - Receptionist/Records Officer --> General Medicine
  - Finance Officer/Cashier/Accountant --> (no clinical dept)
- Auto-suggest the department based on primary role selection

---

## 7. Doctor Full Patient Flow View

- On the Consultation page, when a doctor selects a patient, show a **"Patient Journey"** tab that displays:
  - Triage vitals recorded by the nurse
  - Nursing procedures performed
  - Lab results (read-only)
  - Imaging results (read-only)
  - Pharmacy dispensing status
  - Billing status
- Only doctors and clinical officers get this full view
- Other staff (nurse, lab tech, pharmacist) only see data relevant to their station

---

## 8. Optional Payment at Each Stage

- Add an "Interim Payment" button on the Vitals, Laboratory, Imaging, and Pharmacy station pages
- This allows (but does not require) payment collection at any stage
- The button opens a small payment dialog showing accumulated charges so far
- Final billing at the Billing station shows the full consolidated charge sheet minus any interim payments

---

## 9. Super Admin Dashboard - Template & Workflow Management

Add a new **System Configuration** section accessible from the Settings page (super_admin only):

- **Department Management**: Add/edit/delete departments
- **Procedure Templates**: Manage nursing procedures list, dental procedures catalog
- **Lab Test Catalog**: Add/edit lab tests with reference ranges
- **Imaging Catalog**: Add/edit imaging types and prices
- **Workflow Configuration**: View the patient flow stages (read-only visual diagram)
- **Service Pricing**: Set prices for consultation, procedures, and services

---

## 10. Department-Level Reports

Enhance the Reports page:
- Add a **Department** filter dropdown (Laboratory, Pharmacy, Dental, Nursing, etc.)
- Department-specific report tabs:
  - **Lab Reports**: Tests performed, results by test type, turnaround time
  - **Pharmacy Reports**: Dispensed medications, stock levels, consumption trends
  - **Nursing Reports**: Procedures performed by type
  - **Dental Reports**: Procedures by category
  - **Financial Reports**: Revenue by department, payment method breakdown
- All reports filterable by the existing 6 criteria (age, gender, diagnosis, lab test, procedure, date)

---

## 11. PDF Report Generation

- Add a branded PDF export using browser-based PDF generation (html2canvas + jsPDF or similar approach with a print-optimized layout)
- PDF includes:
  - CUEA Infirmary header with logo
  - Report title and filter criteria applied
  - Data table
  - Summary statistics
  - Generated date and admin name
  - Page numbers

---

## 12. Queue Display - Fully Functional

The current QueueDisplay page works but has issues:
- Fix: Use `workflow_stage` instead of `status` for grouping (they should be in sync)
- Add audio notification for ticket number changes
- Add auto-scroll for long lists
- Use the CUEA logo instead of the "C" placeholder
- Ensure real-time updates work properly (already subscribed)

---

## 13. Ensure All Pages Exist for All Roles

Verify and ensure each role can access their designated pages:
- **Receptionist**: Patients, Queue, Appointments
- **Nurse**: Vitals/Triage, Nursing Procedures
- **Doctor/Clinical Officer**: Consultation, full patient view
- **Lab Technician**: Laboratory
- **Radiologist**: Imaging
- **Pharmacist**: Pharmacy
- **Cashier/Finance Officer**: Billing
- **Records Officer**: Records
- **Ward Manager**: Inpatient
- **Super Admin/Admin**: All pages + Admin dashboard + Audit Logs
- Add Cashier to billing sidebar access

---

## Technical Details

### Database Migration
```sql
-- Add payroll_number to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS payroll_number TEXT;

-- Enhance audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS staff_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payroll_number TEXT;

-- RLS for audit_logs (admin read, authenticated write)
```

### Edge Function Update
- `admin-create-user/index.ts`: Accept `payrollNumber`, store in `staff.payroll_number`

### New Files
- `src/lib/auditLog.ts` - Reusable audit logging utility
- `src/pages/AuditLogs.tsx` - Audit log viewer (super_admin)
- `src/components/InterimPayment.tsx` - Optional payment component for stations
- `src/components/PatientJourney.tsx` - Doctor's full patient flow view
- `src/components/AdminTemplates.tsx` - Template management for super admin

### Modified Files
- `src/components/PatientRegistrationDialog.tsx` - Remove blood type
- `src/pages/StaffOnboarding.tsx` - Add payroll number, fix adminUserId, add "All Day" shift, auto-suggest department
- `src/pages/AdminUserManagement.tsx` - Fix data loading, add payroll display
- `src/pages/Reports.tsx` - Department filter, per-department reports, PDF export
- `src/pages/Consultation.tsx` - Add Patient Journey tab (doctor-only)
- `src/pages/Vitals.tsx` - Add interim payment button
- `src/pages/Laboratory.tsx` - Add interim payment button
- `src/pages/Pharmacy.tsx` - Add interim payment button
- `src/pages/QueueDisplay.tsx` - Fix stage grouping, use logo
- `src/pages/Settings.tsx` - Add system configuration for super_admin
- `src/components/AppSidebar.tsx` - Add Audit Logs link, fix cashier access to billing
- `src/App.tsx` - Add audit logs route
- `supabase/functions/admin-create-user/index.ts` - Accept payrollNumber

### Implementation Order
1. Database migration (payroll_number on staff, audit_logs enhancements)
2. Fix edge function (admin-create-user) and staff onboarding
3. Fix user management page
4. Remove blood type from registration
5. Audit logging utility + integration across all modules
6. Doctor patient journey view
7. Interim payment at each station
8. Department-level reports + PDF export
9. Super admin template management
10. Queue display fixes
11. Sidebar access corrections

