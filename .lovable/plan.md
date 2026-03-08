

# System-Wide Form UX Redesign -- Bigger Inputs, Better Layouts

## Current Issues

After reviewing all key form pages, these UX problems are consistent across the system:

1. **Small input fields**: Default `h-10` height is too small for clinical use -- staff often wear gloves or use touch screens. Forms feel cramped.
2. **Vitals form (Vitals.tsx)**: Inputs are standard-sized with minimal spacing. No visual feedback for abnormal values as they are typed. The presenting complaint textarea is only 3 rows.
3. **Consultation prescription dialog**: Inputs use `h-9` and `text-xs` -- too small for a critical ordering workflow.
4. **Patient Registration (PatientRegistrationDialog.tsx)**: Dense form crammed into a dialog. Standard-sized inputs with `space-y-2` feels tight.
5. **Queue Check-in dialog**: Standard dialog with small inputs.
6. **Appointments dialog**: Same pattern -- small inputs in cramped dialog.
7. **Staff Onboarding**: Standard input sizing, no field-level hints or descriptions.
8. **Billing page**: Standard compact layout.

## Remediation Plan

### Phase 1: Global Input Size Enhancement

Create a reusable "big input" pattern by updating the key form components:
- Increase default Input height from `h-10` to `h-12` across all clinical forms
- Increase Textarea minimum rows from 2-3 to 4-5 for clinical text
- Add larger touch targets for Select triggers
- Increase label font weight and size for clinical forms

### Phase 2: Vitals.tsx -- Premium Triage Form

- Make input fields `h-12` with larger text (`text-base` instead of default)
- Add real-time visual feedback: color the BP input border red/amber/green as values are typed
- Make Presenting Complaint textarea 5 rows with guided placeholder
- Make Nursing Notes textarea 4 rows
- Add animated vitals icons beside each section header
- Increase grid gap from `gap-4` to `gap-5`
- Add a summary card at the bottom showing all entered values before save

### Phase 3: PatientRegistrationDialog.tsx -- Premium Registration

- Increase dialog max width from `max-w-4xl` to `max-w-5xl`
- Make all inputs `h-12` with `text-base`
- Add field descriptions below critical fields (phone format, password requirements)
- Make section headers larger with colored left borders
- Add visual progress indicator showing which sections are complete
- Increase grid spacing to `gap-5`

### Phase 4: Consultation.tsx -- Prescription & Orders Polish

- Increase prescription dialog inputs from `h-9` to `h-11`
- Make drug search input prominent (`h-12`, `text-base`)
- Increase textarea rows in clinical notes from 2-3 to 4-5
- Make the Chief Complaint input `h-12` with larger text since it's the most important field
- Increase duration quick-fill buttons from `h-6` to `h-8`
- Make diagnosis tag input `h-12`

### Phase 5: Queue.tsx & Appointments.tsx -- Check-in/Booking Polish

- Increase check-in dialog inputs to `h-12`
- Add patient avatar/icon beside search results
- Make priority selector more visual (colored radio cards instead of dropdown)
- Make appointment reason field a larger textarea (3 rows)

### Phase 6: StaffOnboarding.tsx -- Form Enhancement

- Increase all inputs to `h-12`
- Add field-level hint text for email, payroll, phone format
- Make role selection cards larger and more visual

## Technical Approach

All changes are CSS/layout adjustments within existing components -- no database changes needed. The pattern is consistent:
- Replace `h-10` / `h-9` inputs with `h-12`
- Replace `text-xs` / `text-sm` with `text-sm` / `text-base` on input values
- Replace `rows={2}` / `rows={3}` with `rows={4}` / `rows={5}` on clinical textareas
- Replace `gap-4` with `gap-5` or `gap-6` on form grids
- Add `text-xs text-muted-foreground` hint paragraphs below labels

### Files Changed
- `src/pages/Vitals.tsx` -- Larger inputs, real-time vital feedback, summary card
- `src/pages/Consultation.tsx` -- Larger clinical notes, prescription dialog, diagnosis input
- `src/components/PatientRegistrationDialog.tsx` -- Bigger inputs, field hints, progress
- `src/pages/Queue.tsx` -- Bigger check-in form, visual priority
- `src/pages/Appointments.tsx` -- Bigger booking form
- `src/pages/StaffOnboarding.tsx` -- Bigger inputs, hints

### Execution Order
1. Vitals.tsx (most critical clinical form)
2. Consultation.tsx (prescription dialog + clinical notes sizing)
3. PatientRegistrationDialog.tsx (registration form)
4. Queue.tsx + Appointments.tsx (check-in forms)
5. StaffOnboarding.tsx (admin form)

