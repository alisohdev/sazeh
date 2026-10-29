# M1b plan

## Status and scope

Implemented on `codex/m1b-implementation`, based on merged M1a/M1b planning PR #3 (`8319ed7`). This document records implementation evidence and handoff status. The product decisions from DECISIONS.md remain the source of truth.

Business records are shared by full-session ADMIN and SUPERUSER accounts; local drafts and commands remain account-scoped. M1b delivers projects, contacts, worker-project assignments and default rates, editable budget labels, authenticated offline synchronization, and the Persian RTL project overview. It does not deliver earnings, materials, financial charts, deployment, or financial completion certification through archiving. The unrelated local `pnpm-workspace.yaml` build-permission edit remains separate from the implementation and must stay out of the PR.

Implementation followed README.md, PRD.md, DECISIONS.md, DELIVERY.md, adr/ADRS.md, specs/DOMAIN_API.md, specs/ACCEPTANCE.md, specs/OFFLINE_SECURITY.md and M1A_ARCHITECTURE.md. The requirements below describe delivered behavior and its evidence.

## Resolved domain boundaries

- Projects support create/list/edit/detail and active -> archived -> active. Archive/reopen require a nonblank reason, expectedVersion and audit event. Default lists hide archived projects; explicit archived views retain access. Archive does not certify financial completion.
- Contacts have independent worker/supplier/owner flags, optional phone and soft archive. They are shared business contacts, never login accounts. Suppliers stay company-wide; M3 invoices provide project relationships.
- Engagements link workers to projects with type, default rate and effective dates. Types: DAILY, HOURLY, QUANTITY, MONTHLY, FIXED_CONTRACT, MANUAL. Workers can span projects. For the same worker/project, prohibit overlapping periods regardless of type, including concurrent writes. End dates are inclusive; omitted end means ongoing. Reject end before start. Next-day adjacency is allowed; same-day endpoint overlap is not.
- Archived projects/contacts preserve history and existing assignments. Block new assignments to archived records, including owner assignment and moving an engagement to an archived endpoint. Existing assignments stay visible. Date edits must still satisfy overlap rules.
- Initial contract value, budget amounts and default rates are validated whole-toman strings. Budget categories are editable labels with versioning, an audit trail and retained baseline; no category-management subsystem.
- Materials move to M3. Assignments/default rates are M1b; calculations/earnings remain M2. Financial documents, computed totals/balances/margins/variance, contract amendments and financial charts wait for their source modules. No new account roles, tenancy or supplier-project join.

## Verifiable implementation units

Check a box only when its named evidence exists. Use repository scripts, PostgreSQL integration checks and the installed Playwright test runner against the built application. Observable outcomes determine acceptance; fixed agent/reviewer/browser-lane counts do not. Use isolated fixtures and output paths for concurrent checks.

### 1. Schema, contracts, domain rules, versioning and audit provenance

- [x] Extend apps/api/src/db/schema.ts through additive migrations for projects, contacts, engagements, budgets, audit and directory sync persistence. Preserve existing accounts, notes, receipts and client queues.
- [x] Define runtime-validated request/response contracts in packages/contracts/src/index.ts and matching OpenAPI field schemas before browser integration. Cover project/contact/engagement CRUD, lifecycle, budgets and sync endpoints.
- [x] Share domain transactions between REST and queued commands. Enforce expectedVersion; stale updates return 409 with current server representation. Derive actor from the authenticated principal. Commit business mutation, audit and published change revision atomically, plus receipt when commanded.
- [x] Evidence: repeat-apply migrations and PostgreSQL checks cover stale versions, actor spoofing, reasons, all six types, inclusive/ongoing dates, invalid ranges, adjacency, multi-project assignments, concurrent overlap rejection and archived-record restrictions. Archive/reopen preserves IDs, links and history.

### 2. Authenticated directory/project APIs and integration checks

- [x] Add project/contact/engagement modules through apps/api/src/app.module.ts. Implement endpoint families in specs/DOMAIN_API.md, including versioned budget editing. Default project lists to active records; document bounded pagination and explicit archive filters.
- [x] Evidence: API integration checks prove anonymous and temporary-password access denied, ADMIN/SUPERUSER shared access, server-derived audit actors, no contact-created users or contact login, metadata round-trips, budget baseline/history, archive/reopen and retained relationships. Concurrent admin edits cannot silently overwrite each other.

