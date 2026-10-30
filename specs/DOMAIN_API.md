# Domain and API

The browser uses direct authenticated HTTP requests. Server responses populate TanStack Query's in-memory cache. There is no browser database, local outbox, background retry runner or offline draft capture. Mutation errors remain visible; reconnecting does not replay failed mutations.

## Conventions

- UUID identifiers; server-derived actors and audit timestamps.
- Money is a whole-toman integer string. Quantities are decimal strings with up to three places; financial calculations use exact arithmetic and explicit half-up rounding.
- Jalali input/display, ISO date-only business dates, UTC audit timestamps.
- Versioned edits require `expectedVersion`. Stale writes are rejected, never silently merged.
- Financial records use server-side DRAFT, FINALIZED and REVERSED states. Drafts do not affect finalized totals. Finalization and linked, reasoned reversal remain explicit server transactions.
- Command receipts prevent duplicate financial effects. They are server idempotency protection, not an offline client queue.

## Identity

Only ADMIN and SUPERUSER accounts log in. Workers, suppliers and owners are shared contacts, not login accounts. SUPERUSER creates, resets and disables admins. Temporary-password sessions must change their password first.

Access tokens remain in memory; rotating refresh credentials use HttpOnly cookies. The server checks live session/account state and CSRF/origin protections. Cross-tab account changes clear private query data. See [Security](SECURITY.md).

## Current online endpoints

All paths below are under `/api/v1`.

| Resource | Operations |
| --- | --- |
| Authentication | `GET auth/csrf`; `POST auth/login`, `auth/refresh`, `auth/logout`, `auth/password`; `GET auth/me` |
| Admins | `GET/POST admins`; `POST admins/:id/status`, `admins/:id/reset-password` |
| Projects | `GET/POST projects`; `GET/PATCH projects/:id`; `POST projects/:id/lifecycle` |
| Contacts | `GET/POST contacts`; `PATCH contacts/:id`; `POST contacts/:id/lifecycle` |
| Engagements | `GET/POST engagements`; `PATCH engagements/:id` |
| Budgets | `GET/PUT projects/:id/budgets` |
| Notes | `POST drafts`; `GET drafts/project/:projectId`, `drafts/:id`; author comes from the session |
| Workforce | `POST workforce/drafts`; `GET workforce/records`, `workforce/analytics`; `POST workforce/drafts/:id/finalize`, `workforce/records/:id/reverse` |
| Materials | `GET/POST procurement/materials`; `POST procurement/materials/:id/lifecycle` |
| Procurement | `POST procurement/drafts`; `GET procurement/report`; `POST procurement/drafts/:id/finalize`, `procurement/records/:id/reverse` |
| Finance | `POST finance/draft`, `finance/finalize`, `finance/reverse`, `finance/decision`; `GET finance/records`, `finance/report`, `finance/export` |
| Evidence | `GET attachments/record/:id`; `POST attachments/upload-ticket`, `attachments/:id/complete`; `GET attachments/:id/download` |

Directory lists use bounded cursor pagination. The browser follows pages for the shared directory and requests active and archived records separately. Direct saves await server confirmation. Attachments upload immediately through a private ticket, binary PUT and completion request; a failed upload requires selecting the file again.

## Accounting invariants

Workers can span projects; each earning/payment/deduction belongs to one project. Six engagement modes remain DAILY, HOURLY, QUANTITY, MONTHLY, FIXED_CONTRACT and MANUAL. Existing earnings retain immutable quantity/rate snapshots. Monthly, fixed and manual amounts are approved explicitly.

Invoices create supplier liability, receipts create stock, consumption creates material cost, and payments settle debt. Transfers conserve inventory value and create no company cash movement. Stock cannot become negative. Weighted-average valuation and source-linked returns/reversals remain server-authoritative.

Approved claims determine approved revenue. Contract value is a reference, and receipts determine cash flow. Reports keep costs, purchases, stock, liability and cash distinct. Exact numerical examples are in [Acceptance](ACCEPTANCE.md).

Projects/contacts archive and reopen with a reason. Archive preserves history and blocks new assignments; it does not certify financial completion. Engagement ends are inclusive; periods for the same worker/project cannot overlap.
