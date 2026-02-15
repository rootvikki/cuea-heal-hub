

# M-Pesa STK Push Integration and Payment Improvements

## Current Issues Found

1. **Parameter name mismatch**: `Billing.tsx` sends `phone_number`, `invoice_id`, `account_reference` but the edge function expects `phoneNumber`, `invoiceId`, `accountReference` -- STK Push silently fails every time
2. **InterimPayment has no M-Pesa support**: When a user selects "M-Pesa" as payment method in the InterimPayment dialog, it just records the payment without triggering the STK Push prompt on the patient's phone
3. **No M-Pesa credentials management UI**: Admins must configure credentials externally; there is no in-app settings panel
4. **Billing immediately marks payment "completed"**: When M-Pesa is selected, the code records payment as completed before the callback confirms it -- this is incorrect for STK Push which is asynchronous

---

## Plan

### 1. Fix Billing.tsx -- M-Pesa STK Push Integration

- Fix the parameter names to match the edge function (`phoneNumber`, `invoiceId`, `accountReference`)
- For M-Pesa payments: only trigger the STK Push and show "Waiting for confirmation" -- do NOT immediately record the payment as completed (the callback edge function already handles creating the payment record and updating the invoice)
- For cash/insurance payments: keep the existing immediate recording behavior
- Add a dedicated "Send M-Pesa STK Push" button in the payment dialog that is visually distinct (green, with phone icon)

### 2. Add M-Pesa STK Push to InterimPayment Component

- When "M-Pesa" is selected as payment method, show a phone number input field
- Add an "Send STK Push" button that calls the `mpesa-stk-push` edge function with the correct parameters
- For M-Pesa: only trigger STK push (callback handles the rest); show toast "Check phone to complete payment"
- For other methods (cash, card, insurance): keep existing direct payment recording

### 3. Add M-Pesa Settings to Settings Page

- Add a new "M-Pesa Config" tab in the Settings page (visible only to super_admin/admin)
- The tab will contain a form with fields for:
  - Consumer Key
  - Consumer Secret
  - Shortcode (Business Short Code)
  - Passkey
  - Environment toggle (Sandbox vs Production)
- These values are stored as backend secrets (not in the database) so the form will use an edge function to update them
- Create a new `update-mpesa-config` edge function that:
  - Validates the caller is an admin/super_admin
  - Stores the credentials as secrets
  - Optionally stores the environment mode (sandbox/production) in a `system_settings` table

### 4. Database: Create system_settings Table

- A simple key-value table for storing non-secret system configuration like M-Pesa environment mode
- Columns: `id`, `key` (unique text), `value` (text), `updated_by` (uuid), `updated_at`
- RLS: only admin/super_admin can read/write

### 5. Update mpesa-stk-push Edge Function

- Read environment setting from `system_settings` table to determine sandbox vs production URL
- Fix CORS headers to include all required Lovable headers
- Keep existing logic otherwise

---

## Technical Details

### File: `src/pages/Billing.tsx`
- Fix STK push call parameters: `phone_number` to `phoneNumber`, `invoice_id` to `invoiceId`, `account_reference` to `accountReference`
- When `paymentMethod === "mpesa"`: call STK push, show success toast, close dialog, but do NOT insert into payments or update invoice (callback does this)
- When other methods: keep existing direct payment recording

### File: `src/components/InterimPayment.tsx`
- Add `phoneNumber` state
- Show phone input when method is "mpesa"
- When method is "mpesa": call `mpesa-stk-push` edge function instead of direct payment insert
- When other methods: keep existing behavior

### File: `src/pages/Settings.tsx`
- Add "M-Pesa" tab (admin only) with credential input form
- Form submits to `update-mpesa-config` edge function
- Show current environment mode (sandbox/production) with a toggle switch
- Show status indicator for whether credentials are configured

### New Edge Function: `supabase/functions/update-mpesa-config/index.ts`
- Accepts: `consumerKey`, `consumerSecret`, `shortcode`, `passkey`, `environment` (sandbox/production)
- Validates caller is admin/super_admin via JWT claims
- Note: Since we cannot dynamically set Deno secrets at runtime, the credentials will be stored in a `system_settings` table (encrypted conceptually -- the RLS ensures only admins can read them)
- The `mpesa-stk-push` function will be updated to read from `system_settings` first, falling back to environment secrets

### Database Migration
- Create `system_settings` table with RLS for admin-only access
- Seed default M-Pesa environment as "sandbox"

### File: `supabase/functions/mpesa-stk-push/index.ts`
- Update CORS headers to include full Lovable headers
- Read M-Pesa credentials from `system_settings` table (with fallback to env secrets)
- Use environment setting to switch between sandbox and production Safaricom URLs

### Execution Order
1. Database migration (create system_settings table)
2. Create `update-mpesa-config` edge function
3. Update `mpesa-stk-push` edge function (read from system_settings, fix CORS)
4. Fix `Billing.tsx` (parameter names, async M-Pesa flow)
5. Update `InterimPayment.tsx` (add M-Pesa STK push support)
6. Update `Settings.tsx` (add M-Pesa config tab)

