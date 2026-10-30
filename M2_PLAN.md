# M2 Workforce Plan

## Objective

Deliver the workforce financial slice on the updated M1b base: six earning modes, immutable rate/quantity snapshots, project-specific deductions and worker payments, reliable offline draft synchronization, online review/finalization, auditable reversals, worker statements and labor analytics. All amounts are integer toman strings and all financial effects are server-authoritative.

## Approved domain rules

- Bind each earning, deduction, payment, advance and correction to exactly one project and one worker.
- Support DAILY, HOURLY, QUANTITY, MONTHLY, FIXED_CONTRACT and MANUAL engagement types.
- DAILY, HOURLY and QUANTITY earnings use decimal quantity × snapshotted rate with the existing half-up-to-one-toman rule. Persist the submitted quantity, rate and engagement type on the earning. Later engagement changes never recalculate an existing earning.
- MONTHLY, FIXED_CONTRACT and MANUAL earnings require a manager-approved amount and a nonblank period, milestone or work explanation. Do not prorate or infer statutory adjustments.
- Deductions reduce net labor cost and worker balance; they are not cash payments. Advances are outgoing worker payments and count once in cash paid and balance. A negative balance is labeled worker advance/credit.
- Derive finalized statement totals from immutable finalized records and their reversals. Keep pending local/server drafts visibly separate from finalized totals.
- Finalization is an online, server-authoritative, transactional and idempotent command. Recheck account, project, worker, versions and payload; a repeated command ID/body returns its stored result, while changed content conflicts. Concurrent finalization must create one effect.
- Correct finalized records only with a reasoned, linked reversal/correction. Preserve the source record and audit actor/reason. Reject a second reversal.
- Keep financial draft commands account-scoped and immutable after first send. Lost replies retry with the same command ID/body; pending local work survives refresh, account switching barriers and M1a/M1b recovery behavior.
- No automated tax, insurance, overtime or salary-proration logic.

## Delivery units

### 1. Domain and schema

- Inspect the M1b database, contracts, audit, sync revision, authenticated receipts, IndexedDB schema and UI conventions.
- Add an additive Drizzle migration and typed schema for workforce earning lines, deductions, worker payments/advances, and correction links. Enforce valid amounts, quantities, project/worker ownership, unique command identities and one reversal per original.
- Add strict runtime contracts for create/edit/finalize/reverse and report filters. Represent money and quantities as decimal strings at API boundaries; never calculate money with JavaScript floating point.
- Add focused decimal/domain helpers and deterministic reconciliation fixtures, including the 3,000,000 − 200,000 − 1,500,000 = 1,300,000 balance.

### 2. API

- Add authenticated workforce endpoints for listing/creating/editing drafts, online finalization, reversal, worker statement and labor analytics.
- Share one domain service across REST and sync operations. Derive actor from the authenticated session; reject client-supplied actor, finalized status or calculated total.
- Commit financial effects, audit, sync revision and idempotency receipt together. Lock affected records in deterministic order and verify duplicate/concurrent finalization, version conflicts and account isolation.
- Ensure statement and analytics totals use finalized records only, apply project/date filters consistently, include drill-down IDs, and report draft/pending counts separately.

### 3. Offline drafts

- Extend the existing account/origin-scoped IndexedDB workspace by forward migration; preserve M1a notes, M1b directories, leases and queued commands.
- Save each local draft and immutable outbox command atomically. Validate and sync draft mutations online; never finalize from sync or offline.
- Preserve parent-before-child ordering, auth pause/lock, conflict/retry states, storage-error visibility, stale-ack protection and account separation. Support lost-reply replay without duplicate records/effects.
- Provide review of synced server drafts and an explicit online finalization action.

### 4. Mobile UI and statements

- Add Persian RTL earning, deduction and payment/advance forms, with fields driven by engagement type and short manager explanations for manual amounts.
- Provide worker statement cards with gross earnings, deductions, net earnings, payments, remaining balance, project/date filters and entry drill-down.
- Add labor analytics sourced from finalized data, with drill-down and a clear pending-drafts section that cannot be mistaken for posted totals.
- Keep each React component within 200 lines, use the existing shadcn/Tailwind and query/repository patterns, and verify the built UI at 360 px. Capture review screenshots.

### 5. Regression and handoff

