# Awaiting Triage After Check-In

## Changes
- Route every non-dental reception check-in directly to the triage stage while keeping `status` and `workflow_stage` synchronized.
- Apply the same behavior to appointment check-ins from both appointment screens.
- Display the triage stage as “Awaiting Triage” in reception, the queue list, and the public queue display.
- Preserve the existing direct-to-dental path for dental visits.

## Verification
- Confirm the app builds successfully.
- Check that the triage station still receives newly checked-in patients and the visible queue wording is “Awaiting Triage.”

## Technical details
- Use the existing `triage` ticket enum value rather than introducing a new database status.
- Keep support for older `checked_in` tickets in the triage station during the transition.
