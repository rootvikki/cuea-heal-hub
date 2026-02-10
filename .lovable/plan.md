

# CUEA Infirmary System - Complete Overhaul Plan

This plan covers all the changes needed to make the CUEA Health Center system fully functional based on the uploaded department templates, workflow requirements, and reporting needs.

---

## Phase 1: Database Schema Updates

New tables and columns needed to support all departments:

### 1.1 Patients table enhancements
- Add `patient_type` column (enum: 'cuea_staff', 'cuea_student', 'outsider')
- Add `payroll_number` (for CUEA staff)
- Add `admission_number` (for CUEA students - registration number)
- Add `nationality` column
- Add `postal_address` column
- Add `email` column
- Add `next_of_kin_name`, `next_of_kin_relationship`, `next_of_kin_phone` columns
- Add `visit_reason` column (enum: 'outpatient', 'dental')

### 1.2 Profiles table enhancements
- Ensure `date_of_birth` is mandatory for age auto-calculation

### 1.3 Vitals table enhancements
- Add `spo2` (already exists as oxygen_saturation)
- Add `allergies_noted` text column
- Add `presenting_complaint` text column

### 1.4 New: `nursing_procedures` table
- id, encounter_id, patient_id, nurse_id
- procedure_type (dropdown from the list: cleaning_dressing_minor, cleaning_dressing_normal, cleaning_dressing_major, debridement, ear_syringing, suturing, removal_of_sutures, cannulation, injection_im, injection_iv, injection_subcutaneous, injection_dermal, infusion_normal_saline, infusion_dns, infusion_hartmans, infusion_d5, infusion_d10, infusion_d50, infusion_metronidazole, infusion_paracetamol, observation, nebulization, incision_drainage, removal_foreign_bodies)
- notes text
- created_at, price

### 1.5 New: `dental_procedures` table
- id, encounter_id, patient_id, dentist_id
- procedure_name (from the dental catalog dropdown)
- tooth_number, notes, price
- next_visit date
- created_at

### 1.6 New: `referrals` table
- id, patient_id, encounter_id, referred_by (doctor_id)
- reasons_for_referral, treatment_given
- doctor_name, referral_date
- created_at

### 1.7 Lab results structured tables
- New: `lab_result_fields` table for structured results (macroscopy, microscopy fields per test type)
- Add `flag` column to lab_orders for H/L flags
- Add `gender_specific_ranges` to lab_tests_catalog

### 1.8 Pharmacy inventory enhancements
- Add `strength_size`, `package`, `minimum_stock`, `maximum_stock`, `average_monthly_consumption` columns to pharmacy_inventory
- New: `pharmacy_stock_transactions` table for stock card tracking (date, received_from/issued_to, invoice_ref, expiry_date, unit_price, qty_received, qty_issued, balance, signature)

### 1.9 New: `service_charges` table
- id, patient_id, encounter_id, ticket_id
- service_type (consultation, dental, nursing_procedure, laboratory, pharmacy, imaging)
- description, amount
- billing_stage (which workflow step generated the charge)
- created_at

---

## Phase 2: Patient Registration Overhaul

### 2.1 Update PatientRegistrationDialog
- Add patient type selector (CUEA Staff / CUEA Student / Outsider)
- Conditional fields:
  - CUEA Staff: Payroll Number (required), Insurance options
  - CUEA Student: Student Registration/Admission Number (required)
  - Outsider: M-Pesa payment info
- Make National ID/Passport mandatory (marked with *)
- Make Date of Birth mandatory with auto age calculation
- Make Gender mandatory (Male/Female dropdown)
- Make Phone Number mandatory
- Add Nationality field
- Add Postal Address and Email fields
- Add Next of Kin section (Relationship, Contact - both mandatory)
- Add Visit Reason: Outpatient / Dental (mandatory)
- Auto-generate OPD number
- Billing mode selection at registration:
  - Payroll (staff)
  - Admission Number (students)
  - M-Pesa with till number receipting
  - Insurance (dropdown: Pacis, Madison, CIC, etc.) + member number

---

## Phase 3: Nursing Department (Vitals/Triage) Page Overhaul

### 3.1 Rewrite Vitals page to match CUEA nursing template
- Show Queue Number and OPD Number at top
- Show "From (which department)" field
- Triage section (not dropdown):
  - Weight (kg), Height (m), BMI (auto = weight/height^2), Blood Pressure, Pulse Rate, Temperature, SPO2, Allergies, Presenting Complaint
