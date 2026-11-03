# Project rules

Subdirectories have their own `AGENTS.md` (e.g. `src/lib/AGENTS.md`) — read it before changing files there.

- M-Pesa settings are resolved only in `supabase/functions/_shared/mpesa.ts` (Settings page values override project secrets; Buy Goods uses separate till and store numbers) — one place so STK push, status checks and callbacks never disagree.
- An M-Pesa payment is recorded on the invoice only through `finalizeMpesaSuccess` (conditional update from `pending`/`failed` to `completed`, links a hand-entered code instead of inserting twice) — callback and status check can both fire; this guarantees one payment row. "Still processing" answers (`isStillProcessing`) are never failures; client waiting lives in `src/lib/mpesaWait.ts`.
- Test files (`*.test.ts`) are excluded from `tsconfig.app.json` because they use bun's test types.
- A station that serves a ticket with nothing to work on (e.g. Pharmacy with no prescription) must show the patient with an action to add the order or send them on — never fall back to the list, which looks like the patient vanished.
- Profile gender is normalised to "Male"/"Female" by a database trigger; reports show a missing gender as "Not recorded" so gaps stay visible.
- `EditBiodataDialog` reloads the full patient and profile rows before editing — callers pass partial objects, and saving those wiped untouched fields.
- Form autosave uses `useFormDraft` + `DraftStatus` (per-user browser drafts, 24 h expiry, wiped on sign-out because machines are shared); inventory edits save only changed fields so concurrent stock movements are not overwritten.
- Ticket/OPD counters are read-only to app users; only the numbering database functions write them.
- Pharmacy stock changes go through database functions `pharmacy_receive_stock` (delivery, no approval) and `pharmacy_set_stock` (count change from Edit) — each updates the balance and writes the stock-card line in one step, so cards and balances never disagree.
- Billing-desk reports (Billing → Reports: payments, bills & balances, services charged) are open to reception and finance.
- Self-editing of personal details is blocked by the `block_self_personal_edit` trigger on `profiles` and `patients` (only bookkeeping columns like `must_change_password` / `last_login_at` may change on one's own row; admins exempt) — screens show details read-only, but the database is the guarantee.
- Each station page gets a top-bar "My work" log (`WorkLogButton`, routes mapped in `src/lib/workLog.ts`): received / pending / finished per department, with "Only what I did" where the step records who did it.
- Long lists and tables are paginated with `usePaged` + `<Pager>` (`src/components/Pager.tsx`, page maths in `src/lib/paging.ts`, rows-per-page remembered per browser) instead of tall scroll boxes or `slice(0, N)`; reset the page via `resetKey` when filters change. The side menu can be hidden from the top-bar button (state kept in the `sidebar:state` cookie).
- Ward care is recorded per admission (`WardCareDialog` on Inpatient): shift notes in `nursing_notes`, procedures in `nursing_procedures.admission_id`, each procedure charged to the admitting visit's ticket — so ward work shows on that visit's bill and history.
