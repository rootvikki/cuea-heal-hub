

# Collapsible Queue Panel + Workflow Timeline on All Station Pages

## What We're Building

When a patient is selected (form is active), the left queue panel auto-collapses to a narrow strip with just a toggle button, giving the form area the full screen width. Clicking the toggle brings the queue back. The `WorkflowTimeline` is already integrated on all pages.

## Approach

### 1. Update `StationQueue` with collapsible behavior

Add a `collapsed` mode to `StationQueue`:
- New props: `collapsed: boolean`, `onToggleCollapse: () => void`
- When collapsed: render a narrow 48px strip with a toggle button showing patient count
- When expanded: render the current full 288px panel
- Smooth transition with `transition-all duration-200`

### 2. Update all 6 station pages + Consultation

Each page that uses `StationQueue` or its own queue panel will:
- Add `const [queueCollapsed, setQueueCollapsed] = useState(false)`
- Auto-collapse when a patient is selected (`useEffect` on `selectedTicket`)
- Pass `collapsed` and `onToggleCollapse` to `StationQueue`
- The main content area gets `flex-1` so it expands to fill available space

**Files:**
- `src/pages/Vitals.tsx`
- `src/pages/Consultation.tsx` (has custom queue panel — add same collapse logic)
- `src/pages/Laboratory.tsx`
- `src/pages/Imaging.tsx`
- `src/pages/Pharmacy.tsx`
- `src/pages/Billing.tsx`
- `src/pages/Dental.tsx`

### 3. Update `StationQueue.tsx`

Add collapsed rendering mode — a slim vertical bar with:
- Expand button (chevron icon)
- Patient count badge
- Rotated title text

**Files changed: 8 total**
- `src/components/StationQueue.tsx` — add collapse/expand modes
- `src/pages/Vitals.tsx` — add collapse state
- `src/pages/Consultation.tsx` — add collapse to custom panel
- `src/pages/Laboratory.tsx` — add collapse state
- `src/pages/Imaging.tsx` — add collapse state
- `src/pages/Pharmacy.tsx` — add collapse state
- `src/pages/Billing.tsx` — add collapse state
- `src/pages/Dental.tsx` — add collapse state

No database changes needed.

