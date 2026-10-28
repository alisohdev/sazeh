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
- T102 (M1b): Project/contact directories, worker-project assignments and default rates; active/archive/reopen with required reasons; editable budget labels, versions and audit. Materials move to M3. Archive is visibility state, not financial completion.
- T103: Persian RTL navigation, mobile forms, Jalali/toman primitives and generated API client.
- T104 (M1b): Account-scoped directory commands, consistent bootstrap/change feed, immutable retries, conflict recovery and shared-business authorization. These guarantees are required now; M5 broadens hardening.
- T105 (M1b): Project information, explicitly defined counts, filters and drill-down. Show entered metadata; financial charts wait for source modules.

**Exit:** AUTH and M1b directory/project/sync/mobile acceptance tests pass; ordinary admin cannot manage accounts; shared directory updates are auditable, recoverable offline and usable on phone.

## M2 Workforce vertical slice

- T201: Use M1b engagement assignments/default rates for six earning modes and manager-approved monthly/fixed amounts. Calculations and earnings begin here.
- T202: Deductions, advances/partial payments, atomic finalization, idempotency, reversals and worker statement.
- T203: Extend the M0 outbox to workforce drafts, conflicts, expired auth and report pending status.
- T204: Reconciled labor analytics and worker statements from finalized earnings, deductions and payments, with project/date/worker filters and drill-down.

**Exit:** LAB01–04 and relevant COR/SYNC tests reconcile end-to-end. Review a sample project/worker statement with product owner.

## M3 Procurement and project stock

- T301: Material directory (deferred from M1), supplier invoices, partial payments, allocations and statements.
- T302: Partial/full receipts, consumption, atomic transfers, consumption returns and supplier returns with valuation adjustment.
- T303: Offline procurement/stock drafts and dependency/negative-stock conflict handling.
- T304: Procurement, supplier-debt, stock and consumption analytics from posted M3 records, with filters and drill-down.

**Exit:** STOCK01–05 and FIN01 pass with concurrent PostgreSQL tests. Invoice + receipt convenience does not double-count.

## M4 Project finances and evidence

- T401: Other expenses and payment settlement; use M1b category budgets for reconciled variance.
- T402: Contract amendments, claims/approval and owner receipts/advances.
- T403: Private attachments, offline binary queue, retry and audited links.
- T404: Extend the M1b information overview with reconciled financial statements, cash/cost/claims reports, charts, CSV and print layouts using M2-M4 sources. Distinguish incurred cost, cash, approved revenue and entered contract value.

**Exit:** FIN02–04, FILE and report reconciliation tests pass. Client reviews report terminology and sample outputs.

## M5 Production readiness and handover

- T501: Complete multi-tab sync, stable change cursors, cache isolation, storage failure/export and app-update tests.
- T502: Mobile/accessibility, local/Vercel tests, five-user load and regression suite.
- T503: Iran-hosting deployment runbook, migration rehearsal, DB/object backups and restore test, monitoring and recovery rehearsal.
- T504: Client acceptance, initial data plan and admin training. Separate preview synthetic data from production. Record sign-off before real financial use.

**Exit:** Release gates in specs/ACCEPTANCE.md pass. No completion claim based solely on preview appearance.

## Synthetic demos and incremental analytics

M1b uses synthetic Persian projects and owner/worker/supplier contacts, varied dates, entered budgets, multi-project workers, non-overlapping engagement history and archive examples. Show defined counts, filters and drill-down without fabricated financial metrics. The warmed API fixture has 10 active projects, 100 workers, 30 suppliers and five concurrent admin sessions; document owner/archive/engagement/budget counts. Keep deterministic edge-case fixtures separate from timing samples.

M2 demo records reconcile labor statements. M3 adds invoices, partial payments and stock scenarios from specs/ACCEPTANCE.md. M4 adds expenses, claims and receipts so combined reports reconcile to drill-down. Charts arrive with source modules. All data is synthetic, reset only in local or isolated preview environments, with no real personal data or production reset. The larger full-V1 acceptance fixture remains a later release gate.

## Operational runbook outline

Secrets: database URL, JWT signing keys, refresh-token hash secret if used, allowed browser origins, object-storage endpoint/bucket/credentials, app environment. Browser receives only public config. Configure secrets directly with hosting provider; never commit or log them.

Preview database/storage must be isolated from production. Parallel previews require isolated datasets or an explicitly serialized shared demo environment; never assume isolated frontend URLs imply isolated data. Seed/reset commands are environment-guarded and cannot run against production.

Migrate with a single reviewed deployment job, backup before destructive changes, and use expand/contract schema changes for rollback compatibility. Health checks show readiness; structured logs omit passwords/tokens and sensitive attachment content. Track sync failures, posting errors, auth failures and DB connection exhaustion.

Scheduled backup target is daily with proposed 24-hour RPO and 4-hour RTO. Verify actual provider capability/retention before accepting those targets. Include object versions/referenced files in recovery. Document restoring into a new database, verifying totals and switching traffic. Never test restoration over the only live database.
