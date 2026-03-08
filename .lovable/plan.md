

# System End-to-End Audit Report

## Issues Found

### 1. CRITICAL: `update-mpesa-config` Edge Function Uses Non-Existent API
- **File**: `supabase/functions/update-mpesa-config/index.ts` line 28
- **Bug**: Uses `supabase.auth.getClaims(token)` which does not exist in the Supabase JS client. This will throw a runtime error every time an admin tries to save M-Pesa settings.
- **Fix**: Replace with `supabase.auth.getUser(token)` to validate the JWT and extract the user ID.

### 2. CRITICAL: `update-mpesa-config` Only Updates, Never Inserts
- **File**: `supabase/functions/update-mpesa-config/index.ts` lines 58-63
- **Bug**: Uses `.update()` for each setting key. If the seeded rows are missing (migration didn't run, or keys don't exist), the update silently does nothing. Should use upsert.
- **Fix**: Replace `.update().eq("key", key)` with `.upsert({ key, value, updated_by, updated_at }, { onConflict: "key" })`.

### 3. MODERATE: Vitals Height Stored Inconsistently
- **File**: `src/pages/Vitals.tsx` line 60
- **Bug**: User enters height in meters (e.g., 1.70). BMI is computed correctly using meters (`w / (h*h)`). But height is stored as `h * 100` (centimeters: 170). This creates confusion when displaying previous vitals (line 258: shows raw DB value with "kg" label pattern, but height shows centimeters without a unit indicator). Not a data corruption issue, just inconsistent display.
- **Fix**: Minor -- display previous vitals height divided by 100, or label it as "cm".

### 4. MODERATE: Console Errors -- Supabase Token Refresh Failures
- **Observation**: The console logs show repeated `TypeError: Failed to fetch` errors from the Supabase auth token refresh. This is a transient network issue (likely the preview environment), not a code bug. No fix needed.

### 5. LOW: `ProtectedLayout` Missing Breadcrumb Rendering
- **File**: `src/components/ProtectedLayout.tsx` line 72
- **Bug**: `PageBreadcrumb` is imported (line 9) but never rendered in the layout. The breadcrumb component was created but not wired into the layout.
- **Fix**: Add `<PageBreadcrumb />` above `{children}` in the main content area.

### 6. LOW: Consultation Hardcodes Consultation Fee
- **File**: `src/pages/Consultation.tsx` line 326
- **Bug**: Consultation fee is hardcoded at `amount: 500`. Should ideally be configurable via `system_settings`.
- **Impact**: Low -- works fine but not configurable.

## Working Correctly (Verified)

- **Auth flow**: Login, suspension check, forgot password -- all properly wired
- **Patient registration**: Edge function with OPD numbering, profile creation, role assignment
- **Queue management**: Check-in, real-time updates, status transitions, dental routing
- **Triage/Vitals**: Form, BMI calculation, nursing procedures, service charge generation, queue advancement
- **Consultation**: Queue panel, encounter creation, prescriptions (with inventory search), lab/imaging ordering, service charges, workflow routing
- **Laboratory**: Structured results with H/L flagging, station queue
- **Imaging**: Order management, result entry, station queue
- **Pharmacy**: Prescription dispensing, inventory management, stock card
- **Billing**: Invoice generation from charges, M-Pesa STK push (correct params), cash/card payments, auto-checkout
- **InterimPayment**: M-Pesa STK push + direct payment methods working
- **M-Pesa STK Push function**: Correct credential lookup from system_settings with env fallback, sandbox/production switching
- **M-Pesa Callback**: Payment recording, invoice update, receipt number tracking
- **Staff Management**: Bulk data fetch (N+1 fixed), department reassignment, full role list
- **Admin User Management**: All 18 roles, payroll editing, audit logging, CRUD operations
- **Patient Portal**: Appointments, lab results, prescriptions, billing with M-Pesa
- **Insurance**: Provider management, claims workflow, pre-authorizations
- **Inpatient**: Ward/bed management, admissions, nursing notes
- **Reports**: PDF generation, charts, department filtering
- **Settings**: Analytics dashboard, M-Pesa config tab, admin templates
- **Role-based access**: Route protection, sidebar filtering, RLS policies
- **Audit logging**: Integrated across all critical operations

## Remediation Plan

### Fix 1: `update-mpesa-config` Edge Function (Critical)
Replace `getClaims` with `getUser` and use upsert instead of update.

### Fix 2: Add Breadcrumb to ProtectedLayout
Render `<PageBreadcrumb />` in the layout.

### Fix 3: Previous Vitals Height Display
Show height in meters (divide stored cm by 100) in the previous vitals display on the Vitals page.

### Execution Order
1. Fix `update-mpesa-config` edge function (getClaims + upsert)
2. Add breadcrumb rendering to ProtectedLayout
3. Fix vitals height display

