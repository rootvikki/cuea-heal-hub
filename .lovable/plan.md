# Infirmary HIMS: Areas of Improvement

This plan covers every item in the "Areas of Improvement" document, grouped by station. It is delivered in 3 phases so each one can be tested before the next starts.

## Phase 1: Reception and Triage/Nursing

**Reception**
1. A **Send directly to** option at check-in: Lab only, Pharmacy only, or the normal path (Triage). This is for walk-ins with an existing request, such as a repeat test or a refill. The lab or pharmacy charges go to billing as usual.
2. An **Edit biodata** button in Patient Details for reception and admin staff. They can change name, gender, date of birth, ID, contacts, next of kin and patient type. Every change is saved in the activity log.
3. Profile header changes:
   - It shows **Age** (for example "22 yrs") next to the date of birth.
   - It shows **Member Number** and **School Admission Number**, with fields to enter them.
   - Blood Type is removed from Medical Info, as the existing project rules require.

**Triage/Nursing**
1. **Send to Lab** and **Send to Pharmacy** buttons in triage for nurse-initiated requests. These use the same flow and timelines as the doctor's buttons.
2. A **nursing procedures catalogue** with variants and prices that admins can edit:
   - Cleaning and dressing: minor, normal or major
   - Injections: IM, IV, SC or IO
   - Incision and drainage
   - Admission
   - Cannulation: G26, G24, G22, G20, G18 or G16
   - Suturing: minor, normal or major
   - Removal of stitches
   - Ear syringing
   - Removal of foreign body
   - Nebulization
   - Joint immobilization

   Nurses record the procedures they perform, and each one is added to the bill.

## Phase 2: Consultation and Laboratory

**Consultation**
1. An **Admit patient** button. It opens a short form with the reason, ward/bed and notes, then sends the patient to the Inpatient page.
2. **Order nursing procedures** from the catalogue above. These appear in the nurse's queue as "Procedures to perform."
3. A **Lab Results** tab in the consultation screen. It lets the doctor see current and past results for this patient at any time, without waiting for the patient to come back.

**Laboratory**
1. **One request per patient visit.** All tests ordered for the same visit are grouped into one card. The technician enters results and sends them back together.
2. **Print results** on a branded CUEA lab report. It is also available as a PDF download.
3. **Arrow-key navigation**: the Up and Down arrow keys and Enter move between result fields.
4. **Full Haemogram (CBC+DIFF) report** laid out like the analyzer printout:
   - The header shows Name, Patient ID, Age, Gender, Test Time, Sample, Mode, Patient Type and Department.
   - The table has the columns Parameter, Flag (H/L), Result, Unit and Reference Range.
   - The parameter list follows the document: WBC, NEU#/%, LYM#/%, MON#/%, EOS#/%, BAS#/%, RBC, HGB, HCT, MCV, MCH, MCHC, RDW_CV, RDW_SD, PLT, MPV, PDW, PCT, P_LCR, P_LCC, ALY, LIC, NLR, PLR and NRBC.
   - Abnormal results are shown in bold.
   - The report ends with a disclaimer, comments and the doctor's signature line.

## Phase 3: Pharmacy

1. **One prescription card per patient visit.** All drugs for a visit are listed together and can be dispensed together.
2. **Inventory rights.** Pharmacists and admins can add new items and edit existing items, including name, formulation, strength, stock level and reorder level. Every change is logged.
3. **Prices.** Selling prices for infirmary supplies can be edited, by pharmacy admin and finance roles only. Updating them to the correct prices needs the official price list from you.
4. **Structured prescription display.** Each line shows Formulation, Drug, Strength, Frequency and Duration, for example "Tabs, Lysodol, 100mg, BD, x 5 days." Doctors pick these as separate fields when prescribing, so pharmacy sees the prescription exactly as it was written.

## Needed from you
- The official price list for pharmacy supplies and nursing procedures. Placeholder prices are used until it arrives.
- Confirmation of which roles may edit biodata. The proposal is reception and admin staff.

## Technical notes
- Migrations:
  - `patients`: add `member_number` and `admission_number`.
  - New `nursing_procedures` catalogue (name, variant, price, active) and `procedure_orders` (encounter, procedure, ordered_by, performed_by, status, timestamps).
  - `prescriptions`: add `formulation` and `strength` if they are missing.
  - New `admissions` record linked to the inpatient module.
  - RLS uses `has_role()`.
  - Ticket updates keep `status` and `workflow_stage` in sync.
- Shared `sendLabOrders` and `sendPrescriptions` helpers will be pulled out of Consultation so Reception and Triage can reuse them.
- Lab and pharmacy grouping is done in the UI by `encounter_id`, or by `ticket_id` when there is no encounter. The stored data does not change.
- A reusable `LabReportPrint` component will produce both the print view and the PDF (jsPDF, CUEA logo). The CBC template is driven by a parameter list.
- Every edit and procedure action is recorded through `auditLog`.
