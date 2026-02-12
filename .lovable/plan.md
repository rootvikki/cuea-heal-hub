
# Super Admin User Management, Role-Based Portals, and UI Polish

This plan addresses three areas: (1) full admin control over users, (2) role-specific dashboards, and (3) world-class form/template design.

---

## 1. Super Admin Full User Control

### Current State
- AdminUserManagement page has: create user, manage roles, reset password (via email link)
- Missing: edit profile, change password directly, suspend user, delete user

### Changes

**A. Edge Function: `admin-manage-user`** (new)
A server-side function that handles privileged operations only a super_admin can perform:
- **Update profile** -- updates `profiles` table fields (full_name, phone, email, etc.)
- **Change password** -- uses `supabase.auth.admin.updateUserById()` to set a new password directly
- **Suspend/unsuspend** -- sets `profiles.status` to `suspended` / `active` and optionally bans via `supabase.auth.admin.updateUserById({ ban_duration })`
- **Delete user** -- calls `supabase.auth.admin.deleteUser()` which cascades to profiles/roles

**B. AdminUserManagement.tsx enhancements**
- Add "Edit Profile" dialog: editable fields for full_name, phone, email, date_of_birth, gender, address
- Add "Change Password" dialog: direct password input (no email needed)
- Add "Suspend User" / "Unsuspend User" toggle in the dropdown menu with confirmation dialog
- Add "Delete User" with a destructive confirmation dialog (type user email to confirm)
- Show user status column (Active/Suspended) with color-coded badges
- Show last login date column

**C. Database: RLS policy for profiles**
- Add UPDATE policy allowing super_admin/admin to update any profile (currently only users can update their own)

**D. Auth Guard in ProtectedLayout**
- Check if user's profile status is `suspended`; if so, sign them out and redirect to `/auth` with a message

---

## 2. Role-Specific Dashboards

### Current State
- All roles land on the same `/dashboard` page showing the same stats
- Sidebar already filters menu items by role

### Changes

**Dashboard.tsx** will be refactored to show role-appropriate content:

- **Super Admin / Admin**: Full stats (patients, appointments, queue, payments), user management quick links, system health, audit feed
- **Doctor / Clinical Officer**: My patients today (tickets assigned), pending lab/imaging results, quick consult link
- **Nurse**: Triage queue count, vitals pending, inpatient nursing notes due
- **Receptionist**: Today's check-ins, queue length, upcoming appointments, register patient shortcut
- **Lab Technician**: Pending lab orders count, completed today, critical alerts
- **Pharmacist**: Pending prescriptions, low stock alerts, dispensed today
- **Radiologist**: Pending imaging orders, completed today
- **Finance Officer / Cashier**: Pending invoices, today's collections, outstanding balances
- **Patient**: Redirect to `/portal` (patient portal already exists)

Implementation: A `RoleDashboard` component that uses the `useUser()` hook to determine the highest-priority role and renders the appropriate dashboard variant. Each variant fetches only the data relevant to that role.

---

## 3. World-Class Form and Template Design

### Changes across all forms and templates

**A. Global layout improvements**
- All forms use full-width responsive grid layouts (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- Dialog forms use `max-w-4xl` with proper `max-h-[90vh] overflow-y-auto`
- Consistent spacing: `space-y-6` between sections, `gap-4` within grids
- Section headers with subtle dividers and icons
- Rounded cards with soft shadows for visual grouping

**B. Specific form upgrades**
- **PatientRegistrationDialog**: Stepper/section headers (Personal Info, Contact, Insurance, Next of Kin), visual age calculator, conditional fields animate in/out
- **StaffOnboarding**: Already has stepper -- polish with better card layouts and progress indicator
- **Consultation form**: Full-width SOAP notes with proper textarea sizing, collapsible sections
- **All station pages** (Vitals, Lab, Pharmacy, Imaging, Dental, Billing): Consistent card-based layouts that fill the screen, responsive tables with proper overflow handling

**C. Responsive table design**
- Use `min-w-full` tables inside `overflow-x-auto` containers
- Sticky headers on scroll
- Proper cell padding and truncation for long text

**D. Typography and spacing**
- Page titles: `text-3xl font-bold` with subtitle in `text-muted-foreground`
- Form labels: consistent `text-sm font-medium`
- Inputs: uniform `h-10` height with proper focus rings

---

## Technical Details

### New files
- `supabase/functions/admin-manage-user/index.ts` -- edge function for profile edit, password change, suspend, delete

### Modified files
- `src/pages/AdminUserManagement.tsx` -- add Edit Profile, Change Password, Suspend, Delete dialogs
- `src/pages/Dashboard.tsx` -- role-based dashboard variants
- `src/components/ProtectedLayout.tsx` -- suspension check
- `src/components/PatientRegistrationDialog.tsx` -- visual polish with section headers
- `src/pages/Consultation.tsx` -- full-width layout improvements
- `src/pages/Vitals.tsx`, `src/pages/Laboratory.tsx`, `src/pages/Pharmacy.tsx`, `src/pages/Imaging.tsx`, `src/pages/Dental.tsx`, `src/pages/Billing.tsx` -- responsive layout polish
- `src/pages/PatientPortal.tsx` -- responsive tab layout improvements

### Database migration
- Add RLS policy: `super_admin and admin can update any profile`
- Ensure `profiles.status` column default is `'active'`

### Execution order
1. Database migration (RLS + status default)
2. Edge function (`admin-manage-user`)
3. AdminUserManagement.tsx (full admin controls)
4. ProtectedLayout.tsx (suspension guard)
5. Dashboard.tsx (role-based views)
6. Form/template UI polish (all pages)
