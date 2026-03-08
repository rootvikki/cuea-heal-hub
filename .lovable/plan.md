

## Plan: Patient Summary Card at Every Station

**Goal**: Create a reusable `PatientSummaryCard` component that displays demographics, vitals, diagnoses, orders, and charges for the currently selected patient. Show it at every clinical station so staff can verify completeness before advancing.

### New Component: `src/components/PatientSummaryCard.tsx`

A compact, collapsible card that fetches and displays:
- **Demographics**: Name, OPD number, patient type, insurance, allergies, blood type
- **Latest Vitals**: BP, pulse, temp, SpO2, weight (with color-coded status)
- **Diagnoses**: From the latest encounter tied to the current ticket
- **Active Orders**: Pending lab/imaging orders and prescriptions with status badges
- **Charges**: Running total for this visit

Uses accordion sections so it stays compact. Accepts `patientId` and `ticketId` props. Fetches data from `patients`, `profiles`, `vitals`, `encounters`, `lab_orders`, `prescriptions`, `service_charges`.

### Integration Points (6 stations)

Each station already has a `selectedTicket` with `patient_id`. Add the summary card above or alongside the main form area when a patient is selected:

1. **Vitals.tsx** — Show below the triage header, above the form
2. **Consultation.tsx** — Already has PatientJourney tab; add summary as a persistent banner above the tabs
3. **Laboratory.tsx** — Show when a test is selected for result entry
4. **Pharmacy.tsx** — Show above the pending prescriptions table
5. **Billing.tsx** — Show above the invoice/charge sheet area
6. **Imaging.tsx** — Show when an order is selected

Each integration is a single line:
```tsx
{selectedTicket && <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />}
```

### Technical Details

- Fetches patient + profile data in one query via `patients` joined with `profiles`
- Fetches latest encounter for the ticket via `encounters` table filtered by `ticket_id` (available via service_charges or directly)
- Reuses existing RLS policies — all clinical roles already have SELECT on these tables
- No database changes needed
- Uses Accordion from shadcn/ui for collapsible sections to avoid overwhelming the screen
- Completion indicators: green checkmarks for completed sections, amber warnings for missing data

