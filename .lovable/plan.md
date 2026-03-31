

# Three Enhancements

## 1. Remove Lovable Badge
The "Edit with Lovable" badge is currently visible. Will use the `set_badge_visibility` tool to hide it. The `lovable-tagger` in `vite.config.ts` is a dev-only tool and doesn't affect production.

## 2. Queue Display -- Back to Dashboard Button
Add a "Back to Dashboard" button in the `QueueDisplay.tsx` header using `useNavigate` to go to `/dashboard`.

**File**: `src/pages/QueueDisplay.tsx`
- Import `useNavigate`, `Button`, and `ArrowLeft` icon
- Add a button in the header next to the logo

## 3. Auto-Logout After 5 Minutes Inactivity
Create an `IdleTimeout` component that:
- Tracks mouse, keyboard, scroll, and touch events
- After 5 minutes (300s) of inactivity, shows a modal countdown (6 seconds)
- If no interaction during countdown, signs out via `supabase.auth.signOut()` and redirects to `/auth`
- If user interacts, resets the timer

**New file**: `src/components/IdleTimeout.tsx`
- Uses `useEffect` with event listeners for activity detection
- Shows an `AlertDialog` with a 6-second countdown
- Calls `supabase.auth.signOut()` on expiry

**File**: `src/components/ProtectedLayout.tsx`
- Import and render `<IdleTimeout />` inside the layout so it applies to all authenticated pages

### Technical Notes
- No database changes needed
- The idle timer only runs on protected pages (inside `ProtectedLayout`)
- Queue Display gets a simple navigation button, no idle timer (it's a public page)

