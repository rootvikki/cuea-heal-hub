

# Add Optional Service Charges at Every Workflow Step

## Current Gap Analysis

| Station | Generates Service Charges | Has InterimPayment |
|---------|--------------------------|-------------------|
| Triage/Vitals | Only nursing procedures (no triage fee) | Yes |
| Consultation | Consultation fee + lab/imaging costs | **No** |
| Laboratory | None (charges from Consultation) | Yes |
| Imaging | None (charges from Consultation) | Yes |
| Pharmacy | On dispense | Yes |
| Dental | Per procedure | Yes |
| Billing | N/A (final) | N/A |

## Changes Required

### 1. Vitals.tsx — Add automatic triage fee
- Insert a `service_charges` record for "Triage Fee" (e.g., KES 200) when vitals are saved, alongside the existing nursing procedure charges.
- Make the triage fee configurable (hardcoded default, can be updated in system settings later).

### 2. Consultation.tsx — Add InterimPayment button
- Import and render `InterimPayment` in the patient header area when a ticket is selected.
- Uses `selectedTicket.id` and `selectedTicket.patient.id`.

### 3. Laboratory.tsx — Add optional additional charges
- Lab charges are already generated at Consultation when the doctor orders tests. No additional charge generation needed here — the InterimPayment button already exists for collecting payment.

### 4. Imaging.tsx — Same as Lab
- Imaging charges are generated at Consultation. InterimPayment already exists.

### 5. Pharmacy.tsx — Already complete
- Generates charges on dispense + has InterimPayment.

### 6. Dental.tsx — Already complete
- Generates charges per procedure + has InterimPayment.

## Summary of File Changes

- **`src/pages/Vitals.tsx`** — Add triage fee service charge on save
- **`src/pages/Consultation.tsx`** — Add `InterimPayment` component to patient header

Two small, focused changes. No database migrations needed.

