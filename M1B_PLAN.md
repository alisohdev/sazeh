# M1b plan

M1b adds project records, worker and supplier contacts, and the project links defined by the domain specification.
Admins and the superuser share business records. Each account keeps its own offline workspace and pending commands.
One future PR branches from main. Implementation and deployment wait for the operator to approve this plan.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md` under the installed plugin. The single M1b PR stops at STACK-READY for operator review and landing.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [x] Present this plan to the operator and stop. Start execution only on the operator's explicit go.
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `skills/playwright/SKILL.md`
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/how/SKILL.md` and `skills/interrogate/SKILL.md`
  - [ ] `skills/show-me-your-work/SKILL.md`, `skills/technical-writing/SKILL.md`, and `skills/unslop/SKILL.md`
  - [ ] `skills/prove-it-works/SKILL.md` and `skills/sequence-verifiable-units/SKILL.md`
- [ ] On the operator's go, arm the hourly audit tick as a real cadence. Do not create the cadence before approval.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a lane only on affirmative failure evidence, and dispatch its replacement in the same tick. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send the owner a zero-writes order at once.

### Spawn owners

- [ ] After approval, assign one owner to the single M1b PR with the lifecycle in the execution playbook.
- [ ] Branch the M1b PR from the updated `main` after merged PR #1. There are no child PRs.
- [ ] Keep the M1b PR within the project, contact, engagement, offline-sync, verification, and specification files listed below. Do not add materials, financial documents, or account roles.
- [ ] The M1b PR changes mobile interactions. It waits for the operator's screenshot and video review before landing.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin resolves the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Validate `alisohdev/sazeh` through the active forge. Resolve and validate the head URL before live-lane fetches. Never require `gt`.
- [ ] Open the PR before self-proof and follow `skills/poteto-mode/playbooks/opening-a-pr.md`. Target `main`. Use the resolved forge and include the reviewed scope, evidence and exclusions in the PR body.
- [ ] Run the repository lint, typecheck and format checks before pushing. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-review comment on its merits.
- [ ] Rebase the PR onto current `main` before the code-ready report. Keep the recorded patch base through fix rounds and refresh the verdict after any behavior change.

### Verdict and merge, for every PR

- [ ] Run a full swarm at the code-ready head. Include one gates lane, the ten live lanes below, the perf lane below, and at least two audit lanes with separate focuses. Audit receipts before the verdict.
- [ ] Mark the PR clean only when every lane is `PASS`. Send findings to the owner. A behavior change or large new diff needs a fresh full verdict.
- [ ] The owner reports STACK-READY at the exact head SHA. The operator reviews and lands this single PR through Shipping. Do not merge or deploy from this plan task.

### Boot recipe, for every live lane

Each live lane is one `swarm workers` lane at the PR head, resolved through provider dispatch, in its own worktree or output directory, with its own receipt. Drive the browser only through the Playwright CLI workflow.

- [ ] Fetch the exact head SHA and check it out detached in the lane worktree.
- [ ] Start an isolated synthetic PostgreSQL fixture and the built local application with `corepack pnpm serve:local`. Wait for the API and browser to become ready.
- [ ] Use Playwright CLI snapshots and commands for user input. Capture API status and application logs as read-only diagnostics.
- [ ] Save each screenshot under `output/playwright/swarm-m1b/worker-<n>/<slug>.png` and return the paths with the receipt path.

## Projects and business directories (M1b PR ID pending)

**Depends on.** M1a PR #1 is merged to `main`. The operator must approve this plan before implementation starts.

**Files.**

- [ ] Edit `apps/api/src/db/schema.ts`, `apps/api/src/app.module.ts`, `packages/contracts/src/index.ts`, `apps/web/src/App.tsx`, `apps/web/src/drafts/draft-repository.ts`, `apps/web/src/styles.css`, `specs/DOMAIN_API.md`, `specs/ACCEPTANCE.md`, `specs/OFFLINE_SECURITY.md`, `adr/ADRS.md` and `DELIVERY.md`.
- [ ] Create an additive Drizzle migration and project, contact, and engagement API modules under `apps/api/src/`.
- [ ] Create project, worker, supplier, and engagement screens under `apps/web/src/`.
- [ ] Extend API and browser verification in `apps/api/scripts/verify-api.ts` and `apps/api/scripts/verify-browser.ts`.

**Build.**

