

## Impersonate User Feature

### What
A client-side impersonation system that lets admins (super_admin/admin) temporarily view the app as any other user — seeing their roles, sidebar, and dashboard — then switch back to their admin session with one click. This does NOT involve actual Supabase auth session switching (which would require knowing user passwords). Instead, it overrides the UserContext state locally.

### How It Works

1. **UserContext gets impersonation state** — new fields: `impersonatedUserId`, `startImpersonation(userId)`, `stopImpersonation()`, `isImpersonating`. When impersonating, the context fetches and serves the target user's roles and profile instead of the admin's own.

2. **"Login As" button in Admin User Management** — adds a new action in the user dropdown menu on `/admin/users`. Only visible to super_admin/admin. Clicking it calls `startImpersonation(userId)` and navigates to `/dashboard`.

3. **Impersonation banner** — a persistent top bar (yellow/amber) shown across all pages when impersonating, displaying "Viewing as [User Name] ([Role])" with a "Back to Admin" button. Placed in `ProtectedLayout`.

4. **Role/access override** — during impersonation, `roles`, `profile`, `isAdmin`, `hasRole()`, `hasAnyRole()` all reflect the impersonated user's data. The sidebar updates automatically to show only what that user would see.

5. **Stop impersonation** — clicking "Back to Admin" restores the original admin roles/profile and navigates back to `/admin/users`.

### Files to Change

| File | Change |
|------|--------|
| `src/contexts/UserContext.tsx` | Add impersonation state, `startImpersonation()`, `stopImpersonation()`, override roles/profile when active |
| `src/pages/AdminUserManagement.tsx` | Add "Login As" dropdown menu item |
| `src/components/ProtectedLayout.tsx` | Add impersonation warning banner |
| `src/components/ImpersonationBanner.tsx` | New component — amber banner with user info and "Back to Admin" button |

### Security Notes
- The actual Supabase session remains the admin's — all database queries still execute with admin's auth token and RLS policies
- This is a UI-level view-as feature, not a true auth session switch
- Only super_admin and admin roles can trigger impersonation
- Audit log entry created when impersonation starts/stops

