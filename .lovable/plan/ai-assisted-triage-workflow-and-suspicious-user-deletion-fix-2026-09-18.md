# AI-Assisted Triage Workflow and Suspicious-User Deletion Fix

## Triage queue and nurse workflow
- Keep new general patients in **Awaiting Triage**, while dental patients continue directly to Dental.
- Add an atomic **Claim Patient** action so only one nurse can take a waiting patient; the ticket will move to **Triage in Progress** and record the assigned staff member.
- Let the assigned nurse release a claim when needed, while preventing another nurse from editing a claimed patient.
- Add a required three-level clinical urgency choice: **Normal, High, Emergency**.
- On completion, save vitals and the nurse’s final urgency, update the ticket priority, and move both queue status fields together to **Waiting for Doctor**.
- Update reception, staff queue, public queue, and journey labels for the new status.

## AI triage assistant
- Add a secure server-side Lovable AI review using `openai/gpt-6-astra`.
- Send only the selected patient’s recorded symptoms, allergies, vitals, age/sex context when available, and prior-vitals trend; avoid names, email, phone, national ID, and OPD number.
- Return a structured three-level urgency suggestion, concise rationale, red flags, and recommended immediate checks.
- Show the recommendation beside the triage form with a clear clinical-decision notice: AI is advisory, the nurse must explicitly choose and retain the final urgency.
- Save both the AI recommendation and the nurse’s final decision for auditability; log recommendation requests, overrides, claims, releases, and completed triage.
- Surface AI errors clearly without blocking nurses from completing triage manually.

## Real-time arrival alerts
- Use the existing live ticket feed to detect patients newly entering **Awaiting Triage**.
- Show an in-app notification with ticket and urgency information.
- Add an explicit sound control for browser-safe audio cues, remember the local preference, and optionally use browser notifications after staff grant permission.
- Avoid alerts for the initial queue load and prevent duplicate cues from repeated live events.

## Data and access controls
- Add the **Triage in Progress** ticket status and fields on vitals for final urgency plus AI suggestion details.
- Add a protected database action for claim/release concurrency, limited to nurses and authorized clinical/admin roles.
- Preserve existing role-based access and keep older `checked_in` tickets visible until processed.

## Suspicious-user deletion
- Diagnose the uploaded **“Delete failed — Edge Function returned a non-2xx status code”** against the deployed admin action before changing behavior; the available logs do not yet expose the underlying failure.
- Correct the verified server-side cause, keep self-deletion blocked, retain confirmation, and preserve an audit record even after the account is removed.
- Improve the page so future failures show the server’s specific explanation instead of only the generic function error.

## Verification
- Test simultaneous claim attempts, release, AI suggestion generation, manual override, vitals save, urgency ordering, and movement to the doctor queue.
- Verify live in-app alerts, sound opt-in, no initial-load alert storm, and the public queue labels.
- Reproduce and verify suspicious-user deletion with an appropriate test account, then confirm the audit record remains.
- Run the app checks and inspect the triage screens at desktop and mobile widths.

## Technical details
- The ticket table already has an assignment field, and ticket changes are already enabled for real-time updates.
- The current database enum has no in-progress triage value, so the workflow requires a schema migration and synchronized status updates.
- The AI key already exists and remains server-side in the triage assistant function.
