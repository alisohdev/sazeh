# Architecture decision records

Date: 28 October 2026. Product-owner-confirmed choices and proposed engineering details are distinguished below. These records are design decisions, not evidence of implementation or client sign-off.

## ADR 001 Single company modular monolith

**Status:** Accepted product scope; proposed module layout.

**Context:** Five admins, ten active projects and the same full business permissions for all admins.

**Decision:** One company per deployment/database. One NestJS application with auth, projects, workforce, procurement, inventory, finance, reports, attachments and sync modules. React/Vite PWA calls REST. PostgreSQL transactions are the consistency boundary. Drizzle manages schema and explicit migrations. Suggested workspace: apps/web, apps/api, packages/contracts. Use strict TypeScript, runtime DTO validation and generated OpenAPI types rather than sharing database models with browsers.

**Alternatives:** Microservices add deployment/distributed-transaction costs; multi-tenancy introduces unneeded isolation rules. Neither is justified by initial usage.

**Consequences:** Simple operations and portable hosting. Future multi-company support needs a new ADR and isolation migration. Do not add tenant_id everywhere as a speculative feature.

## ADR 002 JWT with revocable server sessions

**Status:** JWT and role hierarchy accepted; session implementation proposed.

**Decision:** Short-lived access JWT kept in browser memory; rotating opaque refresh credential in a Secure, HttpOnly, SameSite=Lax cookie on the browser-facing app origin. Local localhost HTTP exception only for development. Access token contains subject/session ID, expiry, issuer and audience. Validate signature, algorithm allowlist and active session/account on every protected request. Password hashes use Argon2id with calibrated parameters. Never persist access/refresh tokens in localStorage or IndexedDB.

Use a session table and token-family reuse detection. Serialize refresh across tabs; lost refresh responses may require re-login, not weakened reuse checks. Change/reset password and disabling revoke sessions. First-password-change sessions can only change password or log out. Superuser alone creates, resets or disables admins. Superuser recovery is an operator-only CLI/runbook action, not an admin API.

**Alternatives:** Fully stateless JWT cannot enforce prompt revocation. Plain server sessions would also fit but JWT was requested. Browser localStorage tokens increase script-accessible credential exposure.

**Consequences:** A lightweight DB check per request is acceptable here. Protect refresh/login/logout endpoints with origin checks and CSRF measures; access-token APIs use Authorization headers. No offline password login or claim of immediate offline revocation.

## ADR 003 Server-authoritative finalized documents

**Status:** Accepted correction policy; implementation proposed.

**Decision:** Editable drafts with optimistic versions; immutable finalized payloads. Posting creates document effects, audit event and sync revision in one PostgreSQL transaction. Corrections use a new linked adjustment or reversal, never updates to historical amounts. Server recalculates all totals. A small financial subledger supports worker/supplier/owner balances; no general-ledger/chart-of-accounts product in V1.

Money is integer toman in BIGINT, serialized as strings in JSON. Quantity uses NUMERIC(18,3), valuation uses higher-precision NUMERIC. Rates/line totals are server-computed with decimal arithmetic. Define half-up rounding at document line boundaries; sums use stored rounded lines. Final stock depletion consumes any valuation rounding remainder.

**Consequences:** Reliable audit and reconciliation without building a statutory accounting system. Browser estimates are advisory. Exactly-once business effects are achieved through idempotency plus database constraints, not assumed from network delivery.

## ADR 004 Simple stock and management reporting

**Status:** Proposed engineering/reporting defaults; client to validate report labels.

**Decision:** One stock location per project. One base unit per material. Weighted-average valuation per project/material, processed in server posting order. No selectable methods or historical revaluation engine. Invoices establish liability; receipts establish stock at invoice unit cost; consumption establishes material cost. Transfers preserve carrying value. Reports distinguish procurement, current stock, consumption cost and cash paid.

Consumption returns reference the source issue and its original cost. Supplier returns reference an invoice/receipt: reduce stock at current carrying value, create supplier credit at agreed original invoice price, and expose any difference as a return-valuation adjustment rather than hiding it. Negative stock is blocked. Reverse a historical receipt only if dependent movements are first corrected; otherwise create a current adjustment reviewed by the manager.

