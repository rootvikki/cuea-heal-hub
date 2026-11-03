# src/lib rules

Business rules live here as pure modules with bun tests beside them (`bun test ./src/lib/<name>.test.ts`), so they stay testable without the UI.

- `pricing.ts` (tests): payment modes per patient type, check-in default, billing methods per mode, two-tier pricing, fixed service fees and fee waivers (`serviceFee`) — registration, check-in, edit biodata, stations and the payment panel all read it, so they can't drift apart.
- `billing.ts`: a visit's payment mode lives on `tickets.payment_mode` (set at check-in, read by every station); later changes go through `setVisitPaymentMode`. Bills are built only by `createInvoiceForTicket(ticketId, confirmed)` — Billing passes the exact lines/amounts on screen at Confirm, new lines join the visit's untouched unpaid bill, and every line is written to `invoice_items`.
- `receipt.ts`: one receipt per invoice for Billing, the payment panel and the patient portal, listing `invoice_items` plus completed payments.
- `paymentsQuery.ts` (tests): payments-report filters, grouping and Nairobi-time ranges; exports in `paymentsExport.ts` / `paymentsPdf.ts`. `billsQuery.ts` (tests): bills & services-charged reports; table exports share `tableExport.ts`.
- `pharmacyReport.ts` (tests): stock status / expiry / value rules; exports in `pharmacyExport.ts`.
- `labFields.ts` (tests): lab answer lists, age/sex ranges, critical thresholds, flags, reporting categories — entry, saved flags, critical alerts and reports all read it; finished results show their saved lines, not today's template.
- `letterhead.ts`: every printout uses it — `drawInfirmaryLetterhead` (jsPDF), `printWithLetterhead` (HTML), `openPdfWindow` (tab opened before the async build so pop-up blockers allow it).
- Excel exports write totals as live formulas over the detail sheet and dates as Excel serial numbers — users re-filter in Excel, and JS Date conversion drifts by seconds.
- `tickets.ts`: ticket numbers come only from `next_ticket_number()` (daily Nairobi counter, prefix in `system_settings.ticket_prefix`, unique per `tickets.queue_date`; first ticket of a day closes previous-day triage).
- `liveUpdates.ts`: one app-wide realtime channel (mounted by `LiveUpdatesHub`); screens use `useLiveTable`; `live_updates` setting switches to 60-second refresh. `cacheReset.ts`: "clear cache for everyone" bumps `system_settings.cache_version`; browsers wipe local data except sign-in and reload.
- `isolatedSession.ts`: "Log in as" tabs get per-tab storage and a private sign-in channel (first import in `main.tsx`, via `/login-as#t=<token>` from `admin-login-as`); sign-outs go through `signOutThisTab`.
