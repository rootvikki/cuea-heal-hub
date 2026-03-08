

# Make Workflow Flow Logically Per Patient

## Problem

The workflow timeline and queue display currently show a fixed set of steps for every patient, regardless of what they actually need. In a real hospital:

- A patient with a headache might go: **Check-in → Triage → Consultation → Billing** (no lab, no pharmacy)
- A patient needing blood work: **Check-in → Triage → Consultation → Lab → Billing**
- A patient with a prescription: **Check-in → Triage → Consultation → Pharmacy → Billing**
- A dental patient: **Check-in → Dental → Pharmacy → Billing** (skips triage and consultation)
- A complex patient: **Check-in → Triage → Consultation → Lab → Imaging → Pharmacy → Billing**

Right now the timeline always shows Lab and Imaging even for a simple headache visit. The dental flow incorrectly shows Triage. The queue page has a rigid `statusFlow` array.

## Solution

Make the workflow timeline **data-driven** — derive the actual path from the ticket's current stage and what orders/prescriptions exist for that encounter.

### 1. `WorkflowTimeline.tsx` — Accept dynamic path

Add an optional `visitPath` prop (array of stage keys) that overrides the default. When not provided, show a minimal path: Check-in → Triage → Consultation → Billing. Each page that renders the timeline will pass the correct path based on the encounter's actual orders.

Add a helper function `deriveVisitPath(currentStage, options)` that builds the path:
- Always includes check-in
- Includes triage only if NOT dental
- Includes consultation only if NOT dental
- Includes dental only if IS dental
- Includes lab only if `hasLabOrders` is true
- Includes imaging only if `hasImagingOrders` is true
- Includes pharmacy only if `hasPrescriptions` is true
- Always ends with billing

### 2. `Queue.tsx` — Dynamic `getDisplayFlow`

Replace the rigid flow with a database-aware version. When rendering each ticket, derive the display flow from the ticket's `workflow_stage` and check if related orders exist. Since we already have the ticket data, we can infer:
- If stage is or was `at_lab` → show Lab in flow
- If stage is or was `at_imaging` → show Imaging
- If stage is or was `at_pharmacy` → show Pharmacy
- If stage is `at_dental` → show dental flow (no triage/consultation)

For the queue list view, use a simpler heuristic based on the current stage (since we don't want to query orders for every ticket):
- Stages before current → completed
- Current stage → current
- Only show relevant future stages based on current position

### 3. `Consultation.tsx` — Pass correct path to timeline

After loading the encounter, pass the derived path based on what orders the doctor has placed. The consultation page already knows `selectedLabTests`, `selectedImaging`, `prescriptions`.

### 4. Station pages — Pass correct path

Each station page (Lab, Imaging, Pharmacy, Billing) will query the encounter's orders to derive the correct path when a ticket is selected.

## Files Changed

- `src/components/WorkflowTimeline.tsx` — Add `deriveVisitPath` helper + `visitPath` prop
- `src/pages/Queue.tsx` — Dynamic `getDisplayFlow` per ticket stage
- `src/pages/Consultation.tsx` — Pass derived path to timeline
- `src/pages/Vitals.tsx` — Pass minimal path (no orders yet at triage)
- `src/pages/Laboratory.tsx` — Derive and pass path
- `src/pages/Imaging.tsx` — Derive and pass path
- `src/pages/Pharmacy.tsx` — Derive and pass path
- `src/pages/Billing.tsx` — Derive and pass path
- `src/pages/Dental.tsx` — Pass dental-specific path

No database changes needed.

