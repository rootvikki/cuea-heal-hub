

## Plan: Streamline Reception & Fix Check-in to be 100% Functional

### Root Cause of Current Issues

From the network data, patient `OPD-2026-0001` has `full_name: ""` in profiles. The `handle_new_user` trigger fires first and creates a blank profile before the edge function's upsert runs. The edge function upsert should fix it, but there's a race condition. Additionally, the existing broken record needs a data fix.

### Changes

#### 1. Fix Edge Function: Ensure Profile Name is Always Written
**File**: `supabase/functions/register-patient/index.ts`
- After creating the auth user, add a brief delay or do the profile upsert with an explicit `UPDATE` fallback
- More importantly: change `handle_new_user` trigger to properly pull `full_name` from `raw_user_meta_data` (it already does, but the edge function passes it as user_metadata which maps correctly)
- The real fix: the profile upsert in the edge function must use service role client (it does), so ensure `full_name` column is actually being updated. Add explicit error checking on the upsert result.

#### 2. Fix Existing Broken Data
**Database migration**: Update the profile for `OPD-2026-0001` user to set `full_name` from the `auth.users.raw_user_meta_data`

#### 3. Streamline Reception Page
**File**: `src/pages/Reception.tsx`
- **Auto-select default department**: If only one department exists, pre-select it in check-in form
- **Show patient name prominently** in search results with fallback to national ID / patient ID when name is blank
- **Add loading states** to check-in button to prevent double-clicks
- **After registration → check-in flow**: Ensure the check-in dialog auto-populates department and displays all patient info correctly
- **Show visit reason badge** in search results so receptionist knows dental vs outpatient before clicking check-in
- **Display patient type badge** (staff/student/outsider) in search results

#### 4. Harden the Check-in Flow
**File**: `src/pages/Reception.tsx`
- Add loading state to `handleCheckIn` and `handleCheckInFromAppointment` to prevent double submissions
- After successful check-in, invalidate both `reception-queue` and `reception-patients` queries
- Show the generated ticket number more prominently in the success toast

#### 5. Fix Profile Display Across Stations
**File**: `src/components/StationQueue.tsx`  
- Add fallback: if `full_name` is empty, show patient_id or "Name pending" with a warning style
- Same fallback in `PatientSummaryCard.tsx`

### Technical Details

- **Database migration**: `UPDATE profiles SET full_name = u.raw_user_meta_data->>'full_name' FROM auth.users u WHERE profiles.user_id = u.id AND (profiles.full_name IS NULL OR profiles.full_name = '');` — This fixes all existing blank names.
- **Edge function**: Add error logging on the profile upsert so failures are visible. Ensure the upsert returns data and check for errors.
- **Reception.tsx**: Add `isCheckingIn` state boolean, disable submit button while in progress. Pre-select department if only one exists via `useEffect`.
- No new dependencies needed.

