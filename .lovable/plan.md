# Lab Results Go Back to the Doctor

## Problem
When the lab technician finishes entering results, the patient is pushed forward to pharmacy or billing instead of back to the doctor. The "Save & Return to Doctor" button does not work reliably: it saves first (which already moves the patient on), and then the return step finds the patient is no longer at the lab.

## What will change

### Laboratory screen
- One clear main button in the results form: **"Send Results to Doctor"**. It saves the results, marks the test Completed, and — once every test for that visit is done — moves the patient back to the doctor's waiting queue.
- If other tests for the same visit are still in progress, the button saves the result and shows "Results saved — X test(s) still pending; the patient returns to the doctor when all are done."
- The old "Save & Advance" (skip the doctor) is removed so results always go back to the doctor.

### Doctor side
- The doctor gets a notification: "Lab results ready for [patient] — returned to you for review", which opens the consultation.
- The patient reappears in the doctor's queue marked **"Results ready"**.
- In the consultation, the lab progress section shows each completed test's results (values, units, normal range, High/Low flags, notes) so the doctor can review them and continue — prescribing or finishing the visit as usual.

## Technical notes
- `Laboratory.tsx`: refactor `handleSaveResult` to accept no auto-advance; after saving, if no non-completed `lab_orders` remain for the encounter and the ticket is `at_lab`, call `onLabComplete(..., true)` (sets status + workflow_stage `waiting_for_doctor`). Remove the second button and the post-save re-check.
- Notification via existing `announceLabUpdate`/`notifyUser` with link `/consultation`.
- `Consultation.tsx`: queue badge "Results ready" for `waiting_for_doctor` tickets whose encounter has all lab orders completed; extend `fetchPatientLabOrders` to include `result_value`, `result_notes`, `flag` and `lab_result_fields`, and render them under each completed order (read-only).
- No database changes.
