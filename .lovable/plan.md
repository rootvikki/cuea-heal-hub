

# Full System Audit -- Role Visibility, Forms UX, and Workflow Fixes

## Issues Found

### CRITICAL: N+1 Query Patterns

**Appointments.tsx** (lines 60-103): Fires 2 DB queries per appointment (patient + department) in a loop. For 20 appointments = 40+ queries. Also `fetchPatients` (line 113-128) fires 1 query per patient.

**Records.tsx** (lines 43-99): Fires 3 DB queries per encounter (patient, profile, department) in a loop. Same N+1 in `fetchPatients`.

**Fix**: Replace loops with single queries using Supabase joins, matching the pattern already used in Queue.tsx and Consultation.tsx.

### CRITICAL: Appointments.tsx Missing `patient_id` in SELECT

Line 60: `select("id, appointment_date, status, reason, department_id")` omits `patient_id`, so the N+1 workaround for patient data breaks silently. Need to add `patient_id` or use a proper join.

### MODERATE: Vitals -- Nursing Notes Not Saved

The `nursingNotes` field exists in the form (line 235) but is never included in the `vitals.insert()` call (lines 58-68). The vitals table has no `nursing_notes` column. These notes are silently lost.

**Fix**: Since the vitals table lacks the column, save nursing notes as a nursing_procedure entry of type "nursing_notes" or add a notes field.

### MODERATE: Dental -- No Encounter Record Created

Dental procedures are saved but no `encounter` record is created. This means dental visits have no SOAP notes, no clinical record, and the patient journey view in Consultation won't show dental history.

**Fix**: Create a minimal encounter record when dental procedures are saved, linking to the ticket.

### MODERATE: PatientPortal -- M-Pesa Param Mismatch

PatientPortal (line 174) sends `phone_number` and `account_reference`, while Billing.tsx sends `phoneNumber` and `accountReference`. The edge function likely expects one format -- this could cause silent payment failures from the portal.

**Fix**: Standardize to match the edge function's expected parameters.

### MODERATE: Records.tsx -- Bypasses Workflow

The Records page lets doctors create standalone encounters without a ticket, bypassing the triage > consult > billing workflow. No service charges, no ticket advancement.

**Fix**: Remove the standalone "New Encounter" button from Records. Encounters should only be created via the Consultation workflow. Records page becomes read-only history.

### LOW: clinical_officer Missing from RLS Policies

The `clinical_officer` role is defined in routes but missing from:
- `vitals` table RLS (only allows doctor, nurse, admin, super_admin)
- `encounters` table (needs checking)

Clinical officers can access the Vitals and Consultation pages via routes but their DB operations may fail silently.

### LOW: Forms UX Improvements Needed

- **Appointments form**: No patient search -- dumps all patients in a raw dropdown. Should add search like Queue check-in does.
- **Records form**: Same issue -- no search in patient dropdown.
- **Consultation encounter form**: Has many empty textareas with no guided structure beyond placeholders. Add field-level help text.
- **Pharmacy dispensing**: No confirmation dialog before dispensing (irreversible stock deduction).

### LOW: PatientPortal Layout Inconsistency

PatientPortal wraps itself in its own `SidebarProvider` + `AppSidebar` instead of using `ProtectedLayout`. This means no breadcrumb, no standardized mobile header, no suspension guard from ProtectedLayout.

---

## Remediation Plan

### Phase 1: Fix N+1 Queries (Appointments + Records)

**Appointments.tsx**:
- Replace `fetchAppointments` with single query using joins: `select("*, patients!inner(patient_id, user_id, profiles!inner(full_name)), departments!inner(name)")`
- Replace `fetchPatients` with joined query: `select("id, patient_id, user_id, profiles!inner(full_name)")`
- Add patient search Input to the "New Appointment" dialog (same pattern as Queue check-in)

**Records.tsx**:
- Replace `fetchEncounters` with single query using joins
- Replace `fetchPatients` with joined query
- Remove "New Encounter" button -- make page read-only (encounters only via Consultation)
- Add patient search to view encounters by patient

### Phase 2: Fix Data Integrity Issues

**Vitals.tsx**:
- Save `nursingNotes` as a nursing_procedure of type "nursing_notes" when non-empty

**Dental.tsx**:
- Create a minimal encounter record (`chief_complaint: "Dental Visit"`, `assessment: procedures list`) when saving dental procedures
- Link encounter_id to dental_procedures records

**PatientPortal.tsx**:
- Fix M-Pesa params to use `phoneNumber` and `accountReference` (matching edge function)

### Phase 3: RLS Policy Fix

- Add `clinical_officer` to vitals table RLS policy (DB migration)
- Verify encounters table includes `clinical_officer`

### Phase 4: Forms UX Polish

**Appointments.tsx** -- New Appointment dialog:
- Add search Input above patient Select (same pattern as Queue check-in dialog)
- Filter patients by search term

**Pharmacy.tsx** -- Add confirmation dialog before dispensing:
- Show medication name, quantity to deduct, remaining stock
- Require explicit "Confirm Dispense" click

**PatientPortal.tsx** -- Layout:
- Switch from own SidebarProvider to ProtectedLayout pattern for consistency
- Or at minimum, ensure the mobile header and suspension guard are present

### Phase 5: Consultation Form Enhancements

- Add field-level descriptions/hints below key textareas (e.g., "Include onset, duration, aggravating/relieving factors" under HPI)
- Add visual section headers with icons to match the Vitals form pattern
- Add auto-save to localStorage (draft indicator)

---

## Technical Details

### Appointments.tsx
- Lines 54-106: Replace entire `fetchAppointments` with single join query
- Lines 113-128: Replace `fetchPatients` with `patients.select("id, patient_id, user_id, profiles!inner(full_name)")`
- Lines 241-300: Add search Input to dialog, filter patients in Select

### Records.tsx
- Lines 43-82: Replace with single join query
- Lines 84-99: Replace with single join query
- Lines 173-287: Remove DialogTrigger + Dialog for new encounters (read-only page)

### Vitals.tsx
- Lines 67-68: After vitals insert, if `form.nursingNotes` is non-empty, insert a nursing_procedure

### Dental.tsx
- Lines 65-91: Before inserting dental_procedures, create an encounter record, use its ID

### PatientPortal.tsx
- Lines 173-179: Change `phone_number` to `phoneNumber`, `account_reference` to `accountReference`

### DB Migration
- Add `clinical_officer` to vitals RLS policy

### Execution Order
1. Appointments.tsx (N+1 fix + patient search in form)
2. Records.tsx (N+1 fix + make read-only)
3. Vitals.tsx (save nursing notes)
4. Dental.tsx (create encounter record)
5. PatientPortal.tsx (fix M-Pesa params)
6. Pharmacy.tsx (dispense confirmation)
7. DB migration (clinical_officer RLS)