- Extend decimal, PostgreSQL API and built-browser coverage for LAB01–04; relevant COR/SYNC cases; duplicate finalization; concurrent writes; lost replies; reversal behavior; account isolation; and retained M1a/M1b cases.
- Run the repository verification flow, inspect migration replay and the full diff, and record exact commands, results, screenshots and limitations.
- Open a draft PR targeting main with the implementation plan, acceptance evidence, screenshots and limitations. Stop before merge or deployment.

## Acceptance evidence

- LAB01 reconciles gross 3,000,000, net labor cost 2,800,000, cash paid 1,500,000 and remaining balance 1,300,000.
- LAB02 keeps the same worker's second project's balance independent.
- LAB03 preserves the original 3,000,000 snapshot after the engagement default becomes 1,200,000; only new earnings use the new default.
- LAB04 records a manually approved 5,000,000 partial-month amount without proration.
- COR01 retains the original and links a reasoned reversal; balances/cost include the inverse exactly once.
- SYNC01–04 and applicable SYNC06–09 cases preserve local work, immutable retries, conflict visibility, account isolation and M1a/M1b queue/recovery guarantees.
- Duplicate and competing finalizations produce exactly one finalized financial effect. An advance is not deducted a second time. Deductions do not inflate cash paid. Project/date filters and drill-down reconcile to the same finalized ledger.

## Working boundaries

- Base revision: fetched `origin/main` at `018309cd164cf1ed599a659923d2f53874c8b5e8`.
- Branch: `codex/m2-workforce`.
- Keep the pre-existing `pnpm-workspace.yaml` edit untouched and excluded from M2 commits/PR.
- Use synthetic local fixtures only. No deployment, production data, merge or live financial records.

## Verification and handoff

- `pnpm.cmd typecheck` and `pnpm.cmd lint` pass after the final UI component split. Changed TypeScript/TSX and Markdown files pass targeted Prettier formatting.
- `pnpm.cmd verify:database`, `pnpm.cmd verify:bootstrap`, `pnpm.cmd build`, and `pnpm.cmd storage:verify` passed on this branch. The web build reports its existing large-chunk warning (>500 kB).
- `pnpm.cmd verify:api` passes LAB01–04, exact decimal snapshots and 1,300,000 balance reconciliation, multi-project separation, changed default-rate history, duplicate and competing finalization, lost-reply replay, reversal audit/idempotency and account isolation.
- Before the focused PR #5 correction pass, `pnpm.cmd verify:browser` passed all 12 M0/M1b/M2 tests. The M2 360 px flow saves and edits offline, reloads the draft, replays a committed-but-lost reply with the same command, explicitly finalizes online, and verifies the posted statement without horizontal overflow.
- Full `pnpm.cmd format:check` remains blocked only by the pre-existing `pnpm-workspace.yaml` permission edit; all M2-owned files pass the targeted formatter check. That file remains unchanged and excluded from the M2 PR.
- Screenshots: [offline draft](screenshots/m2-mobile-offline-workforce-draft.png) and [worker statement](screenshots/m2-mobile-worker-statement.png).
- Evidence uses local synthetic PostgreSQL and desktop Chrome at a 360 px viewport. No actual-device, preview, production, deployment or merge verification is claimed.
- Draft PR target: `main`; stop at draft state.

## PR #5 focused correctness follow-up — 30 October 2026

- Workforce upload retries reread the latest local draft in the transaction and update retry status only when the failed command still matches its edit revision. A browser regression holds an upload, edits the draft, fails the request, reloads, and confirms the newer data and revision survive.
- Reversal records are rejected as reversal targets. The API regression verifies a reversal-of-reversal request conflicts and creates no nested inverse.
- Date-filtered statements return the all-time opening balance alongside period totals and the computed closing balance. API coverage verifies a 1,000,000 opening balance less a 200,000 period payment closes at 800,000; the 360 px browser flow checks the opening and closing balance cards render.
- Finalization locks and rechecks the worker, active project, and date/type-matching active engagement. Regressions cover a project archived after draft save, an engagement type changed after draft save, and a default-rate change that leaves the captured quantity/rate/amount intact.
- Follow-up checks passed: `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd build`, `pnpm.cmd verify:api`, and `pnpm.cmd verify:browser -- tests/m2/workforce.spec.ts` (2 M2 browser tests). Targeted Prettier check and `git diff --check` passed.
- The follow-up still uses local synthetic PostgreSQL and desktop Chrome. No device, preview, production, merge, or deployment verification is claimed.
