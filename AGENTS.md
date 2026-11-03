# Project rules

- M-Pesa settings are resolved only in `supabase/functions/_shared/mpesa.ts` (Settings page values override project secrets; Buy Goods uses separate till and store numbers) — one place so STK push, status checks and callbacks never disagree.
- An M-Pesa payment is recorded on the invoice only through `finalizeMpesaSuccess` (conditional update on `status = 'pending'`) — the callback and the status check can both fire, and this guarantees one payment row.
- Payments-report filtering, grouping and Nairobi-time date ranges live in `src/lib/paymentsQuery.ts` with bun tests beside it (`bun test ./src/lib/paymentsQuery.test.ts`); exports in `paymentsExport.ts` / `paymentsPdf.ts` — keeps report rules testable without the UI.
- Excel exports write totals as live formulas over the detail sheet and dates as Excel serial numbers — users re-filter in Excel, and JS Date conversion drifts by seconds.
- Every printout uses `src/lib/letterhead.ts`: `drawInfirmaryLetterhead` for jsPDF, `printWithLetterhead` for HTML print windows, `openPdfWindow` to open PDFs (tab opened before the async build so pop-up blockers allow it) — single source for the header.
- Test files (`*.test.ts`) are excluded from `tsconfig.app.json` because they use bun's test types.
- A station that serves a ticket with nothing to work on (e.g. Pharmacy with no prescription) must show the patient with an action to add the order or send them on — never fall back to the list, which looks like the patient vanished.
