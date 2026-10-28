# M1a implementation plan

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame the work with a falsifiable completion predicate, bounded scope, and rigor level.
- [x] Phase B: Design atomic implementation units, put the riskiest unknowns first, and write this plan down.
- [x] Phase C: Treat each unit as an experiment, make the smallest change, verify it on the real artifact, and revert any change that does not advance the predicate.
- [x] Phase D: Keep the append-only decision trail in `decisions.tsv`.
- [x] Phase E: Verify the whole product against the completion predicate and hand it back.

## Definition of done

M1a is complete when all application API draft reads and writes require a live authenticated session, the first temporary password cannot access application data, only a superuser can manage admin accounts, and account disable/reset/password change/logout/replayed refresh tokens revoke server access as specified. New drafts and command receipts carry server-derived user identity. Existing M0 rows remain unowned and inaccessible unless a future operator process explicitly adopts them.

The browser must keep access tokens in memory, scope IndexedDB and outbox operations by environment, origin and authenticated user, preserve pending drafts through session expiry and explicit logout/account switching, pause on authentication failure, and run one lease-owning synchronizer per user. The updated M0 browser test and M1a API/browser checks must exercise direct unauthorized access, user isolation, refresh replay, session revocation, error classes, and concurrent sync. The Persian RTL screens must remain usable at 360 px. The Windows startup guide must work without writing under Program Files. No financial or project-management modules are included, and no unauthenticated preview is deployed.

## Scope and rigor

The baseline contains a NestJS/Drizzle API, a React/Vite PWA, one global IndexedDB draft store, one draft controller, an existing Argon2id bootstrap user table, and M0 API/browser verification. The change is expected to touch roughly 25–35 files across the API, migration, shared contracts, browser session and sync code, tests, and documentation. The largest risks are session revocation, refresh replay, attribution of M0 rows, and offline queue ownership. Rigor is high for these boundaries. The UI reuses the current Persian typography, colors, RTL layout, and mobile breakpoints.

The clean baseline passed `corepack pnpm verify:m0` on 28 October 2026. PostgreSQL, SeaweedFS, and installed Chrome were available locally. The GitHub remote is configured. No preview deployment will be made.

## Throughput checkpoint

- **Blocking first steps.** Read root planning docs, ADRs, offline/security specs, trace API and browser flows with graft, and capture the complete M0 baseline before implementation. Completed.
- **Independent workstreams.** API and web grounding ran in separate read-only explorations. Implementation stays with one owner because auth identity, draft ownership, browser storage keys, and sync authorization share contracts and state.
- **Shared mutable state.** Each design runner receives a separate transcript output. The code writer will use a dedicated managed worktree. The IndexedDB draft store and outbox will be partitioned by environment, origin, and user; lease ownership will be per sync run.
- **Smallest safe decomposition.** One implementation owner handles the API, web, tests, and docs in ordered units. A split API/web write would duplicate auth contract and queue ownership decisions.

## Implementation units

1. Select and document the server/client data shapes, protected route policy, migration behavior for unowned M0 rows, and session rotation flow. Completed in `M1A_ARCHITECTURE.md` after two independent proposals and an independent comparison.
2. Add auth/session persistence, password login/change, refresh rotation and replay revocation, default-protected request handling, origin/CSRF checks, and login throttling.
3. Add superuser-only admin create/list/status/reset operations and audit the actor on account changes.
4. Scope draft ownership and command receipts by authenticated user while preserving the atomic M0 create/replay behavior. Update API verification to authenticate fixtures and test direct unauthorized calls.
5. Add in-memory browser auth, login/forced-change/admin screens, identity-scoped local storage, explicit pending-work logout/account switch, typed sync outcomes, and renewable run-owned leases.
6. Update M0 browser tests and add M1a API/browser coverage for account lifecycle, two-user isolation, expiry/reconnect, refresh replay, and concurrent sync.
7. Update ADR/spec/README guidance, including Windows startup with Corepack commands that do not require Program Files writes.
8. Run the complete verification suite, inspect the final diff, audit the decision log, and open a PR for review if GitHub access works.

## Checkpoint results

| Unit     | Predicate                                                                                                                             | Result                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline | The existing M0 checks pass before changes.                                                                                           | Passed with `corepack pnpm verify:m0`.                                                                                                                                                                                                      |
| Design   | Two structurally distinct proposals are compared, and the chosen data shapes preserve M0 guarantees.                                  | Passed. Chose per-user workspaces, an identity-owned session domain, private owned drafts, and quarantined anonymous M0 data. See `M1A_ARCHITECTURE.md`.                                                                                    |
| API      | Direct unauthorized calls fail; login, forced change, reset, own password change, bearer/cookie logout, replay and live disable pass. | Passed in `corepack pnpm verify:m0`; protected draft author and user-scoped receipts are checked directly. Expired-bearer logout revokes the session; a stale tab cannot clear another account's cookie.                                    |
| Browser  | Two identities remain isolated; expiry preserves drafts; logout recovery and sync outcome handling are verified at mobile width.      | Five production-browser tests passed. They cover cross-tab single delivery, account isolation, two-draft authentication pause and reauthentication, reload recovery, closing the syncing tab in flight, held errors, retry, and 360 px RTL. |
| Docs     | Root ADR/API/offline specs match behavior; Windows startup avoids Program Files writes; migration preserves unowned M0 rows.          | Updated; formatter and generated Drizzle snapshot checks passed.                                                                                                                                                                            |
| Handoff  | Complete checks pass, docs describe local Windows startup and legacy rows, and a review PR is available.                              | `corepack pnpm verify:m0` passed; draft PR opened: https://github.com/alisohdev/sazeh/pull/1. No preview was deployed.                                                                                                                      |
