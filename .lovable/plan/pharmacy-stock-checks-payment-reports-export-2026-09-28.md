# Pharmacy stock checks + Payment reports export

## Part 1 — Pharmacy stock availability

**What staff will see**
- Each prescription row in Pharmacy shows a stock badge: **In stock**, **Partial (X of Y available)**, or **Out of stock** — matched to inventory by name (case-insensitive, partial match).
- Doctors see the same warning when prescribing in Consultation before sending.
- The Dispense dialog offers three options instead of just blocking:
  1. **Dispense full** (when enough stock).
  2. **Partial fill** — dispense what's available; remaining quantity stays owed and the prescription shows "Partially dispensed (X of Y)". A later "Dispense remaining" completes it.
  3. **Substitute** — pick another in-stock item (e.g. same generic), enter reason; original and substitute are both recorded and the doctor is notified.
- **Request replenishment** button (on a short prescription and on low-stock items) — pharmacist enters quantity needed and urgency. A new "Replenishment Requests" tab lists requests: Requested → Approved → Ordered → Received. Receiving one adds stock and writes a stock-card entry.
- Stock deduction, stock card, billing charge and audit log happen for every fill (full, partial, substitute).

## Part 2 — Payment reports export

New **Payments Report** tab in Reports & Analytics (also reachable from Billing):
- **Patient type**: All / CUEA Staff / CUEA Students / Outsiders.
- **Timeline** quick picks: Today, Yesterday, This week, This month, Last month, This year, Custom (date from/to).
- **Received by / cashier**: All users or a specific staff member.
- **Payment method**: All / M-Pesa / Cash / Card / Insurance / Bank transfer. Optional patient search.
- Summary cards: total collected, number of payments, by method, by patient type.
- Table: date/time, receipt/ref, patient name, OPD no., patient type, invoice no., method, amount, received by.
- **Export**: Branded PDF (CUEA logo, maroon/orange header, filters, summary, totals, page numbers), Excel (.xlsx with summary + details sheets and totals), CSV.

## Technical details
- Migration: `prescriptions` add `quantity_dispensed int default 0`, `substituted_with text`, `substitution_reason text`; status CHECK adds `partially_dispensed`. New table `pharmacy_replenishment_requests` (inventory_id, prescription_id, medication_name, quantity_requested, urgency, status, requested_by, approved_by, received_qty, notes, timestamps) with GRANTs + RLS (pharmacist/admin/super_admin; finance can view).
- `payments` add `received_by uuid` (staff) if absent-populated going forward from Billing/InterimPayment/M-Pesa callback; older rows show "—".
- Report query: payments joined to invoices, patients (patient_type, patient_id), profiles; server-side date/type filters; single query, no N+1.
- Excel via `xlsx` (SheetJS) library; PDF via existing jsPDF + autotable.
- Notifications: doctor on substitution/partial fill; admins on replenishment request.
