

## Plan: Auto-Check-In on Patient Registration

**Goal**: When a receptionist registers a patient, automatically create a ticket and send them to triage — eliminating the separate search-and-check-in step.

### Changes

**1. Edge Function (`supabase/functions/register-patient/index.ts`)**
- Return the patient record's UUID (`patientRecordId`) in the response alongside the OPD number, so the client can create a ticket without an extra query.
- For existing patients, also return `visitReason` so routing works correctly.

**2. `PatientRegistrationDialog.tsx`**
- Change `onSuccess` callback signature to pass back patient data: `onSuccess?: (data: { patientRecordId: string; patientId: string; visitReason: string; existing: boolean }) => void`
- Pass the registration result to the callback.

**3. `Reception.tsx`**
- In `handlePatientRegistered`, receive the patient data from registration.
- Auto-create a ticket (same logic as `handleCheckIn`): generate ticket number, determine initial status based on visit reason (dental → `at_dental`, otherwise → `checked_in`).
- Add a department selection step: show a quick "Select Department" dialog, OR auto-select a default department. Since department is required, we'll **auto-open the check-in dialog pre-filled with the newly registered patient** so the receptionist just picks a department and confirms.
- This keeps the flow to: Register → Check-in dialog auto-opens → Pick department → Done.

### Flow After Changes
```text
Register Patient → Dialog closes → Check-in dialog auto-opens (patient pre-filled)
                                    → Receptionist picks department & priority
                                    → Patient goes to triage queue
```

### Technical Details
- The edge function response adds `patientRecordId` (UUID from patients table `id` column) needed to create tickets.
- No database migrations needed — all existing tables support this flow.
- Existing patients (duplicate email) also trigger the auto-check-in flow, skipping re-registration.

