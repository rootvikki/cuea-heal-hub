

# Enhanced User Access Matrix

Adding three improvements to the existing User Access Matrix at `/admin/access-matrix`.

## Changes

### 1. Confirmation Dialog Before Role Toggle
Add an `AlertDialog` that asks "Are you sure you want to [assign/remove] [Role Name] for [User Name]?" before executing the toggle. Prevents accidental clicks.

- File: `src/pages/UserAccessMatrix.tsx`
- Add state for pending toggle action (`pendingToggle`)
- Show `AlertDialog` with role name, user name, and action (assign/remove)
- Only call `toggleRole` on confirm

### 2. Audit Logging for Role Changes
Log every role assignment/removal to the `audit_logs` table using the existing `logAuditEvent` utility.

- File: `src/pages/UserAccessMatrix.tsx`
- Import `logAuditEvent` from `@/lib/auditLog`
- After successful toggle, log with module `"Access Matrix"`, action `"role_assigned"` or `"role_removed"`, and details including target user and role

### 3. Bulk Role Assignment
Add a toolbar action to assign a selected role to multiple users at once.

- File: `src/pages/UserAccessMatrix.tsx`
- Add row selection via checkboxes in the first column
- Add a "Bulk Assign Role" button that opens a dialog with role selector
- On confirm, iterate selected users and insert roles (skipping duplicates)
- Clear selection after completion

### Technical Details

All changes are confined to `src/pages/UserAccessMatrix.tsx`. No database migrations needed — uses existing `user_roles` table and `audit_logs` table with current RLS policies.

