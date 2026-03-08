

# System-Wide Usability and Polish Plan

After a thorough review of every major page, component, and workflow in the system, here is a prioritized plan to make the CUEA Infirmary HMS the easiest and smoothest system to use for all staff and patients.

---

## 1. Global UX Improvements

### Breadcrumb Navigation
- Add a breadcrumb bar at the top of every page inside `ProtectedLayout` showing the current location (e.g., "Dashboard > Patient Queue")
- Helps users orient themselves, especially new staff

### Consistent Page Headers
- Standardize all page headers with the same structure: icon + title + subtitle + action buttons aligned right
- Currently some pages use `p-6`, others `p-8` -- normalize all to `p-6 lg:p-8`

### Loading States
- Replace plain text "Loading..." in tables with skeleton rows (animated placeholder rows)
- Already have a `PageSkeleton` component but it is only used on Dashboard; extend usage to all pages

### Empty States
- Add friendly illustrations or icons with helpful messages when tables are empty (e.g., "No patients in queue yet. Check in a patient to get started.")
- Add a call-to-action button in empty states pointing to the relevant action

### Toast Notifications
- Standardize all success/error toasts with consistent wording
- Add a subtle sound/vibration cue for critical notifications (e.g., emergency queue additions)

---

## 2. Sidebar Improvements

### Current User Display
- Show the logged-in user's name and role badge in the sidebar header (below the logo)
- Currently users have no visual confirmation of who they are logged in as while navigating

### Active Section Highlighting
- The current active item highlighting works but the entire section group should subtly expand/highlight
- Add a small colored left-border indicator on the active item for better visibility on the maroon background

### Collapsible Sidebar on Mobile
- Ensure the sidebar auto-collapses on mobile and opens as an overlay
- Add a hamburger menu button in the top-left of the main content area on mobile

---

## 3. Dashboard Enhancements

### Greeting with Time of Day
- Change "Welcome back" to "Good morning/afternoon/evening" based on time of day
- Small touch that makes the system feel personal

### Stat Cards Animation
- Add a count-up animation on stat card numbers when they load
- Add subtle hover scale effect (already have `hover:shadow-lg`, enhance with `hover:scale-[1.02]`)

### Quick Action Cards Enhancement
- Add icons to each quick action button
- Add keyboard shortcuts for top 3 actions (show shortcut hint in the button)

---

## 4. Patient Queue Page

### Visual Queue Board
- Add color-coded status columns (like a Kanban board view) as an alternative to the list view
- Toggle between "List View" and "Board View"
- Board columns: Checked In | Triage | Waiting for Doctor | In Consult | Lab/Imaging | Pharmacy | Billing | Done

### Patient Wait Time Display
- Show elapsed wait time since check-in on each ticket (e.g., "Waiting: 23 min")
- Highlight tickets waiting longer than 30 minutes in amber, 60+ minutes in red

### Sound Alert for New Check-ins
- Play a subtle notification sound when a new patient is checked in (configurable in settings)

---

## 5. Consultation Page

### Split-Panel Layout Polish
- The left queue panel is good; enhance with patient photo/avatar placeholder
- Add patient age, gender, and allergies badge directly in the queue card for quick reference

### Auto-Save Draft
- Auto-save encounter form data to localStorage every 30 seconds
- Show a "Draft saved" indicator
- Restore draft when returning to the same patient

### Clinical Templates
- Add quick-fill templates for common presentations (e.g., "Upper Respiratory Infection", "Malaria", "UTI")
- Pre-fill chief complaint, assessment, and common prescriptions

### Diagnosis Autocomplete
- Add ICD-10 code search/autocomplete for the diagnosis field
- Currently it is free-text which makes reporting inconsistent

---

## 6. Vitals / Triage Page

### Visual Vital Signs Dashboard
- Show vitals on a visual body-map or gauge-style indicators
- Color-code out-of-range values automatically (e.g., BP > 140 shows red)
- The BMI calculation is good; add a visual BMI category indicator (underweight/normal/overweight/obese)

