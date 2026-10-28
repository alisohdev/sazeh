# M1b plan

## Status and scope

Planning review revised on 28 October 2026 using the operator decisions in DECISIONS.md. This revision is documentation-only. Implementation requires an explicit go. No implementation, execution cadence or deployment starts during this planning task.

One future implementation PR targets updated main after M1a. Business records are shared by full-session ADMIN and SUPERUSER accounts; local drafts and commands remain account-scoped. Preserve private M1a notes and the M0 unowned export boundary. Keep unrelated changes, including local pnpm-workspace.yaml build permissions, outside planning commits.

Read README.md, PRD.md, DECISIONS.md, DELIVERY.md, adr/ADRS.md, specs/DOMAIN_API.md, specs/ACCEPTANCE.md, specs/OFFLINE_SECURITY.md and M1A_ARCHITECTURE.md before implementation. The rules below are planned behavior, not implemented capabilities.

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

- [ ] Extend apps/api/src/db/schema.ts through additive migrations for projects, contacts, engagements, budgets, audit and directory sync persistence. Preserve existing accounts, notes, receipts and client queues.
- [ ] Define runtime-validated request/response contracts in packages/contracts/src/index.ts and matching OpenAPI field schemas before browser integration. Cover project/contact/engagement CRUD, lifecycle, budgets and sync endpoints.
- [ ] Share domain transactions between REST and queued commands. Enforce expectedVersion; stale updates return 409 with current server representation. Derive actor from the authenticated principal. Commit business mutation, audit and published change revision atomically, plus receipt when commanded.
- [ ] Evidence: migration repeat-apply/preservation checks and PostgreSQL tests for stale versions, actor spoofing, reason validation, all six types, inclusive/ongoing dates, invalid ranges, adjacent periods, different-project assignments, concurrent overlap rejection and archived-record restrictions. Archive/reopen preserves IDs, links and history.

### 2. Authenticated directory/project APIs and integration checks

- [ ] Add project/contact/engagement modules through apps/api/src/app.module.ts. Implement endpoint families in specs/DOMAIN_API.md, including versioned budget editing. Default project lists to active records; document bounded pagination and explicit archive filters.
- [ ] Evidence: API integration checks prove anonymous and temporary-password access denied, ADMIN/SUPERUSER shared access, server-derived audit actors, no contact-created users or contact login, metadata round-trips, budget baseline/history, archive/reopen and retained relationships. Concurrent admin edits cannot silently overwrite each other.

### 3. Directory offline commands, bootstrap/change-feed consistency, conflict handling and recovery

- [ ] Extend the existing authenticated IndexedDB database through a forward schema migration, preserving database identity, notes, outbox and leases. Save local entity plus immutable command atomically with client-generated UUIDs.
- [ ] Add bounded authenticated /sync/commands, consistent paginated /sync/bootstrap and commit-ordered /sync/changes. Use user-scoped receipts and canonical body comparison. Lost-reply retries return one saved result; same ID with a changed body returns 409 without another effect.
- [ ] Sync parent contacts/projects before dependent links. Independent commands may succeed while invalid/conflicting commands remain reviewable. Editing after sending creates a fresh dependent command rather than changing the sent ID/body.
- [ ] Preserve identity epochs, one-runner leases, authentication pause, pending-work logout review, export and account-switch barriers. Separate snapshots, local drafts and acknowledgments. Match acknowledgments to command/local revision so an old reply cannot overwrite a newer edit or mark it synced.
- [ ] Evidence: PostgreSQL concurrency checks prove bootstrap data matches its cursor and paginated pulls miss no late commit. Browser checks prove tombstones, obsolete-cursor rebuild preserving pending work, offline reload/reconnect, parent ordering, immutable/lost-reply retries, held conflicts and explicit resolution, lease recovery, expired auth and cross-account fencing. Hold an acknowledgment, save a newer edit, release the reply and assert newer values/pending state survive.

### 4. Persian RTL mobile screens and project overview

