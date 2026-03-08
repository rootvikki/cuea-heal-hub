

# Consultation Page -- World-Class Design Overhaul

## Issues Found

1. **ReferralForm not controllable**: The `showReferralForm` state exists but is never passed to `ReferralForm` -- it manages its own `open` state internally via `DialogTrigger`. The Referral button in the header does nothing useful.
2. **Right vitals panel hidden below XL**: On laptop screens (< 1280px), doctors lose access to vitals entirely -- critical clinical data invisible.
3. **No save confirmation**: Clicking "Complete & Save" immediately saves and advances the patient with no summary review. Accidental clicks are irreversible.
4. **No triage auto-fill**: The presenting complaint from triage is shown as a blue info box but requires manual copy into Chief Complaint.
5. **Clinical Notes tab is a long scroll**: 8+ form sections in a single scroll with no visual grouping beyond cards -- hard to orient.
6. **Orders tab has no cost summary**: Doctor can't see total estimated cost of their orders before saving.
7. **Prescription dialog missing route of administration**: Common clinical field omitted.

## Remediation Plan

### 1. Fix Referral Form Integration
- Pass `open` and `onOpenChange` props to control `ReferralForm` from the header button, or trigger its internal dialog externally.

### 2. Make Vitals Accessible on All Screens
- Add a collapsible vitals summary strip below the patient header bar (visible on < XL screens).
- Keep the right panel on XL+ as-is.

### 3. Add Save Confirmation Dialog
- Before `saveEncounter()`, show an `AlertDialog` with:
  - Patient name, diagnosis list
  - Order counts (Rx, Labs, Imaging)
  - Next workflow destination
  - "Confirm & Send" / "Go Back" buttons

### 4. Auto-fill Chief Complaint from Triage
- When selecting a patient, if triage `presenting_complaint` exists and `chiefComplaint` is empty, pre-fill it.
- Show "(from triage)" indicator so doctor knows it was auto-filled.

### 5. Organize Clinical Notes with Step Sections
- Group the encounter tab into 3 collapsible accordion sections:
  - **History** (Chief Complaint, HPI, PMH, PSH, Medication, Social)
  - **Examination** (Subjective, Objective/Physical Exam)
  - **Assessment & Plan** (Assessment/Diagnosis, Plan, Follow-up)
- Each section shows a completion indicator (checkmark when fields filled).

### 6. Add Cost Estimate to Orders Tab
- Show a running total card at the top of Orders tab: consultation fee + lab costs + imaging costs.

### 7. Enhance Prescription Dialog
- Add "Route" field (Oral, IV, IM, Topical, etc.) as a Select.
- Add quick-fill duration buttons (3d, 5d, 7d, 14d, 30d).

## Technical Implementation

### Files Changed
- `src/pages/Consultation.tsx` -- Major rewrite of render section
- `src/components/ReferralForm.tsx` -- Add controlled `open`/`onOpenChange` props

### Execution Order
1. Update ReferralForm to accept external open/onOpenChange
2. Rewrite Consultation.tsx with all improvements

