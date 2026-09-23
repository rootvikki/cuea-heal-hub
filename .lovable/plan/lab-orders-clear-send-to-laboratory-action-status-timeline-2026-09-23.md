# Lab Orders: Clear "Send to Laboratory" Action + Status Timeline

## Problem

1. In the consultation screen a doctor can tick lab tests, but nothing on screen says how to send them — the only way is the "Complete & Save" button at the bottom, which also ends the consultation.
2. Once tests reach the lab, nobody can see how far along an order is. Only "pending" and "completed" are really used, and there are no timestamps for received, sample collected, or processing.

## What will change

### 1. Send to Laboratory button (consultation)

- In the Lab Tests section, a prominent button appears as soon as one or more tests are ticked: "Send 3 test(s) to Laboratory".
- Pressing it saves the order straight away, adds the lab charges, and moves the patient to the laboratory queue — the doctor can keep writing notes afterwards.
- Tests already sent are shown as a list of sent orders with their current step, so nothing is sent twice.
- The same pattern is added for imaging ("Send to Imaging") so the two sections stay consistent.
- If the consultation has not been started yet, pressing Send creates the visit record first, then sends.
- Clear error messages if a save is blocked; the footer "Complete & Save" still works and no longer re-sends already-sent tests.

### 2. Lab order status timeline

Five steps, shown as a horizontal timeline with the date/time of each completed step:

```text
Sent  →  Received  →  Sample Collected  →  Processing  →  Completed
```

- Doctors and nurses see the timeline (read only) in the consultation orders panel, the patient journey/detail view, and the patient portal lab list.
- Lab staff see it in the laboratory screen with buttons to advance the order: Mark Received, Mark Sample Collected, Start Processing. Entering the result completes it, as it does today.
- Only laboratory staff (and admins) can change the steps.
- Each step change is recorded in the activity log.

## Technical notes

- Migration on `public.lab_orders`: add `received_at`, `processing_started_at`, `completed_at` timestamps; backfill `completed_at` from `result_entered_at` for existing completed rows; keep `status` as the single source of truth with values `pending`, `received`, `collected`, `in_progress`, `completed`. Add `received_by`, `collected_by`, `processed_by` (staff references, nullable).
- RLS: new UPDATE policy on `lab_orders` limited to `lab_technician`, `admin`, `super_admin` (existing SELECT/INSERT policies unchanged).
- New `src/components/LabOrderTimeline.tsx` — presentational component taking a lab order row, rendering the 5 steps with completed/current/pending styling using existing design tokens; optional `actions` mode for lab staff.
- `src/pages/Consultation.tsx`: extract the existing lab/imaging insert + service-charge + ticket-stage logic from `handleSaveEncounter` into reusable `sendLabOrders()` / `sendImagingOrders()` used by both the new buttons and the final save; track `sentLabTestIds` / `sentImagingIds` state so the final save skips them; ensure encounter exists via a `ensureEncounter()` helper.
- `src/pages/Laboratory.tsx`: status colours extended for `received`; per-row advance buttons calling a small `advanceLabOrder(order, nextStatus)` helper that stamps the matching timestamp, staff id, and audit entry; status filter tabs updated.
- Read-only timeline wired into `PatientJourney.tsx`, `PatientDetailDialog.tsx`, and the lab section of `PatientPortal.tsx`.
- Ticket routing to `at_lab` continues to keep `status` and `workflow_stage` in sync.