### 3. Directory offline commands, bootstrap/change-feed consistency, conflict handling and recovery

- [x] Extend the existing authenticated IndexedDB database through a forward schema migration, preserving database identity, notes, outbox and leases. Save local entity plus immutable command atomically with client-generated UUIDs.
- [x] Add bounded authenticated /sync/commands, consistent paginated /sync/bootstrap and commit-ordered /sync/changes. Retain the latest 10,000 revisions and return `CURSOR_EXPIRED` with reset guidance for older cursors. Use user-scoped receipts and canonical body comparison. Lost-reply retries return one saved result; same ID with a changed body returns 409 without another effect.
- [x] Sync parent contacts/projects before dependent links. Independent commands may succeed while invalid/conflicting commands remain reviewable. Editing after sending creates a fresh dependent command rather than changing the sent ID/body.
- [x] Preserve identity epochs, one-runner leases, authentication pause, pending-work logout review, export and account-switch barriers. Separate snapshots, local drafts and acknowledgments. Match acknowledgments to command/local revision so an old reply cannot overwrite a newer edit or mark it synced. Queue a follow-up sync pass when a new command arrives during an active pass.
- [x] Evidence: PostgreSQL checks prove bootstrap data matches its cursor, paginated pulls miss no late commit, expired cursors return reset guidance, and REST/queued create/update paths reject archived project, worker and owner assignments. Browser checks prove offline reload/reconnect, parent ordering, immutable/lost-reply retries, held conflicts and explicit resolution, lease recovery, delayed acknowledgments, expired-cursor rebuild with drafts/outbox preserved, expired auth and cross-account fencing. M1a tests retain tombstone/rebuild, pending-work, logout and account-isolation coverage.

### 4. Persian RTL mobile screens and project overview

- [x] Add projects, workers and suppliers navigation plus project/contact/engagement screens under apps/web/src/. Keep App.tsx and screen composition small, and preserve existing workspace/identity boundaries.
- [x] Use one-column forms at 360 px, Persian RTL, Jalali input mapped to ISO date-only values, digit normalization, toman formatting, self-hosted fonts, visible focus and field-level errors.
- [x] Show local-save, pending, acknowledged and review-needed states, pending count and last successful sync time. Conflict UI shows local/server values and keep-server or revised-draft actions.
- [x] Overview shows project information, entered contract/budget metadata, owners and engagement drill-down. Project counts are distinct server projects matching filters before pagination. Per-project worker counts are distinct linked worker contacts, including historical links, labeled accordingly; engagement row counts are separate. Pending local rows are separate from server counts. Counts and drill-down share filters; cached values show last-sync status.
- [x] Evidence: screenshots cover overview, archived history, offline queue and conflict review at 360 px. Browser assertions prove parent ordering, recovery, both conflict choices, count labels and no page-wide overflow. Video is not needed for the observed states.

### 5. End-to-end regression, performance measurement and handoff

- [x] Extend apps/api/scripts/verify-api.ts and verify-browser.ts with M1b acceptance cases. Preserve M1a account, refresh, note, lease, logout and legacy-isolation regressions plus the in-scope AUTH, SYNC, date and mobile cases.
- [x] Run lint, typecheck, format:check, verify:api, verify:browser and verify:m0 on synthetic fixtures and the built application. Record commands/results and the exact reviewed SHA in this handoff.
- [x] Measure five concurrent admin sessions against 10 active and 2 archived projects, 10 owners, 100 workers, 30 suppliers, 200 seeded engagements and 20 budget lines. Record 200 warmed samples for every ordinary project/contact/engagement/budget list and write path.
- [x] Measure sync command acknowledgment and auth/me p50/p95 with no one-second sync or relative-regression gate. Report exact sample counts and hardware. Actual-device and cold-start timings remain outside this local benchmark.
- [x] Review the implementation diff and evidence for authorization, data loss, domain correctness and agreed scope. Resolve concrete findings and rerun affected checks. No mandatory agent, reviewer or browser-lane count.
- [ ] Prepare and push one draft PR targeting main with scope, evidence, screenshots, performance measurements and limitations. Stop for operator UI review. Do not merge or deploy as part of this handoff.

