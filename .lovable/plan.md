

# Restrict Patient Medical Records to Doctors Only

Currently, clinical records (encounters with diagnoses, SOAP notes, chief complaints) are visible to nurses, clinical officers, and records officers in addition to doctors. This plan restricts that clinical data so only doctors (and admins) can see it.

---

## What Changes

### 1. Route Access -- `/records` page
- Change the allowed roles from `[...CLINICAL_ROLES, "records_officer"]` to `["doctor", "clinical_officer"]` only
- Nurses and records officers will no longer be able to access the Medical Records (EMR) page

### 2. Patient Detail Dialog -- Hide clinical tabs for non-doctors
- The `PatientDetailDialog` component (used from the Patients page) currently shows **Visits**, **Labs**, and **Rx** tabs to everyone who can open it
- For non-doctor roles, hide the **Visits** (encounters) tab entirely since it contains diagnoses and SOAP notes
- Labs and Rx tabs will remain visible to their respective roles (lab techs see labs, pharmacists see prescriptions) as they already have RLS protection

### 3. Database RLS -- Tighten encounters SELECT policy
- Update the encounters SELECT policy to allow only `doctor`, `clinical_officer`, `admin`, and `super_admin`
- Remove `nurse` and `records_officer` from the encounters SELECT policy so even if the UI has a gap, the database enforces doctor-only access to clinical notes

### 4. Reports page
- The clinical report in `Reports.tsx` queries encounters -- this is already behind admin-level route access, so no change needed there

---

## Technical Details

### File: `src/App.tsx`
- Change `/records` route allowed roles from `[...CLINICAL_ROLES, "records_officer"]` to `["doctor", "clinical_officer"]`

### File: `src/components/PatientDetailDialog.tsx`
- Import `useUser` hook
- Conditionally render the "Visits" tab only when the user has a `doctor` or `clinical_officer` role
- Skip fetching encounters data for non-doctor users

### Database Migration
- Drop existing encounters SELECT policy that includes nurses
- Create new restrictive SELECT policy: only `doctor`, `clinical_officer`, `admin`, `super_admin` can read encounters

### Execution Order
1. Database migration (tighten RLS on encounters)
2. Update route access in `App.tsx`
3. Update `PatientDetailDialog.tsx` to hide clinical tabs for non-doctors

