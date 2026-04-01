

## Staff Self-Registration Page

### What
A public-facing page (`/staff-registration`) where prospective staff members can fill in their personal and professional details. The super admin then reviews these submissions from an admin panel and onboards approved applicants.

### Database

**New table: `staff_applications`**
- `id` (uuid, PK)
- `full_name` (text, required)
- `email` (text, required)
- `phone` (text, required)
- `national_id` (text)
- `desired_role` (text, required) — the role they're applying for
- `specialization` (text)
- `license_number` (text)
- `years_of_experience` (integer)
- `preferred_shift` (text)
- `notes` (text) — additional info / cover message
- `status` (text, default `'pending'`) — pending / approved / rejected
- `reviewed_by` (uuid)
- `reviewed_at` (timestamptz)
- `created_at` (timestamptz, default now())

**RLS policies:**
- Public INSERT (anon + authenticated) — anyone can submit an application
- Public SELECT own row by email (so they see a confirmation)
- Admin/super_admin can SELECT all, UPDATE status

### New Pages & Routes

1. **`/staff-registration`** (public, no auth required)
   - Clean, professional form with the hospital branding
   - Sections: Personal Info (name, email, phone, national ID), Professional Info (desired role, specialization, license number, years of experience), Availability (preferred shift), Additional Notes
   - On submit → inserts into `staff_applications` → shows success confirmation
   - Big, touch-friendly inputs (h-12) per design standards

2. **`/admin/staff-applications`** (super_admin + admin only)
   - Table listing all pending applications with filters (status, role)
   - Click to view full details in a dialog
   - Actions: Approve (opens existing StaffOnboarding flow pre-filled) or Reject (with reason)
   - Approve action → calls `admin-create-user` edge function with the applicant's data, then updates application status to `approved`

### Changes to Existing Files

- **`src/App.tsx`**: Add two new routes — `/staff-registration` (public) and `/admin/staff-applications` (admin-protected)
- **`src/components/AppSidebar.tsx`**: Add "Staff Applications" menu item under Administration section
- **`src/pages/Auth.tsx`**: Add a link/button "Staff? Apply here" pointing to `/staff-registration`

### New Files
- `src/pages/StaffRegistration.tsx` — the public application form
- `src/pages/StaffApplications.tsx` — the admin review dashboard

### Technical Details
- No authentication required for the registration form — uses Supabase anon key with public INSERT RLS
- Form validation using existing `validation.ts` utilities
- The admin review page fetches from `staff_applications` and provides approve/reject workflows
- Approving triggers the existing `admin-create-user` edge function to create the account and assign roles