- [ ] Implement project list, create, edit, details and soft archive. Store the project name, owner contact, business dates, lifecycle, initial contract value, version and actor metadata. Keep category budget lines as entered project metadata with an audit trail and baseline. Use the specified category label field without inventing a fixed category list.
- [ ] Implement the shared `contacts` directory for worker, supplier and owner roles. Use the specified independent role flags, optional phone and archive state. Do not create worker or supplier login accounts.
- [ ] Implement worker to project links through the specified `engagements` records with worker ID, project ID, type, default rate and effective dates. A worker can link to more than one project. Defaults do not calculate earnings or change past records.
- [ ] Implement project and contact updates with `expectedVersion`. Return `409` with the current server representation for a stale version. Derive the actor from the authenticated principal and write business audit history in the same database transaction.
- [ ] Keep projects, contacts, engagements and budgets shared company records. Reuse the existing full-session `ADMIN` and `SUPERUSER` authorization. Do not add a user owner filter to these records or a tenant column.
- [ ] Add typed request and response contracts for the specified `GET` and `POST /projects`, `GET` and `PATCH /projects/:id`, `POST /projects/:id/lifecycle`, `GET`, `POST` and `PATCH /contacts`, `GET`, `POST` and `PATCH /engagements`, and `GET` and `PUT /projects/:id/budgets` endpoints. Generate the matching OpenAPI field schemas before browser integration.
- [ ] Add the planned authenticated directory command, bootstrap and change-feed endpoints. Make direct REST writes and queued directory commands use the same domain transaction, validation, audit and version rules.
- [ ] Keep supplier contacts company-wide. The specifications link suppliers to projects through later invoice documents and define no direct supplier to project assignment.
- [ ] Extend the existing authenticated IndexedDB workspace for offline project, contact and engagement drafts. Preserve its database name and existing note, outbox and lease records through a forward schema migration.
- [ ] Save each local entity and immutable outbox command in one IndexedDB transaction. Generate stable UUIDs before saving. Sync referenced contacts and projects before dependent relationships. Use the user-scoped command receipt and current expected version.
- [ ] Add a consistent authorized bootstrap snapshot and commit-ordered change feed with archive tombstones. Keep snapshots, local edits and server acknowledgments distinct. Do not let an older acknowledgment mark a newer edit as synced.
- [ ] Preserve the current identity epoch, one-runner lease, auth pause, pending-work logout review, export and account-switch barriers. Never upload one account's command as another account.
- [ ] Preserve the M1a note workflow, legacy M0 export boundary and service-worker rule against caching authenticated API responses.
- [ ] Store initial contract value, budget amounts and default rates as validated toman strings only. Do not add contract amendments, earnings, deductions, payments, invoices, claims, inventory operations, financial reports, totals, margins or variance calculations.
- [ ] Exclude the materials directory from M1b even though `DELIVERY.md` groups it with M1 T102. Keep the directory scope to projects, contacts and their specified relationships.
- [ ] Add `M1B-PROJ01` through `M1B-PROJ03`, `M1B-DIR01`, `M1B-REL01`, `M1B-AUTH01`, `M1B-SYNC01` through `M1B-SYNC03` and `M1B-MOBILE01` acceptance cases because `specs/ACCEPTANCE.md` currently has no project or directory cases.

**You see.**

