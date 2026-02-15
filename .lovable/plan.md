

# Deep System Audit and Fix Plan

After thorough investigation of all modules, database policies, workflows, and access controls, here is the complete findings report and remediation plan.

---

## AUDIT FINDINGS

### CRITICAL ISSUES

**1. Sidebar exposes "Medical Records" link to nurses and records officers**
- In `AppSidebar.tsx` line 54, the "Medical Records" sidebar item shows for `["admin", "super_admin", "doctor", "nurse", "records_officer"]`
- The route was already locked to `["doctor", "clinical_officer"]` in App.tsx, but the sidebar still shows the link -- nurses click it and get redirected, which is confusing
- **Fix**: Remove `nurse` and `records_officer` from sidebar visibility for Medical Records

**2. Patient Portal fetches encounters (diagnoses/sicknesses) and displays them to patients**
- `PatientPortal.tsx` lines 146-152 queries the `encounters` table and displays chief_complaint, assessment, diagnosis, and plan to patients
- The database RLS policy "Patients can view own encounters" (confirmed in DB) allows patients to SELECT their own encounters
- This directly contradicts the requirement that only doctors see patient sicknesses
- **Fix**: Remove the encounters query and "Medical History" tab from PatientPortal, and DROP the patient encounters SELECT policy from the database

**3. Doctor cannot see pharmacy inventory when prescribing**
- In `Consultation.tsx`, the prescription dialog is a free-text form -- the doctor types medication_name manually
- There is NO lookup against `pharmacy_inventory` to show available drugs, stock levels, or correct drug names
- The pharmacy_inventory RLS already allows doctors to SELECT, so the data is accessible
- **Fix**: Add an autocomplete/search against pharmacy_inventory in the prescription dialog so doctors can see what's in stock and select the correct drug name

**4. Prescription medication name mismatch causes dispensing failures**
- `Pharmacy.tsx` line 101: `inventory.find((item) => item.drug_name.toLowerCase() === medicationName.toLowerCase())`
- This exact-match lookup fails if the doctor typed a slightly different name than what's in inventory (e.g., "Paracetamol 500mg" vs "Paracetamol")
- **Fix**: Use fuzzy matching or, better yet, link prescriptions to inventory_id directly when the doctor selects from inventory

**5. Encounters RLS: `clinical_officer` cannot INSERT/UPDATE encounters**
- The "Doctors can manage encounters" ALL policy only includes `doctor`, `admin`, `super_admin`
- But the route allows `clinical_officer` to access consultation, and clinical officers need to create encounters
- **Fix**: Add `clinical_officer` to the encounters ALL policy

### MODERATE ISSUES

**6. Sidebar: Settings shows for all roles but route requires ADMIN_ROLES**
- `AppSidebar.tsx` line 77: Settings has `roles: ["all"]` but `App.tsx` restricts `/settings` to `ADMIN_ROLES`
- Non-admin users see Settings in sidebar but get redirected when they click it
- **Fix**: Change Settings sidebar visibility to `["admin", "super_admin", "system_admin"]`

**7. Tickets RLS: `radiologist` and `cashier` missing from tickets policies**
- Radiologists need to view/update tickets at the `at_imaging` stage
- Cashiers handle billing but are not in the tickets management policy
- Currently these roles can't transition tickets at their stations
- **Fix**: Add `radiologist` and `cashier` to tickets SELECT and manage policies

**8. Prescriptions RLS: patients cannot see their own prescriptions**
- PatientPortal queries prescriptions but there's no patient SELECT policy on prescriptions
- The query silently returns empty results
- **Fix**: Add a prescriptions SELECT policy for patients (own records only)

**9. Lab orders RLS: patients cannot see their own lab results**
- PatientPortal queries lab_orders but there's no patient SELECT policy
- **Fix**: Add a lab_orders SELECT policy for patients (own records only, hiding clinical notes)

**10. Invoices: cashier role missing from invoices policy**
- The billing page is accessible to `cashier` via App.tsx route, but the invoices ALL policy only includes `finance_officer`, `admin`, `super_admin`
- Cashiers can access the page but can't read/write invoices
- **Fix**: Add `cashier` to invoices and payments policies

### MINOR ISSUES

**11. Dental workflow doesn't create encounter record**
- Dental procedures are saved but no encounter is created, so there's no clinical record of the dental visit in the encounters table
- This means dental visits don't appear in patient history
- **Fix**: Not blocking but noted for future improvement

**12. Queue page: manual status transitions not restricted**
- The Queue page has an `updateTicketStatus` function but no UI buttons currently call it for manual transitions -- the flow is driven by station actions. This is already correct per the ticket control philosophy.

---

## REMEDIATION PLAN

### Database Migration

```text
1. DROP the "Patients can view own encounters" SELECT policy on encounters
2. Add clinical_officer to encounters ALL policy
3. Add radiologist and cashier to tickets policies
4. Add patient SELECT policy on prescriptions (own records only) 
5. Add patient SELECT policy on lab_orders (own records only)
6. Add cashier to invoices ALL and payments ALL policies
```

### File: `src/components/AppSidebar.tsx`
- Line 54: Change Medical Records roles from `["admin", "super_admin", "doctor", "nurse", "records_officer"]` to `["admin", "super_admin", "doctor", "clinical_officer"]`
- Line 77: Change Settings roles from `["all"]` to `["admin", "super_admin", "system_admin"]`

### File: `src/pages/PatientPortal.tsx`
- Remove the encounters query from fetchPatientData
- Remove the "Medical History" tab that shows diagnoses, chief complaints, and assessment
- Keep appointments, lab results (status only, not clinical notes), prescriptions (medication info), and invoices

### File: `src/pages/Consultation.tsx`
- In the prescription dialog, add a drug search/autocomplete that queries `pharmacy_inventory`
- Show drug name, available quantity, and unit price from inventory
- When a drug is selected from inventory, auto-fill the medication_name field with the exact inventory drug_name
- This ensures name consistency between what the doctor prescribes and what pharmacy dispenses

### File: `src/pages/Pharmacy.tsx`
- Improve the dispensing match logic: instead of exact string match, use a case-insensitive partial match or (better) match by inventory_id if available

### Execution Order
1. Database migration (fix all RLS policies)
2. AppSidebar.tsx (correct sidebar visibility)
3. PatientPortal.tsx (remove encounters/diagnosis visibility)
4. Consultation.tsx (add pharmacy inventory lookup for prescriptions)
5. Pharmacy.tsx (improve dispensing match logic)