- [ ] Add projects, workers and suppliers navigation plus project/contact/engagement screens under apps/web/src/. Extend App.tsx, drafts/draft-repository.ts and styles.css while preserving existing workspace/identity boundaries.
- [ ] Use one-column forms at 360 px, Persian RTL, Jalali input mapped to ISO date-only values, digit normalization, toman formatting, self-hosted fonts, visible focus and field-level errors.
- [ ] Show local-save, pending, acknowledged and review-needed states, pending count and last successful sync time. Conflict UI shows local/server values and keep-server or revised-draft actions.
- [ ] Overview shows project information, entered contract/budget metadata, owners and engagement drill-down. Project counts are distinct server projects matching filters before pagination. Per-project worker counts are distinct linked worker contacts, including historical links, labeled accordingly; engagement row counts are separate. Pending local rows are separate from server counts. Counts and drill-down share filters; cached values show last-sync status.
- [ ] Evidence: screenshots of overview/create/edit, archive/reopen with links, offline/conflict review and 360 px RTL states. Browser assertions prove counts/filters/drill-down agree, labels/focus are usable, no page-wide overflow and pending work remains with its account. Video is optional if screenshots cannot show the behavior.

### 5. End-to-end regression, performance measurement and handoff

- [ ] Extend apps/api/scripts/verify-api.ts and verify-browser.ts with M1b acceptance cases. Preserve all M1a account, refresh, note, lease, logout and legacy-isolation regressions plus AUTH01-04, SYNC01-04, SYNC07, LOCAL02 and MOBILE01.
- [ ] Run corepack pnpm lint, typecheck and format:check before implementation pushes. Run corepack pnpm verify:api, verify:browser and verify:m0 on isolated synthetic fixtures and the built application. Record commands/results and exact reviewed SHA.
- [ ] Use five concurrent admin sessions, 10 active projects, 100 worker contacts and 30 supplier contacts. Document owner/archive/engagement/budget counts, hardware, payloads, warmup and sample counts. Record at least 200 warmed samples per ordinary project/contact/engagement/budget list/write path tested, including representative filters. Keep write-induced fixture changes documented. Require each ordinary list/write p95 below 1,000 ms, excluding external network latency.
- [ ] Measure dispatch-to-visible sync acknowledgment p50/p95 and auth/me context timing. Report sample counts and slow cases. There is no one-second sync gate or relative-regression percentage gate. Record cold starts and actual-device timings separately.
- [ ] Review final diff and evidence for authorization, data loss, domain correctness and scope. Resolve findings on their merits; rerun affected checks after changes. No mandatory agent, reviewer or browser-lane count.
- [ ] Prepare one PR targeting main with scope, evidence, screenshots, performance measurements and limitations. Stop at STACK-READY at the exact reviewed head for operator UI review/landing. Do not merge or deploy as part of implementation handoff.

## Acceptance and tooling

Mandatory outcomes are M1B-PROJ01-03, M1B-DIR01, M1B-REL01-02, M1B-AUTH01, M1B-SYNC01-04, M1B-MOBILE01 and M1B-INFO01 in specs/ACCEPTANCE.md. Tests establish transactional correctness; built-browser checks establish visible recovery and isolation. Screenshots support UI review and do not replace concurrency assertions.

Use available Git/forge tools with hooks enabled and repository scripts. No dependency on swarm workers, /deslop, /no-comments or installed execution plugins. No hourly audit cadence is required. Save screenshots under output/playwright/m1b/ with descriptive names. Video is optional. Record exact revision, commands/results and evidence paths in the implementation handoff. The original .audit/m1b-plan.tsv records historical planning, not current execution requirements.

## Analytics and realistic synthetic demos

M1b uses synthetic Persian names, owner/worker/supplier roles, a multi-role contact, multi-project workers, non-overlapping engagement history, archived examples, varied dates and entered budgets/rates. Use small deterministic conflict/retry/account fixtures separately from timing samples. Label demos as synthetic. Seed/reset is local or isolated preview only; use no real personal data or production reset.

M1b delivers project information, defined counts, filters and drill-down. M2 adds labor analytics and statements from finalized earnings/deductions/payments. M3 adds procurement, supplier-debt, stock and consumption analytics. M4 combines those sources with expenses, approved claims and receipts for financial reports, cash/cost distinctions and budget variance. Charts wait for their source modules; missing metrics are deferred, never invented or presented as fabricated zeroes. DELIVERY.md assigns ownership; specs/ACCEPTANCE.md provides later reconciliation fixtures.

## Remaining risks and next action

The largest risk is extending note-only sync to shared versioned directories with consistent bootstrap and recovery. Prove unit 3 invariants before expanding UI. Enforce overlap and archived-assignment rules under database concurrency, not only in forms. No prototype or new application verification has run for this planning revision.

The supplied scope/domain/process decisions are resolved in DECISIONS.md and the specifications. Next: review, commit and push only the planning revision, then wait for explicit implementation authorization. Before implementation, refresh main and verify the M1a baseline. Report environment limitations without claiming preview or production proof.