- [ ] The workspace adds `پروژه‌ها`, `نیرو` and `تأمین‌کنندگان` navigation for fully authenticated admins and the superuser.
- [ ] The project list uses mobile cards with the owner, business dates and lifecycle. Project details show the owner, worker links, entered contract value and budget lines without computed financial summaries.
- [ ] Project and contact forms use one column at 360 px. They use Persian RTL layout, Jalali date entry mapped to ISO date-only values, Persian digit normalization, toman formatting, self-hosted fonts, visible keyboard focus and field-level errors.
- [ ] The directory distinguishes local work from server-shared records with `ذخیره روی دستگاه`, `در انتظار همگام‌سازی`, `پیش‌نویس ذخیره‌شده` and `نیازمند بررسی`. It shows the last sync time and a pending count.
- [ ] A conflict shows the local edit and current server version. The user can keep the server value or create a revised local draft. A retry never changes a sent command body or ID.
- [ ] Archive and reopen preserve the project, contact and relationship IDs and their audit history. They do not delete financial history.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `M1B-PROJ01` creates, lists and reads a project with its owner, dates and entered metadata. `M1B-PROJ02` rejects a stale edit with `409` and retains the server version. `M1B-PROJ03` archives and reopens without deleting the project, references or audit history.
- [ ] `M1B-DIR01` creates, edits and archives worker and supplier contacts with their independent role flags. The records are shared across admins and create no `users` rows.
- [ ] `M1B-REL01` links a worker to valid projects through the specified engagement fields and records no earning or payment effect.
- [ ] `M1B-AUTH01` rejects anonymous and temporary-password business access. Both `ADMIN` and `SUPERUSER` can access shared business data while existing account rules continue to govern admin management.
- [ ] Add tests proving worker and supplier contacts create no `users` rows and cannot authenticate.
- [ ] Add migration and idempotency checks that preserve M0 unowned notes, M1a authenticated notes and receipts, existing account records and pending client queues.
- [ ] `M1B-SYNC01` saves offline edits atomically and preserves them through refresh and reconnect. `M1B-SYNC02` syncs parent records before relationships, creates one shared result after retries, applies commit-ordered changes and archive tombstones, and proves a concurrent bootstrap snapshot matches its cursor without missing a late commit. `M1B-SYNC03` holds stale-version conflicts for review, prevents commands from crossing accounts, and proves an older acknowledgment cannot mark a newer edit as synced.
- [ ] `M1B-MOBILE01` keeps every project and directory form usable at 360 px with RTL layout, visible focus and no page-wide overflow.
- [ ] Retain the existing `AUTH01` through `AUTH04`, `SYNC01` through `SYNC04`, `SYNC07`, `LOCAL02` and `MOBILE01` checks. Run `corepack pnpm verify:api`, `corepack pnpm verify:browser` and `corepack pnpm verify:m0` after the new cases are added.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the configured `swarm workers` role at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the M1a login, offline note save and reconnect scenario at trunk and head. Trunk has no project or directory feature. On head, also create a project and wait for its server-shared detail state. Save `m1a-regression-and-project.png`. Pass when the M1a draft still syncs once and the new project appears once.
- [ ] Lane 2. Create a project with an owner and date range, edit it and reopen its detail. Save `project-create-edit.png`. Pass when the saved fields and audit actor match the form.
- [ ] Lane 3. Archive and reopen a project with linked workers, then refresh the second admin workspace. Save `project-archive-reopen.png`. Pass when links and audit history remain intact, the change feed removes the archived project from the active list and the archived project remains available in the archived list.
- [ ] Lane 4. Create and edit a worker contact, then try to use it as an account. Save `worker-no-login.png`. Pass when the contact is usable as a worker and no worker login exists.
- [ ] Lane 5. Link one worker to two projects with separate engagement defaults. Save `worker-project-links.png`. Pass when both relationships display their project scope and no earning is created.
- [ ] Lane 6. Create, edit and archive a supplier contact. Save `supplier-directory.png`. Pass when the company-wide supplier record is visible to another admin and no direct project assignment appears.
- [ ] Lane 7. Sign in as an admin and a superuser in separate sessions. Save `shared-business-access.png`. Pass when both can read and edit the shared project and contact records while actor history identifies each writer.
- [ ] Lane 8. Go offline and create a project, owner contact and worker link. Reload and reconnect while a second admin commits an independent directory change and requests a bootstrap snapshot. Retry sync. Save `offline-parent-sync.png`. Pass when account-local drafts survive reload, parents sync before links, each shared record appears once and the second admin snapshot cursor includes both commits.
- [ ] Lane 9. Hold an older edit acknowledgment, create and sync a newer edit, then release the older acknowledgment. Save `directory-conflict.png`. Pass when the old reply cannot mark the newer edit synced, the stale version returns `409` and local values remain reviewable.
- [ ] Lane 10. At 360 px, save a pending directory edit, expire or switch the account, then sign in as the other admin. Save `rtl-mobile-account-isolation.png`. Pass when the edit remains with its original account, no command uploads under the other account and the page has no horizontal overflow.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Measure warmed `GET /api/v1/auth/me` p95 on trunk and head, plus p95 for new project and contact list/write routes and local sync dispatch to visible acknowledgment.
- [ ] Probe. Use five concurrent admin sessions and the acceptance fixture of 10 projects, 100 workers and 30 suppliers. Record 200 interleaved authenticated baseline samples on trunk and head first. Then record 200 head samples for each new list/write path and sync-to-visible-state. Exclude external network latency.
- [ ] Baseline. Record the trunk `GET /api/v1/auth/me` p95 first. Record project and contact routes as absent on trunk rather than comparing unlike scenarios.
- [ ] Rule. Fail if a new ordinary list or write p95 is at least 1,000 ms, sync-to-visible acknowledgment is at least 1,000 ms on the local fixture, or the shared `auth/me` p95 regresses by more than 20 percent. The 1,000 ms list/write target comes from the PRD. The sync target and regression threshold are proposed plan gates for review.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, lane 3, lane 8 and lane 10 screenshots into `output/playwright/m1b-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of the change on a live lane. Save it as `output/playwright/m1b-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at STACK-READY. Wait for the operator's landing decision.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot and security-review triage is complete.
- [ ] After the verdict, refresh `main` and preserve the verdict only when the patch ID stays unchanged. Record the current landing SHA.
- [ ] The owner prepares one same-repository PR targeting `main` and reports STACK-READY. The operator reviews and lands it. There are no stack children.

