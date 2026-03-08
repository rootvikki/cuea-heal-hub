

## Plan: Fix OPD-2026-0001 Data & Enhance Patient Summary Card

### Problem
Patient OPD-2026-0001 (user_id: `ab223b80-b5d0-4789-a308-32732d6809c9`) has empty `full_name`, `phone`, `gender`, and `date_of_birth` in the profiles table. This happened because the registration reused an existing admin account (morgan@cuea.edu), and the profile upsert likely failed silently because the `profiles.user_id` column may lack a unique constraint needed for `ON CONFLICT`.

### Changes

#### 1. Database Migration: Fix Broken Data + Ensure Unique Constraint
- Add a unique constraint on `profiles.user_id` if missing (required for upsert `onConflict` to work).
- Update OPD-2026-0001's profile from the patients table data since we know: national_id=39393933939, payroll_number=90375, patient_type=cuea_staff, insurance_provider=Pacis.
- Also backfill any other blank profiles from `auth.users.raw_user_meta_data`.

#### 2. Enhance PatientSummaryCard with Demographics Section
**File**: `src/components/PatientSummaryCard.tsx`
- Add a new "Demographics" accordion section showing: gender, DOB/age, phone, national ID, payroll/admission number, next of kin.
- Fetch additional fields from patients table: `national_id`, `payroll_number`, `admission_number`, `next_of_kin_name`, `next_of_kin_phone`.
- Add age calculation from DOB.
- Show a red "Incomplete Profile" warning badge in the header if key fields (name, phone, DOB) are missing, so staff can flag it before advancing.

#### 3. Edge Function: Add Explicit Update After Upsert
**File**: `supabase/functions/register-patient/index.ts`
- After the upsert, always do an explicit UPDATE as a belt-and-suspenders approach to guarantee the profile is written, regardless of constraint issues.
- Add a verification read after write to log if the name is still blank.

### Technical Details
- Migration SQL will use `ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS` for the unique constraint, then UPDATE the specific record.
- The PatientSummaryCard will expand its query to include `national_id, payroll_number, admission_number, next_of_kin_name, next_of_kin_phone` from the patients table.
- Age display: calculated as "X yr Y mo" from `date_of_birth`.
- No new dependencies needed.

