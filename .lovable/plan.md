

# Unified Reception Desk

## Problem

Reception currently has three disconnected pages: Patients (registration), Appointments (scheduling + check-in from appointment), and Queue (walk-in check-in). A receptionist must jump between pages to handle a single patient arrival. In reality, this is one continuous workflow at the front desk.

## Solution

Create a single **Reception** page (`/reception`) that combines all three actions into one screen with a clear flow:

```text
Patient arrives → Search → [Found? Check-in] or [New? Register & Check-in] → Done
                                                  ↳ Schedule future appointment (optional)
```

### Layout

```text
┌──────────────────────────────────────────────────────────┐
│  Reception Desk                          [Today's Queue] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔍 Search patient by name, OPD, or ID number...        │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Results: OPD-2026-0012 — John Kamau  [Check-in]  │    │
│  │          OPD-2026-0008 — Mary Wanjiku [Check-in]  │    │
│  └──────────────────────────────────────────────────┘    │
│  No match? [+ Register New Patient & Check-in]           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  📅 Today's Appointments (3)                             │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 10:00 — John Kamau — General — Scheduled [✓ In]  │    │
│  │ 11:30 — Mary W.    — Dental  — Scheduled [✓ In]  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  [Schedule Future Appointment]                           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  🎫 Active Queue (5 patients)                            │
│  T-001234 John Kamau — Triage — 12m                      │
│  T-001233 Mary W.    — Dental — 5m                       │
│  ...                                                     │
└──────────────────────────────────────────────────────────┘
```

### Three sections on one page:

1. **Patient Search + Quick Actions** — Search bar at the top. Results show patient name, OPD number, and a "Check-in" button. If no results, show "Register New Patient" button that opens the existing registration dialog. After registration succeeds, auto-open the check-in dialog for that patient.

2. **Today's Appointments** — Shows today's scheduled appointments with one-click check-in (reuses existing `handleCheckInFromAppointment` logic). Also has a "Schedule Appointment" button that opens a dialog for future appointments.

3. **Active Queue Summary** — Compact list of currently active tickets with status badges and wait times. Links to the full `/queue` page for detailed management.

### Check-in Dialog

When checking in (walk-in or from appointment), a streamlined dialog:
- Patient name (pre-filled, read-only)
- Department (select)
- Priority (Normal / High / Emergency toggle)
- Visit reason shown if dental → auto-routes to dental flow
- One "Check-in" button

### What changes

**New file:** `src/pages/Reception.tsx` — the unified page

**Edit:** `src/App.tsx` — add `/reception` route for reception roles, keep `/queue` and `/appointments` routes as-is for other roles

**Edit:** `src/components/AppSidebar.tsx` — replace "Appointments" and "Patient Queue" items for receptionists with a single "Reception" item. Other roles keep their existing navigation.

**Edit:** `src/components/PatientRegistrationDialog.tsx` — add optional `onRegistered(patientId: string)` callback that returns the new patient's database ID so Reception can auto-trigger check-in after registration.

**No database changes needed.** Uses existing tables: patients, appointments, tickets, departments.

### Files: 4 total
- **New**: `src/pages/Reception.tsx`
- **Edit**: `src/App.tsx` — add route
- **Edit**: `src/components/AppSidebar.tsx` — add Reception nav item
- **Edit**: `src/components/PatientRegistrationDialog.tsx` — add `onRegistered` callback