Backdated business dates are allowed with posting timestamp preserved. They do not reorder prior valuation. Stock history is by posting order; a business-date report is labeled accordingly. These are management records, not certified period-close accounts.

**Consequences:** Users enter quantities and prices, not costing policies. Client review must distinguish consumed cost from purchased value. Keeping both avoids counting an invoice and the later material issue twice.

## ADR 005 Offline drafts with explicit synchronization

**Status:** Accepted behavior; protocol proposed.

**Decision:** Service worker caches app shell; IndexedDB stores selected project snapshots, local drafts, an outbox and attachment blobs. The UI transactionally saves draft + outbox before showing local success. An authenticated foreground sync runner uploads in dependency order, using stable UUID command IDs and expected record versions. Finalization is a separate online action; syncing never silently posts finance.

Cache identity scopes include environment, deployment origin and user. There is no offline permission escalation. Conflicts are not last-write-wins. Review competing changes and submit a new explicit resolution. Failed entries remain visible and retryable; parents block dependent entries but not independent ones.

**Alternatives:** Online-only fails the site requirement. Offline financial finalization requires considerably harder reconciliation and was rejected by the user. Background Sync alone has inconsistent browser support [S3].

**Consequences:** Automatic synchronization is guaranteed only while app is active with working connectivity/authentication. Browser storage is not durable backup [S4]. Existing cached data cannot be remotely revoked while disconnected.

## ADR 006 Portable environments and same-origin browser API

**Status:** Local/Vercel/Iran hosting accepted; topology proposed.

**Decision:** Local Vite dev server proxies /api to NestJS; Docker Compose runs PostgreSQL and S3-compatible development storage. Vercel preview uses a Vite frontend deployment and a paired NestJS backend deployment, with an exact /api rewrite from the frontend origin to that paired backend. NestJS is supported by Vercel [S1]. Use external preview PostgreSQL and private object storage, not function-local disk. Pin the backend target for each preview; never route every PR to the latest unrelated backend.

For Iran production, deploy the same compiled NestJS app as a Node/container process, the Vite static assets, PostgreSQL and S3-compatible private storage. Liara documents NodeJS and S3-compatible storage [S2, S5]. A same-origin reverse proxy exposes /api. Provider, plan, domain and PostgreSQL version are selected before provisioning. No managed Vercel-only database or storage dependency in domain code.

**Consequences:** Verify cookies, proxy origin handling, DB connection pooling and direct object uploads in M0. Dedicated preview data/secrets, never production. Choose a stable demo origin for PWA testing; each new origin has a separate local queue. Protected previews need explicit authorized access for both frontend and rewritten backend. Backend authorization remains mandatory even when accessed directly.

## ADR 007 Private attachments

**Status:** Attachments/offline queue accepted; limits and storage strategy proposed.

**Decision:** Binary data in private S3-compatible storage, metadata in PostgreSQL, offline queued blobs in IndexedDB. API issues short-lived scoped upload tickets; browser uploads directly; completion verifies object size/type/checksum where supported before linking it. Download authorization generates a short-lived URL. Never expose bucket credentials or public permanent URLs.

Persist metadata and draft IDs before upload; retain local blob until server confirms completion. Expired URLs can be renewed. Unreferenced staged uploads are removed by an operator cleanup task or provider lifecycle policy. Record-to-file linkage is audited. V1 allows JPG/PNG/WebP/PDF; no executable or HTML attachments.

**Consequences:** No dependence on ephemeral deployment disk; upload retry does not duplicate logical attachments. File upload failure does not erase the associated draft.

## ADR 008 Evidence-based release gates

**Status:** Proposed engineering standard.

**Decision:** Unit tests for money/valuation, PostgreSQL integration tests for posting/concurrency, and browser tests for mobile/offline/auth flows. Local and Vercel preview gates precede an Iran-hosting rehearsal and client acceptance. Run reviewed migrations explicitly; never migrate from request handlers or every function cold start.

**Consequences:** No fixed delivery promise before M0 and vertical-slice validation. Deployment rollback uses backward-compatible schemas or a tested recovery plan. Restore tests must cover both DB and referenced attachment objects. Real data must not enter the preview dataset.
