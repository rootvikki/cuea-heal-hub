
# Streamline CUEA Infirmary - Complete Functional Fix

After a thorough audit of every workflow path, database schema, and page interaction, here are the concrete issues and fixes needed.

---

## Critical Issues Found

### 1. Queue Check-in Does NOT Set `workflow_stage`
**File**: `src/pages/Queue.tsx` (line 144-150)
The ticket insert sets `status: "checked_in"` but never sets `workflow_stage`. Since all station pages (Triage, Lab, etc.) filter by `workflow_stage`, newly checked-in patients are invisible to every station.

### 2. Queue Manual Status Buttons Only Update `status`, Not `workflow_stage`
**File**: `src/pages/Queue.tsx` (line 170-188)
The `updateTicketStatus` function updates only `status`, leaving `workflow_stage` out of sync. This breaks the entire station queue system.

### 3. Patient Registration Hijacks Receptionist Session
**File**: `src/components/PatientRegistrationDialog.tsx` (line 62)
Uses `supabase.auth.signUp()` which replaces the current user's session with the newly created patient account. The receptionist gets logged out after every registration.

### 4. QueueDisplay Uses `ticket.status` Instead of `workflow_stage` for Badges
**File**: `src/pages/QueueDisplay.tsx` (line 234, 313, 320, 359)
The "Now Serving" badges and "Waiting Queue" filter use `ticket.status` instead of `ticket.workflow_stage`, causing mismatched display after workflow transitions.

### 5. StationQueue `completeAndAdvance` Only Updates `workflow_stage`, Not `status`
**File**: `src/components/StationQueue.tsx` (line 61-70)
This leaves `status` and `workflow_stage` out of sync, breaking the Queue page and QueueDisplay which filter by `status`.

### 6. Dashboard Quick Actions Are Non-Functional
**File**: `src/pages/Dashboard.tsx` (lines 138-149)
The three quick action buttons (Register, Appointment, Check-in) are plain buttons with no click handlers.

### 7. Consultation Auto-Starts on Queue Click
**File**: `src/pages/Consultation.tsx` (line 210-212)
Clicking any patient in the queue immediately sets them to `in_consult` workflow stage, even if the doctor is just browsing the list.

---

## Fix Plan

### Phase 1: Core Workflow Synchronization

**A. Fix Queue.tsx - Set `workflow_stage` on check-in + sync status updates**
- Add `workflow_stage: "checked_in"` to the ticket insert
- Update `updateTicketStatus` to set both `status` AND `workflow_stage` simultaneously
- Replace the manual status transition buttons with a clean read-only workflow progress indicator (showing current stage as a visual stepper instead of clickable buttons)

**B. Fix StationQueue.tsx - Sync both fields on advance**
- Update `completeAndAdvance` to set both `workflow_stage` AND `status` to `nextStage`

**C. Fix QueueDisplay.tsx - Use `workflow_stage` consistently**
- Change all `ticket.status` references to `(ticket.workflow_stage || ticket.status)` for badge colors, filtering, and display

### Phase 2: Patient Registration - Server-Side

**D. Create `register-patient` edge function**
- New edge function that uses the service role key to create patient accounts
- Accepts: patient details, admin's user ID
- Creates: auth user, profile, patient record, patient role
- Returns: OPD number and temp password
- Does NOT affect the receptionist's active session

**E. Update PatientRegistrationDialog.tsx**
- Replace `supabase.auth.signUp()` with a call to the new `register-patient` edge function
- Pass `adminUserId` from the current session
- Add audit logging for patient registration

### Phase 3: UX and Navigation Fixes

**F. Wire Dashboard Quick Actions**
- "Register New Patient": Open the PatientRegistrationDialog inline
- "Create Appointment": Navigate to `/appointments`
- "Check-in Patient": Navigate to `/queue`

**G. Fix Consultation Queue - Don't auto-start on click**
- Separate patient selection (just preview info) from starting a consultation
- Add a visible "Start Consultation" button that the doctor must click to set the ticket to `in_consult`
- Clicking a patient in the queue only shows their details without changing any workflow state

### Phase 4: Consistency Polish

**H. Vitals.tsx - Sync both fields**
- The save handler already updates `workflow_stage` to `waiting_for_doctor` but does not update `status`. Add `status` update.

**I. Consultation.tsx - Sync both fields**
- The `saveEncounter` function updates `workflow_stage` but not `status`. Add `status` update.

---

## Technical Details

### New Edge Function: `supabase/functions/register-patient/index.ts`
- Uses `SUPABASE_SERVICE_ROLE_KEY` (already available)
- Creates user via `supabase.auth.admin.createUser()`
- Inserts profile, patient record, and `user_roles` entry with "patient" role
- Returns OPD number

### Files to Modify
| File | Change |
|------|--------|
| `src/pages/Queue.tsx` | Add `workflow_stage` to insert; sync both fields in status update; replace manual buttons with progress display |
| `src/components/StationQueue.tsx` | Update both `status` + `workflow_stage` in `completeAndAdvance` |
| `src/pages/QueueDisplay.tsx` | Use `workflow_stage` for badge colors and filters |
| `src/components/PatientRegistrationDialog.tsx` | Call `register-patient` edge function instead of `signUp` |
| `src/pages/Dashboard.tsx` | Wire quick action buttons with navigation and dialog |
| `src/pages/Consultation.tsx` | Separate select from start; sync both fields on save |
| `src/pages/Vitals.tsx` | Sync `status` alongside `workflow_stage` |
| `supabase/functions/register-patient/index.ts` | New file |

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/functions/register-patient/index.ts` | Server-side patient creation without session hijack |

### Implementation Order
1. Create `register-patient` edge function and deploy
2. Fix `Queue.tsx` (workflow_stage on insert + sync updates + remove manual buttons)
3. Fix `StationQueue.tsx` (sync both fields)
4. Fix `PatientRegistrationDialog.tsx` (use edge function)
5. Fix `QueueDisplay.tsx` (use workflow_stage)
6. Fix `Vitals.tsx` and `Consultation.tsx` (sync both fields)
7. Wire Dashboard quick actions
8. Fix Consultation auto-start behavior