## Acceptance and tooling

Mandatory outcomes are M1B-PROJ01-03, M1B-DIR01, M1B-REL01-02, M1B-AUTH01, M1B-SYNC01-04, M1B-MOBILE01 and M1B-INFO01 in specs/ACCEPTANCE.md. Tests establish transactional correctness; built-browser checks establish visible recovery and isolation. Screenshots support UI review and do not replace concurrency assertions.

Use available Git/forge tools with hooks enabled and repository scripts. No dependency on swarm workers, /deslop, /no-comments or installed execution plugins. No hourly audit cadence is required. Save screenshots under output/playwright/m1b/ with descriptive names. Video is optional. Record exact revision, commands/results and evidence paths in the implementation handoff. The original .audit/m1b-plan.tsv records historical planning, not current execution requirements.

## Analytics and realistic synthetic demos

M1b uses synthetic Persian names, owner/worker/supplier roles, a multi-role contact, multi-project workers, non-overlapping engagement history, archived examples, varied dates and entered budgets/rates. Use small deterministic conflict/retry/account fixtures separately from timing samples. Label demos as synthetic. Seed/reset is local or isolated preview only; use no real personal data or production reset.

M1b delivers project information, defined counts, filters and drill-down. M2 adds labor analytics and statements from finalized earnings/deductions/payments. M3 adds procurement, supplier-debt, stock and consumption analytics. M4 combines those sources with expenses, approved claims and receipts for financial reports, cash/cost distinctions and budget variance. Charts wait for their source modules; missing metrics are deferred, never invented or presented as fabricated zeroes. DELIVERY.md assigns ownership; specs/ACCEPTANCE.md provides later reconciliation fixtures.

## Verification results and remaining limitations

Final local verification passed with `pnpm.cmd verify:m0`: lint, TypeScript, formatting, repeat migrations/seeding, bootstrap, production build, storage put/get, API integration and all 10 built-browser tests passed. The browser run retained all 6 M1a regression cases and passed 4 M1b directory cases. `pnpm.cmd verify:performance` also passed; it measured 200 samples for each path below.

| API path                    |       p95 |
| --------------------------- | --------: |
| Projects list               |  50.13 ms |
| Contacts list               |  54.17 ms |
| Engagements list            |  76.20 ms |
| Budgets list                |  97.59 ms |
| Project writes              | 191.05 ms |
| Contact writes              | 162.14 ms |
| Engagement writes           | 199.10 ms |
| Budget writes               | 129.90 ms |
| Sync command acknowledgment | 158.98 ms |
| Auth/me                     |  44.33 ms |

The warmed API benchmark is recorded in [m1b-api-performance.json](output/perf/m1b-api-performance.json). It used five concurrent authenticated ADMIN sessions on Windows x64, Node 24.8.0, an Intel i7-8550U with 8 logical CPUs and 11.9 GiB available memory. The fixture had 10 active projects, 2 archived projects, 10 owners, 100 workers, 30 suppliers, 200 engagements, 20 budget lines and 200 measured writes per list/write resource. Each ordinary list/write path had 200 samples after 10 read warmups; loopback response-body reads are included. The maximum ordinary p95 was engagement writes at 199.10 ms, below the 1,000 ms target. Sync acknowledgment p95 was 158.98 ms and auth/me p95 was 44.33 ms; neither has a pass/fail latency gate.

Screenshot evidence is under [output/playwright/m1b](output/playwright/m1b): `m1b-mobile-project-overview.png`, `m1b-mobile-archived-project-history.png`, `m1b-mobile-offline-queue.png` and `m1b-mobile-conflict-review.png`. These are local synthetic-data browser captures at 360 px; they are UI review evidence, not actual-device or production proof.

The web build emits a 604.60 KB minified JavaScript chunk warning. The local benchmark does not measure actual-device or cold-start performance. No preview deployment, production data, or production deployment was used. M2-M4 financial analytics remain deferred until their source modules deliver finalized data; M1b displays no fabricated financial metrics.

Next: commit and push the implementation, then open a draft PR. Stop for review before merge or deployment. The performance report's `baseRevision` field identifies the last committed implementation baseline (`0bfc192`); this plan and the PR identify the exact final reviewed commit after it is created.
