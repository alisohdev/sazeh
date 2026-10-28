# Delivery phases and implementation tickets

All phases contribute to the agreed full V1. A phased build is not a reduction to a disposable prototype. Estimate dates after environment validation and the first complete workflow. Each ticket ends with changed files, commands/tests run, evidence and remaining risks.

## M0 Foundation and deployment feasibility

- T001: Scaffold React/Vite + NestJS + Drizzle/PostgreSQL workspace. Strict TypeScript, pinned compatible versions, lint/format, runtime validation and local Docker services. Document clean-machine commands and environment template without secrets.
- T002: Health endpoint, explicit migrations and isolated synthetic seed. Prove persistence across API restarts. Bootstrap superuser through a one-time secure operator command.
- T003: Create preview deployment configuration for paired Vite/NestJS and /api rewrite. Verify cookies, DB TLS/pooling and private object upload round trip when provider credentials are supplied. Prepare configuration without claiming a deployment if credentials are absent.
- T004: PWA shell and IndexedDB feasibility test on a real phone: save sample draft, reload offline, reconnect, acknowledge once. Use a stable preview origin for repeated tests.

**Exit:** Local foundation runs from documented commands; preview compatibility and offline persistence are demonstrated, or exact provider blockers recorded. No finance implementation until the architecture feasibility checks pass.

## M1 Accounts and projects

- T101: Login, forced password change, refresh/revocation, own change, superuser admin management and security tests.
- T102: Project/contact/material directories, lifecycle and budget editing with versions/audit.
- T103: Persian RTL navigation, mobile forms, Jalali/toman primitives and generated API client.

**Exit:** AUTH tests pass; ordinary admin cannot manage accounts; directory updates are auditable and usable on phone.

## M2 Workforce vertical slice

- T201: Engagement defaults and six earning modes, manager-approved monthly/fixed amounts.
- T202: Deductions, advances/partial payments, atomic finalization, idempotency, reversals and worker statement.
- T203: Extend the M0 outbox to workforce drafts, conflicts, expired auth and report pending status.

**Exit:** LAB01–04 and relevant COR/SYNC tests reconcile end-to-end. Review a sample project/worker statement with product owner.

## M3 Procurement and project stock

- T301: Supplier invoices, partial payments, allocations and statements.
- T302: Partial/full receipts, consumption, atomic transfers, consumption returns and supplier returns with valuation adjustment.
- T303: Offline procurement/stock drafts and dependency/negative-stock conflict handling.

**Exit:** STOCK01–05 and FIN01 pass with concurrent PostgreSQL tests. Invoice + receipt convenience does not double-count.

## M4 Project finances and evidence

- T401: Other expenses and payment settlement; category budgets and variance.
- T402: Contract amendments, claims/approval and owner receipts/advances.
- T403: Private attachments, offline binary queue, retry and audited links.
- T404: Project overview, statements, cash/cost/claims reports, CSV and print layouts.

**Exit:** FIN02–04, FILE and report reconciliation tests pass. Client reviews report terminology and sample outputs.

## M5 Production readiness and handover

- T501: Complete multi-tab sync, stable change cursors, cache isolation, storage failure/export and app-update tests.
- T502: Mobile/accessibility, local/Vercel tests, five-user load and regression suite.
- T503: Iran-hosting deployment runbook, migration rehearsal, DB/object backups and restore test, monitoring and recovery rehearsal.
- T504: Client acceptance, initial data plan and admin training. Separate preview synthetic data from production. Record sign-off before real financial use.

**Exit:** Release gates in specs/ACCEPTANCE.md pass. No completion claim based solely on preview appearance.

## Operational runbook outline

Secrets: database URL, JWT signing keys, refresh-token hash secret if used, allowed browser origins, object-storage endpoint/bucket/credentials, app environment. Browser receives only public config. Configure secrets directly with hosting provider; never commit or log them.

Preview database/storage must be isolated from production. Parallel previews require isolated datasets or an explicitly serialized shared demo environment; never assume isolated frontend URLs imply isolated data. Seed/reset commands are environment-guarded and cannot run against production.

Migrate with a single reviewed deployment job, backup before destructive changes, and use expand/contract schema changes for rollback compatibility. Health checks show readiness; structured logs omit passwords/tokens and sensitive attachment content. Track sync failures, posting errors, auth failures and DB connection exhaustion.

Scheduled backup target is daily with proposed 24-hour RPO and 4-hour RTO. Verify actual provider capability/retention before accepting those targets. Include object versions/referenced files in recovery. Document restoring into a new database, verifying totals and switching traffic. Never test restoration over the only live database.
