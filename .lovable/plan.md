
# User Management Module -- Complete Audit and Fix Plan

## Current State

The user management module spans 4 pages and 2 edge functions, covering user creation, role assignment, profile editing, password management, suspension, and deletion. After thorough review, here are the issues and improvements needed.

---

## Issues Found

### 1. StaffManagement.tsx -- Severe N+1 Query Problem
The Staff page (`/staff`) calls `get_all_users_with_roles` RPC **once per staff member** inside a loop (line 110). For 50 staff members, this fires 50 identical heavy RPC calls, making the page extremely slow.

**Fix**: Fetch profiles, roles, and user data in bulk instead of per-member loops.

### 2. StaffManagement.tsx -- Missing Roles in ROLES List
The `ROLES` constant (line 39) only lists 8 roles, missing `super_admin`, `system_admin`, `clinical_officer`, `ward_manager`, `cashier`, `accountant`, `hr_admin`, `records_officer`, `auditor`, and `patient`. This means the stats cards at the top are incomplete and staff with those roles show incorrect counts.

**Fix**: Use the full 18-role list consistent with the rest of the system.

### 3. AdminUserManagement.tsx -- Missing Roles in ALL_ROLES List
The `ALL_ROLES` constant (line 45) is missing `system_admin`, `cashier`, `accountant`, `hr_admin`, and `auditor`. When creating users or managing roles from this page, these 5 roles cannot be assigned.

**Fix**: Add the missing 5 roles to the `ALL_ROLES` list.

### 4. StaffManagement.tsx -- No "Add Staff" Button
The page has an `addStaffOpen` state and a `newStaff` form state defined but no dialog or button to add staff. The "Add User" button exists on AdminUserManagement and StaffOnboarding, but Staff Management itself has no creation flow -- just a read-only view with department reassignment.

**Fix**: Remove the unused state variables (dead code cleanup) and add a navigation button to StaffOnboarding for adding new staff.

### 5. AdminUserManagement -- Payroll Number Not Editable
When editing a user profile, payroll number cannot be changed -- the edit dialog has no payroll number field, and the edge function doesn't handle it either.

**Fix**: Add payroll number field to the edit profile dialog and update the edge function to handle payroll number updates on the staff table.

### 6. AdminUserManagement -- No Audit Logging for Role Changes
When roles are updated via `handleUpdateRoles` (line 170), no audit log entry is created. Password changes, suspensions, and deletions all happen via the edge function which could log, but role changes happen client-side with no audit trail.

**Fix**: Add `logAuditEvent` calls for role changes and profile edits.

### 7. StaffManagement -- Staff Table RLS Blocks Non-Admin Updates
The staff table has no UPDATE policy for admin roles. Only the ALL policy check would apply. Need to verify the RLS allows admin updates.

### 8. Auth Page -- No Suspended User Check
When a suspended user logs in, the auth succeeds but they can't access data due to the ban. The login page doesn't show a clear "Your account is suspended" message -- the user just sees broken/empty pages.

**Fix**: After successful login, check profile status and show a clear suspension message if applicable, then sign them out.

---

## Remediation Plan

### Phase 1: Fix AdminUserManagement.tsx
- Add the 5 missing roles to `ALL_ROLES`: `system_admin`, `cashier`, `accountant`, `hr_admin`, `auditor`
- Add payroll number field to the edit profile dialog
- Add audit logging for role changes and profile edits using `logAuditEvent`

### Phase 2: Fix StaffManagement.tsx -- Performance and Completeness
- Replace the N+1 query pattern: fetch `get_all_users_with_roles` once, then join with staff data in memory
- Update the `ROLES` list to include all 18 roles (matching the system-wide list)
- Remove dead `addStaffOpen` / `newStaff` state
- Add a "Add Staff" button that navigates to `/admin/onboard-staff`

### Phase 3: Update admin-manage-user Edge Function
- Add `update_payroll` case (or extend `update_profile`) to allow updating the payroll number in the `staff` table

### Phase 4: Auth.tsx -- Suspended User Handling
- After `signInWithPassword` succeeds, query the user's profile status
- If status is `suspended`, show a toast "Your account has been suspended. Contact your administrator.", sign them out, and prevent navigation to dashboard

### Phase 5: Audit Logging Gap
- Import `logAuditEvent` in AdminUserManagement
- Call it after successful role updates with action `UPDATE_ROLES`, module `user_management`
- Call it after successful profile edits with action `UPDATE_PROFILE`, module `user_management`

---

## Technical Details

### File: `src/pages/AdminUserManagement.tsx`
- Line 45: Add missing roles to `ALL_ROLES` array -- add `system_admin`, `cashier`, `accountant`, `hr_admin`, `auditor` with proper labels
- Line 89: Add `payrollNumber` to `editForm` state
- Lines 188-196: When opening edit dialog, populate payroll number from user data
- Lines 199-224: In `handleEditProfile`, include payroll number in the request body
- Lines 170-186: In `handleUpdateRoles`, add `logAuditEvent` call after success
- Import `logAuditEvent` from `@/lib/auditLog`

### File: `src/pages/StaffManagement.tsx`
- Lines 39-48: Replace 8-role `ROLES` list with complete 18-role list
- Lines 94-119: Replace N+1 loop with single `get_all_users_with_roles` call + memory join
- Lines 56-68: Remove unused `addStaffOpen`, `newStaff` state
- Add "Onboard Staff" navigation button in header

### File: `supabase/functions/admin-manage-user/index.ts`
- In the `update_profile` case, add handling for `payrollNumber` -- update the `staff` table's `payroll_number` column

### File: `src/pages/Auth.tsx`
- After successful sign-in (line 38-45), query `profiles` table for status
- If status is `suspended`, toast error message, call `supabase.auth.signOut()`, return early

### Execution Order
1. AdminUserManagement.tsx (missing roles, payroll edit, audit logging)
2. StaffManagement.tsx (N+1 fix, complete roles, cleanup)
3. admin-manage-user edge function (payroll number update)
4. Auth.tsx (suspended user handling)