## Close the program

- [ ] Check each box only after its evidence exists. This planning task stops before implementation, PR creation, or deployment.
- [ ] Reply to the operator with the plan path, source-grounded scope decisions, flagged contradictions and verification gates.

## Appendix A. Prototype evidence

No prototype ran. The PRD already specifies cards, expandable detail, RTL, short mobile forms and a 360 px layout. The remaining open items concern scope and lifecycle rules that a visual prototype cannot settle.

## Appendix B. Alternatives rejected

Use the existing `contacts` model with worker, supplier and owner flags. Separate worker and supplier login tables would contradict the PRD.

Keep suppliers company-wide until purchasing documents provide their project relationship. A new supplier-to-project join has no independent meaning in the current specifications.

Keep the existing per-account IndexedDB workspace and extend it through a forward schema migration. A new M1b database name would strand M1a drafts.

Defer earnings, payments, invoices, stock movements and financial reports. They belong to later delivery work and exceed this milestone.

## Appendix C. Risks

`DELIVERY.md` defines M1 but no M1b split. T102 combines projects, contacts, materials, lifecycle and budgets. This plan follows the user's narrower scope and excludes the materials directory.

T201 places engagement defaults in M2. This plan includes the existing engagement fields now because M1b requests specified worker/project relationships. M2 remains responsible for using those defaults in earning workflows. Review this schedule shift before implementation.

The PRD and API describe project lifecycle transitions, while the PRD also requires pending-draft, stock and balance checks before project completion. This milestone can implement soft archive and audited reopen, but it cannot claim authoritative completion while stock and balance sources are out of scope. Confirm the archive versus completion boundary before implementation.

The specifications do not define a direct supplier/project relationship. This plan does not add one. They also do not define exact engagement enum literals, overlap rules, archived-contact assignment rules or a controlled budget category vocabulary. Keep budget categories as labels and record any missing domain choice before adding restrictive validation.

The current M1a synchronization implementation handles notes only. The `/sync/commands`, bootstrap and change-feed families are planned, not implemented. M1b must add them for offline directory edits and prove snapshot consistency, parent ordering, conflict review and safe acknowledgment. This is the largest schedule risk.

The current acceptance matrix has no project or directory cases. M1b must add them. Existing `AUTH`, `SYNC`, `LOCAL` and `MOBILE` cases remain regression gates.

## Appendix D. Links and reading list

Read `PRD.md`, `DECISIONS.md`, `DELIVERY.md`, `adr/ADRS.md`, `specs/DOMAIN_API.md`, `specs/ACCEPTANCE.md`, `specs/OFFLINE_SECURITY.md`, `M1A_PLAN.md` and `M1A_ARCHITECTURE.md` before implementation.

Start from `apps/api/src/db/schema.ts`, `apps/api/src/app.module.ts`, `apps/api/src/drafts/create-draft.ts`, `apps/api/src/identity/access.guard.ts`, `apps/api/src/identity/identity.service.ts`, `packages/contracts/src/index.ts`, `apps/web/src/App.tsx`, `apps/web/src/drafts/draft-repository.ts`, `apps/web/src/identity/workspace-control.ts` and `apps/web/src/identity/auth-client.ts`.

The M1b PR uses `skills/how/SKILL.md` before changing module ownership and `skills/interrogate/SKILL.md` before accepting a contested boundary. Keep `.audit/m1b-execution.tsv` per `skills/show-me-your-work/SKILL.md` after approval. The browser lanes use `skills/playwright/SKILL.md`.