- Nursing Procedures section (dropdown selection from full list):
  - Cleaning & Dressing (Minor/Normal/Major), Debridement, Ear Syringing, Suturing, Removal of Sutures, Cannulation
  - Injections (I/M, I/V, Subcutaneous, Dermal)
  - Infusions (Normal Saline, DNS, Hartman's, D5, D10, D50, Metronidazole, Paracetamol)
  - Observation, Nebulization, Incision & Drainage, Removal of Foreign Bodies
- Nursing Notes section (free text)
- Patient previous data lookup (search by OPD/Name)
- Next Visit (TCA) calendar picker
- "Send to Doctor" button to advance queue
- Generate service charge for each procedure performed

---

## Phase 4: Consultation Page Enhancements

### 4.1 Update Consultation to match clinical template
Already has SOAP notes structure. Enhance with:
- Chief Complaints section
- History of Presenting Illness
- Past Medical & Surgical History
- Medicine and Social History
- Physical Examination (General + Systemic)
- Diagnostic Tests section (Lab + Radiology order integration)
- Diagnosis section
- Prescription section
- Referral form generation (matching CUEA template)
- Follow up / Next Visit booking
- Generate service charge for consultation

---

## Phase 5: Laboratory Page Overhaul

### 5.1 Complete lab test catalog matching CUEA lab template
Seed the following tests into lab_tests_catalog:
- Full Hemogram (CBC+DIFF with all parameters)
- ESR, HB, Blood Group, HBsAg, HCV, VDRL, Brucella, RF
- Pregnancy Test, VCT/PITC, FBS/RBS
- UECs (gender-specific reference ranges)
- LFTs (gender-specific reference ranges)
- Lipid Profile
- Urinalysis (structured: Macroscopy, Biochemistry, Microscopy)
- HVS Wet Prep, Urethral Swab, Gram Stain
- Malaria (BS for MPS and MRDT)
- Stool Analysis (Macroscopy + Microscopy)
- H.Pylori, SAT, ASOT

### 5.2 Structured result entry forms
- Each test type gets its own structured result entry form matching the lab template
- E.g., Urinalysis: Color, Appearance, pH, SG, Leukocytes, Nitrites, Blood, Bilirubin, etc.
- UECs: Creatinine, Urea, K+, Na+, Cl-, PHOS, tCO2, Ca, Uric Acid, Mg + eGFR
- LFTs: Albumin, Globulin, T.Protein, Bilirubins, GGT, ALT, AST, Amylase, Lipase, ALP
- Full Hemogram: WBC, NEU#, LYM#, MON#, EOS#, BAS#, RBC, HGB, HCT, MCV, MCH, MCHC, RDW, PLT, MPV, PDW, PCT
- Auto-flag H/L based on reference ranges
- Gender-specific reference ranges
- Allow search by Patient Name, Date, and Test simultaneously
- Flag edited results
- "Complete & Send to Next Station" button

---

## Phase 6: Imaging/Radiology Page

### 6.1 Update to match CUEA Radiology Form
- Clinical History and Diagnosis/Medication field
- Examination types: X-Ray, Ultrasound, CT Scan, MRI
- Ordering doctor name captured
- Results entry: Findings + Impression
- Auto-advance patient to next station on completion

---

## Phase 7: Pharmacy Page Overhaul

### 7.1 Inventory matching CUEA pharmacy template
- Seed all 275 medications from the uploaded pharmacy_inventory.xlsx
- Add stock card functionality matching the Pharmacy Stock Card template:
  - Serial number, Item, Strength/Size, Package
  - Min/Max stock, Re-order level, Average Monthly Consumption
  - Transaction log: Date, Received From/Issued To, Invoice Ref, Expiry Date, Unit Price, Qty Received, Qty Issued, Balance

### 7.2 Dispensing workflow
- Show prescriptions from consultation
- Match against inventory
- Auto-deduct stock on dispensing
- Generate service charge for dispensed items
- "Complete & Send to Billing" button

---

## Phase 8: Billing System Overhaul

### 8.1 Service charge accumulation
- Auto-generate invoice items from each station's charges:
  - Consultation fee
  - Nursing procedures
  - Lab tests
  - Imaging studies
  - Pharmacy items
  - Dental procedures
- Invoice matches CUEA Charge Sheet format: "TO CREDIT CONTROLLER" with patient name, Reg/ID No, total bill

### 8.2 Payment methods by patient type
- CUEA Staff: Payroll deduction + insurance option
- CUEA Students: Student account debit
- Outsiders: M-Pesa payment (existing STK push)
- Insurance: Pre-authorization flow

---

## Phase 9: Reports Page Overhaul

### 9.1 Multi-filter reporting
Simultaneous filtering by:
1. Age Group (0-5, 6-59 months, 5-14, 15-24, 25-34, 35-44, 45-54, 55-64, 65+)
2. Gender (Male/Female)
3. Diagnosis (searchable dropdown from encounters)
4. Lab Test (from lab_tests_catalog)
5. Procedure (nursing/dental procedures)
6. Date Range (from-to picker)

Reports include:
- Patient visit summaries with all filters applied
- Lab test statistics
- Pharmacy usage/stock reports
- Revenue by service type, patient type, and payment method
- Exportable to CSV/PDF

---

## Phase 10: Queue Workflow - Officer Station Controls

### 10.1 Each station page gets a "Patient Queue" panel
Every department page (Vitals, Consultation, Lab, Imaging, Pharmacy, Billing) will have:
- A sidebar/panel showing patients assigned to that station
- "Start Serving" button to mark a patient as being served
- "Complete & Send to Next" button that:
  1. Saves the work done at that station
  2. Generates any service charges
  3. Automatically advances the ticket to the next workflow stage
  4. Updates the public Queue Display in real-time

### 10.2 Workflow stages with officer control
```text
Reception (check-in) 
  --> Triage/Nursing (nurse marks complete)
    --> Doctor Queue (doctor starts/completes consult)
      --> Lab (if ordered, tech marks complete)
      --> Imaging (if ordered, radiologist marks complete)
      --> Pharmacy (if prescribed, pharmacist dispenses)
        --> Billing (cashier processes payment)
          --> Checked Out
```

### 10.3 Dental workflow
```text
Reception (visit_reason = dental)
  --> Dental (dentist performs procedures)
    --> Pharmacy (if needed)
      --> Billing
        --> Checked Out
```

---

## Phase 11: Referral Form

### 11.1 Digital referral form matching CUEA template
- Patient Name, Age, Sex, Date (auto-filled)
- Reasons for Referral (text area)
- Treatment Given (text area)
- Doctor Name (auto-filled from logged-in user)
- Printable format matching CUEA/DVC ADM/INF/01/fm01

---

## Technical Details

### Database Migrations Required
1. ALTER TABLE patients ADD COLUMN patient_type, payroll_number, admission_number, nationality, postal_address, next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, visit_reason
2. ALTER TABLE vitals ADD COLUMN presenting_complaint, allergies_noted
3. CREATE TABLE nursing_procedures (with RLS)
4. CREATE TABLE dental_procedures (with RLS)
5. CREATE TABLE referrals (with RLS)
6. CREATE TABLE service_charges (with RLS)
7. CREATE TABLE pharmacy_stock_transactions (with RLS)
8. ALTER TABLE pharmacy_inventory ADD COLUMN strength_size, package, minimum_stock, maximum_stock, average_monthly_consumption
9. ALTER TABLE lab_orders ADD COLUMN flag
10. Seed lab_tests_catalog with all CUEA tests
11. Seed pharmacy_inventory with all 275 medications

### Files to Create/Modify
- **Modified**: `src/components/PatientRegistrationDialog.tsx` (complete rewrite for CUEA fields)
- **Modified**: `src/pages/Vitals.tsx` (nursing department overhaul)
- **Modified**: `src/pages/Consultation.tsx` (add referral, history sections)
- **Modified**: `src/pages/Laboratory.tsx` (structured result forms)
- **Modified**: `src/pages/Pharmacy.tsx` (stock card, CUEA inventory)
- **Modified**: `src/pages/Billing.tsx` (service charge accumulation, patient-type billing)
- **Modified**: `src/pages/Imaging.tsx` (radiology form matching)
- **Modified**: `src/pages/Reports.tsx` (multi-filter reporting)
- **Modified**: `src/pages/QueueDisplay.tsx` (enhanced display)
- **New**: `src/pages/Dental.tsx` (dental procedures page)
- **New**: `src/components/ReferralForm.tsx` (referral form component)
- **New**: `src/components/NursingProcedures.tsx` (procedure selection component)
- **New**: `src/components/StationQueue.tsx` (reusable queue panel for each station)
- **New**: `src/components/ServiceChargeTracker.tsx` (tracks charges per visit)
- **New**: `src/components/LabResultForms/*.tsx` (structured forms per test type)
- **Modified**: `src/App.tsx` (add dental route)
- **Modified**: `src/components/AppSidebar.tsx` (add dental nav item)

### Important Notes
- Due to the scale of this plan, implementation will be done in phases across multiple messages
- The database migrations will be run first to establish the schema
- Each page will be rebuilt to match the uploaded CUEA templates exactly
- Real-time queue updates are already in place and will be preserved
- All existing RLS policies will be extended to cover new tables