### Quick Input Mode
- Allow tab-through of all vital fields in order for fast data entry
- Auto-advance to next field on Enter key

---

## 7. Pharmacy Page

### Prescription Queue Enhancement
- Group prescriptions by patient (currently individual rows)
- Show all medications for one patient together with a single "Dispense All" button
- Add a confirmation dialog showing what will be deducted from inventory before dispensing

### Low Stock Visual Alert
- Add a persistent banner at the top of the Pharmacy page when any items are below reorder level
- Color-code inventory rows: green (adequate), amber (approaching reorder), red (below reorder)

---

## 8. Laboratory Page

### Sample Tracking
- Add visual status badges for sample lifecycle: Ordered > Collected > Processing > Completed
- Show estimated turnaround time

### Result Entry Improvement
- The structured result fields are excellent; add auto-flagging (H/L/Critical) based on reference ranges
- Already partially implemented but ensure consistency across all test types

---

## 9. Billing Page

### Invoice Summary Dashboard
- Add summary cards at the top: Total Outstanding, Collected Today, Pending M-Pesa
- Visual pie chart of payment methods breakdown

### One-Click Receipt
- After payment, show a "Print Receipt" button that generates a clean PDF receipt
- Include hospital logo, patient details, itemized charges, and payment confirmation

---

## 10. Patient Portal

### Welcome Dashboard
- Add a welcome card with patient name and upcoming appointment reminder
- Show a simple timeline of recent visits

### Mobile-First Design
- Ensure all portal tabs work perfectly on mobile (patients will primarily use phones)
- Large touch-friendly buttons and cards

---

## 11. Settings Page

### Organized Settings Sections
- Group settings into clear categories with icons: General, M-Pesa, Notifications, System
- Add visual confirmation when settings are saved (checkmark animation)

---

## Technical Implementation Details

### File Changes

**New Component: `src/components/Breadcrumb.tsx`**
- Simple breadcrumb component using react-router location
- Maps route paths to human-readable names

**Edit: `src/components/ProtectedLayout.tsx`**
- Add breadcrumb component above the main content
- Add current user name/role display in the sidebar header area
- Normalize padding

**Edit: `src/components/AppSidebar.tsx`**
- Add user info section (name + primary role badge) below the logo
- Add left-border active indicator styling

**Edit: `src/pages/Dashboard.tsx`**
- Add time-of-day greeting
- Add icons to QuickActionButton
- Add hover scale animation to StatCard

**Edit: `src/pages/Queue.tsx`**
- Add wait time display (calculate from `checked_in_at`)
- Add color-coded wait time warnings
- Add Kanban board view toggle

**Edit: `src/pages/Consultation.tsx`**
- Add auto-save to localStorage
- Add patient demographics (age, gender, allergies) in queue cards
- Add common diagnosis templates

**Edit: `src/pages/Vitals.tsx`**
- Add visual BMI category indicator
- Color-code out-of-range vital values
- Add tab-through navigation

**Edit: `src/pages/Pharmacy.tsx`**
- Group prescriptions by patient
- Add inventory color-coding for stock levels
- Add low-stock banner

**Edit: `src/pages/Billing.tsx`**
- Add summary stat cards at the top
- Improve invoice table with better status badges

**Edit: `src/pages/PatientPortal.tsx`**
- Add welcome card with next appointment
- Improve mobile responsiveness of tabs

**Edit: `src/index.css`**
- Add smooth transition utilities
- Add count-up animation keyframes

### Execution Order
1. Global: Breadcrumb + ProtectedLayout padding normalization
2. AppSidebar: User info display + active indicator
3. Dashboard: Time greeting + stat card animations + quick action icons
4. Queue: Wait time display + color warnings
5. Consultation: Auto-save + patient info in queue cards
6. Vitals: Visual indicators + keyboard navigation
7. Pharmacy: Group by patient + stock level coloring
8. Billing: Summary cards
9. PatientPortal: Welcome card + mobile polish
10. Settings: Section grouping

