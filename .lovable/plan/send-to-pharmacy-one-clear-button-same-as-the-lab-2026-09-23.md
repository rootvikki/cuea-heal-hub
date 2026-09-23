# Send to Pharmacy — one clear button, same as the lab

Medications typed during a consultation are only saved when the doctor presses "Complete & Save" at the end. There is no way to send them to the pharmacy while the consultation is still open, so the pharmacy sees nothing until the visit is closed. This adds a clear send action and makes the whole ordering flow behave the same way for lab, imaging and pharmacy.

## What the doctor sees

- As soon as one medication is added, a green panel appears in the Prescriptions section: **Send 2 medication(s) to Pharmacy**, with the medication count.
- Pressing it saves the prescriptions immediately, so the pharmacy sees the patient right away.
- Medications already sent are shown with a green "Sent to pharmacy" mark and can no longer be removed, so nothing is sent twice.
- More medications can be added and sent afterwards; each send only covers the new ones.
- "Complete & Save" at the end still works exactly as now and quietly sends anything not yet sent.

## Where the patient goes

The patient is only moved to the pharmacy queue when nothing earlier is outstanding — if lab tests or imaging were sent, the patient finishes those first and the pharmacy stage follows, unchanged from today. Sending medications early never pulls a patient out of the lab.

## What the pharmacy sees

- Each prescription card shows a simple progress line: **Prescribed → Sent to Pharmacy → Dispensed**, with the date and time of each step.
- The existing Dispense action is unchanged: stock is deducted, a charge is recorded, and the patient moves on to billing.
- The same progress line appears for doctors and nurses in the patient journey and patient detail views, and for patients in their portal, so everyone can see whether medication has been handed over.

## Consistency across stations

The three ordering sections in the consultation (Lab, Imaging, Prescriptions) will look and behave identically: a coloured send panel with a count, a sent list, and progress you can read at a glance.

## Technical notes

- `src/pages/Consultation.tsx`: extract the prescription insert into a reusable `sendPrescriptions({ encounterId?, moveTicket?, silent? })` mirroring `sendLabOrders`. Track `sentPrescriptionIndexes` / `sentPrescriptions` state, reset in `selectPatient`, and skip already-sent items inside `saveEncounter`. Use `ensureEncounter()` so a visit record and consultation charge exist on first send. Ticket stage on send: only set `at_pharmacy` when no lab or imaging orders have been sent for this encounter; otherwise leave the stage alone. Add loading state and error surfacing identical to the lab flow, plus a `prescriptions_sent` audit event.
- Fetch sent prescriptions for the active encounter (`prescriptions` filtered by `encounter_id`) and subscribe via realtime, same pattern as `fetchPatientLabOrders`.
- New `src/components/PrescriptionTimeline.tsx`: presentational three-step timeline driven by `created_at` and `dispensed_at` (`dispensed` boolean decides the final step). No schema change needed.
- Render it in `src/pages/Pharmacy.tsx` prescription rows, in the consultation's sent-medication list, and read-only in `src/components/PatientJourney.tsx`, `src/components/PatientDetailDialog.tsx`, and the medication section of `src/pages/PatientPortal.tsx`.
- No database migration required; `prescriptions` already carries `dispensed`, `dispensed_at`, `dispensed_by`.
