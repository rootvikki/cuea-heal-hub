

# System-Wide Form UX Redesign + Patient Journey Timeline

## What We're Building

Two things:
1. **A reusable Patient Journey Timeline component** that shows workflow progress visually on every station page
2. **Form space and usability improvements** across Pharmacy, Laboratory, Imaging, Billing, and Dental — the pages that were missed in the previous redesign pass

The Vitals, Consultation, Patient Registration, Queue, Appointments, and Staff Onboarding forms were already upgraded with `h-12` inputs, `text-base`, and generous spacing. The remaining pages still use cramped default-sized inputs.

## Changes

### 1. New Component: `WorkflowTimeline.tsx`

A horizontal step indicator showing the patient's current position in the workflow. Each station page will render it in the patient header area.

```text
[✓ Check-in] → [✓ Triage] → [● Consultation] → [ Lab ] → [ Pharmacy ] → [ Billing ]
                                  ↑ current
```

- Props: `currentStage: string`, `ticketId?: string`
- Derives the full flow from the stage (handles lab/imaging/dental branches)
- Completed steps shown with green checkmark, current step highlighted with primary color, future steps muted
- Compact single-line design that fits in any page header

### 2. Pharmacy Forms (`Pharmacy.tsx`)

- "Add Drug" dialog: increase all inputs to `h-12 text-base`, grid gap from `gap-4` to `gap-5`, add field hints
- Drug search input in header: `h-12 text-base`
- Labels: `text-sm font-semibold`
- Add `WorkflowTimeline` to the patient header area
- Add the timeline when a ticket is selected

### 3. Laboratory Forms (`Laboratory.tsx`)

- Result entry dialog: increase inputs to `h-12 text-base`
- Structured result fields: increase from default to `h-11 text-sm`
- Search input: `h-12 text-base`
- Add `WorkflowTimeline` when viewing a patient's order

### 4. Imaging Forms (`Imaging.tsx`)

- Result entry dialog: increase textarea rows to 5, inputs to `h-12 text-base`
- Search input: `h-12 text-base`
- Add `WorkflowTimeline` in header area

### 5. Billing Page (`Billing.tsx`)

- Payment dialog: increase all inputs to `h-12 text-base`
- Charge sheet dialog: improve spacing
- Add `WorkflowTimeline` when viewing a patient's charges

### 6. Dental Page (`Dental.tsx`)

- Procedure form: increase inputs to `h-12 text-base`, gap to `gap-5`
- Notes textarea: rows 4, `text-base`
- Add `WorkflowTimeline` in patient header

### 7. Integration in Already-Updated Pages

- Add `WorkflowTimeline` to Vitals and Consultation patient headers (small addition to existing files)

## Files Changed

- **New**: `src/components/WorkflowTimeline.tsx`
- **Edit**: `src/pages/Pharmacy.tsx` — bigger forms + timeline
- **Edit**: `src/pages/Laboratory.tsx` — bigger forms + timeline
- **Edit**: `src/pages/Imaging.tsx` — bigger forms + timeline
- **Edit**: `src/pages/Billing.tsx` — bigger forms + timeline
- **Edit**: `src/pages/Dental.tsx` — bigger forms + timeline
- **Edit**: `src/pages/Vitals.tsx` — add timeline
- **Edit**: `src/pages/Consultation.tsx` — add timeline

No database changes needed.

