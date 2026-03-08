

# Comprehensive Gap Analysis & Implementation Plan

After parsing all 10 uploaded documents and comparing against the current database, code, and workflows, here is the full gap analysis.

---

## What's Already Working Well

- **Reception registration**: Fields match the template (name, DOB, gender, phone, ID, payroll/admission, nationality, postal address, email, next of kin, visit reason)
- **Nursing procedures**: All 24 procedures from the document are implemented in `NursingProcedures.tsx`
- **Consultation flow**: All 10 sections from the clinical consultation form are captured (chief complaint, HPI, past medical/surgical history, medicine/social history, physical exam general/systemic, diagnosis, prescription, referral form, follow-up)
- **Vitals/Triage**: Weight, height, BMI auto-calc, BP, pulse, temperature, SPO2, allergies, presenting complaint — all match
- **Imaging catalog**: X-Ray, Ultrasound, CT, MRI categories match the radiology form
- **Workflow transitions**: End-to-end ticket flow is functional

---

## Gaps Found (Prioritized)

### 1. Lab Test Catalog — Only 8 tests, document requires 31
**Current**: Blood Glucose, CBC, HIV, KFT, Lipid Profile, LFT, Malaria, Urinalysis
**Missing from document**: ESR, HB Levels, Blood Group, HBsAg, HCV, VDRL, Brucella Test, Rheumatoid Factor, Pregnancy Test, VCT/PITC, FBS/RBS (separate from Blood Glucose), Full Hemogram (rename CBC), HVS Wet Prep, Urethral Swab Wet Prep, HVS Gram Stain, Urethral Swab Gram Stain, Stool for O/C, H.Pylori Antigen, Salmonella Antigen (SAT), ASOT, BS for MPS, MRDT, Occult Blood

**Action**: Insert 23 missing lab tests into `lab_tests_catalog` with proper prices.

### 2. Lab Structured Result Templates — Missing 8+ test templates
**Current structured fields**: Full Hemogram, Urinalysis, UECs, LFTs, Lipid Profile
**Missing from document**: Stool for O/C (Macroscopy + Microscopy fields), HVS Wet Prep/Gram Stain, Urethral Swab Wet Prep/Gram Stain, Blood Group (Group + Rhesus), ESR, FBS/RBS, Full Hemogram CBC+DIFF (the document shows a much more detailed CBC with ~30 parameters from the analyzer)

**Action**: Add structured result field definitions in `Laboratory.tsx` STRUCTURED_FIELDS for: Stool Analysis, HVS/Urethral Swab, Renal Function (update units to match document's mmol/L), LFTs (update units to match g/l and umol/L), Lipid Profile (add ALT/AST fields, update units to mmol/l).

### 3. Dental Procedures — 17 generic items, document has 42 specific
**Current**: Generic names like "Tooth Extraction - Simple"
**Document**: Precise clinical names like "Closed Disimpaction", "Open Disimpaction", "Amalgam Restoration F1/F2/F3", "Root Canal Treatment - Anterior/Premolar/Molar", "Fissure Sealing", "Resin Bonded Bridge", "Stainless Steel Crown", etc.

**Action**: Replace the `DENTAL_PROCEDURES` array in `Dental.tsx` with the full 42-item list from the document.

### 4. Pharmacy Inventory — 0 items in database, document has 275
**Document**: Complete drug list organized by category (Antibiotics, Antimalarials, Analgesics/NSAIDs, Vitamins/Supplements, GIT drugs, Oral/Dental, CNS, Respiratory, Diabetes, Cardiovascular, Antiemetics, Eye/Ear, Antifungals, Dewormers/GI, Topicals, Injectables, IV Fluids & Supplies).

**Action**: Seed all 275 drugs into `pharmacy_inventory` with names and unit prices from the document. Add category grouping.

### 5. Charge Sheet PDF — No formal "TO CREDIT CONTROLLER" format
**Document**: Official CUEA letterhead format with "TO CREDIT CONTROLLER", patient name, REG/ID NO, total bill, "SR. IN CHARGE" signature line, and form number "CUEA/DVC/ADM/INF/04/fm01".

**Action**: Add a "Print Charge Sheet" button in Billing that generates a PDF matching this exact format using jsPDF (already installed).

### 6. Patient Feedback Form — Not implemented at all
**Document**: Structured form with visit reason checkboxes, 7 Likert-scale service quality questions, and open comments.

**Action**: Create a `patient_feedback` table, a new `/feedback` page accessible from Patient Portal, and the feedback form UI.

### 7. Lab Result Units Mismatch
**Current code** uses mg/dL for UECs and LFTs.
**Document** uses mmol/L for UECs and g/l / umol/L for LFTs (standard Kenyan lab practice).

**Action**: Update reference ranges and units in `STRUCTURED_FIELDS` to match the document exactly.

---

## Technical Implementation Details

### Database Changes (Migration)
1. Insert 23 missing lab tests into `lab_tests_catalog`
2. Create `patient_feedback` table (id, patient_id, visit_reason, ratings JSONB, comments, created_at) with RLS
3. Add `category` column population for `pharmacy_inventory` if not present
4. Seed 275 pharmacy inventory items

### File Changes

**`src/pages/Laboratory.tsx`** — Update STRUCTURED_FIELDS:
- Fix UECs units to mmol/L with document reference ranges
- Fix LFTs units to g/l and umol/L
- Fix Lipid Profile units to mmol/l, add ALT/AST
- Add Stool Analysis (Macroscopy: Color, Consistency, Appearance; Microscopy: Cysts, Ova, Pus Cells, Trophozoites, Yeast Cells, Granules, Blood)
- Add HVS Wet Prep & Gram Stain template
- Add Urethral Swab template
- Add simple result tests (ESR, FBS/RBS, Blood Group, HB Levels) with proper ranges

**`src/pages/Dental.tsx`** — Replace DENTAL_PROCEDURES with all 42 items from the dental template, including dentist notes field per procedure.

**`src/pages/Billing.tsx`** — Add "Print Charge Sheet" button that generates a PDF with:
- CUEA letterhead
- "TO CREDIT CONTROLLER" header
- Patient name and REG/ID
- Itemized service charges table
- Total bill
- "SR. IN CHARGE" signature line
- Form number CUEA/DVC/ADM/INF/04/fm01

**New: `src/pages/Feedback.tsx`** — Patient feedback form with:
- Visit reason selection (Consultation, Treatment, Nursing Care, Lab, Pharmacy, Dental)
- 7 Likert-scale questions matching the document
- Open comments field
- Submit to `patient_feedback` table

**`src/pages/PatientPortal.tsx`** — Add "Feedback" tab linking to the feedback form

**`src/App.tsx`** — Add `/feedback` route

### Execution Order
1. Database: Seed lab catalog + pharmacy inventory + create feedback table
2. Laboratory.tsx: Update structured fields and units
3. Dental.tsx: Replace procedures list
4. Billing.tsx: Add charge sheet PDF generation
5. Feedback.tsx: New patient feedback page
6. PatientPortal.tsx + App.tsx: Wire up feedback

