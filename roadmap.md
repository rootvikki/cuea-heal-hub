# Roadmap

- [x] Add AI-assisted urgency suggestions with final clinician control.
- [x] Add atomic triage claim/release workflow and clear queue states.
- [x] Add real-time triage arrival, sound, and desktop alerts.
- [x] Repair suspicious-user deletion and preserve audit history.
- [x] Make automatic BMI calculation clearly visible from entered height and weight.
- [x] Show served triage patients as On Triage across queues and workflow views.

## Infirmary improvements (Oct 2026 document)
- [x] Reception: edit biodata, age + member/admission numbers, blood type removed
- [x] Triage: nursing procedures list matches document (placeholder prices)
- [x] Reception/Triage: send directly to lab/pharmacy
- [x] Consultation: admit, order nursing procedures, lab results tab
- [x] Lab: print, arrow keys, CBC report layout
- [x] Lab: group per visit
- [x] Pharmacy: group per visit, inventory/price edit rights, structured Rx
- [ ] Blocked: official price list from user

## Workflow simplification (Nov 2026)
- [x] Reception: international phone numbers (country-code picker)
- [x] Reception: send straight to Laboratory / Pharmacy / Dental / Billing at check-in (no triage)
- [x] Reception: search by name, OPD, ID/passport, phone, student/staff no., insurance no., ticket
- [x] Reception & Triage: visit reports (date, age, gender, in/outpatient, patient type, payment mode) — print / CSV
- [x] Cash removed; M-Pesa fixed (Nairobi timestamp, real error messages, live status, manual code, auto check-out)
- [x] One lab request per patient visit (single charge line, single notification)
- [x] Reception sees patient details only (no clinical records)
- [x] Payment mode per visit: M-Pesa / School fees or Insurance (insurance prices pending)
- [x] Triage: BP 2–3 digits each with validation; full previous vitals incl. height; height carried forward
- [x] All stations: "Send to…" any department, "Serve next patient", queue works on phones
- [x] Lab: receive → enter → send; combined bordered results table; reports by date/result/test/age; send to dental
- [x] Consultation: bordered lab results, send to dental, editable doctor name on referral
- [x] Dental: tooth chart, full procedure list, lab/prescription/referral, dental history
- [x] Pharmacy: receive → tick (give / not available / alternative) → billing → dispense & print
- [ ] Blocked: insurance price list from user

## Payments (Nov 2026, part 2)
- [x] M-Pesa: separate till / store numbers in Settings, connection test, plain-language failure reasons
- [x] M-Pesa: payments confirmed by status check are recorded even if Safaricom's callback is lost
- [x] Patient portal: patients can pay their own bills by M-Pesa (was blocked) with live status
- [x] Finance roles (finance officer, cashier, accountant) can open and export the Payments report
- [x] Payments report: filter by period, type, method, status, staff, department, visit mode, amount, search; group totals; PDF on letterhead, Excel with formula sheets + M-Pesa prompts, CSV
- [ ] Waiting on user: confirm which number is the till and which is the store (a live KES 1 test)
- [x] Official letterhead on every printout (prescriptions, referrals, lab reports, charge sheet, station & department reports, payments)
- [x] Pharmacy: Serve on a patient with no prescription no longer disappears — enter prescription or send on

## Billing / payment / pharmacy clean-up (Nov 3 2026)
- [ ] Reception = billing desk: receptionist can open Billing (queue + opened patient only), Billing shortcut on Reception
- [ ] Payment modes: mpesa / school_fees / payroll / insurance by patient type; check-in defaults; Billing methods per mode; DB enum/constraints/migrate rows
- [ ] Pharmacy owns drug prices and stock (UI + RLS)
- [ ] Reception report: all patient detail columns + Missing details filter
- [ ] Gender: required at registration + edge function, Male/Female only, ask at check-in, "Not recorded" in reports
