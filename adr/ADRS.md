# Architecture decision records

Date: 28 October 2026. Product-owner-confirmed choices and engineering decisions are distinguished below. Status labels track implementation, not client sign-off.

## ADR 001 Single company modular monolith

**Status:** Accepted product scope; proposed module layout.

**Context:** Five admins, ten active projects and the same full business permissions for all admins.

**Decision:** One company per deployment/database. One NestJS application with auth, projects, workforce, procurement, inventory, finance, reports, attachments and sync modules. React/Vite PWA calls REST. PostgreSQL transactions are the consistency boundary. Drizzle manages schema and explicit migrations. Suggested workspace: apps/web, apps/api, packages/contracts. Use strict TypeScript, runtime DTO validation and generated OpenAPI types rather than sharing database models with browsers.

**Alternatives:** Microservices add deployment/distributed-transaction costs; multi-tenancy introduces unneeded isolation rules. Neither is justified by initial usage.

**Consequences:** Simple operations and portable hosting. Future multi-company support needs a new ADR and isolation migration. Do not add tenant_id everywhere as a speculative feature.

## ADR 002 JWT with revocable server sessions

**Status:** Accepted and implemented for M1a.

**Decision:** Keep a 15-minute access JWT in browser memory. Rotate an opaque refresh credential in a seven-day, HttpOnly, SameSite=Lax cookie on the browser-facing app origin. Set Secure except for configured loopback HTTP in local development. The access token carries subject, session ID, credential version, expiry, issuer and audience. Pin signature verification to HS256 and check the user and session on every protected request. Store password hashes with Argon2id. Never persist access or refresh credentials in localStorage or IndexedDB.

Use a session table and retain hashes for every refresh-token generation through session expiry. Reject and revoke the family when a consumed token is replayed. Serialize cookie operations across tabs with a Web Lock held through the durable identity transition; do not let an expiring owner lease move a live response between tabs. A lost refresh response may require re-login, not weaker replay checks. Password change, reset, logout, session revocation and disable revoke online access. A temporary-password session can only change its password or log out. Only a superuser can create, reset, disable or reactivate admin accounts. Bootstrap and recovery stay in the operator CLI, not a registration endpoint.

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

**Status:** Accepted and implemented for M1a note drafts; later entities remain proposed.

**Decision:** The service worker caches the app shell. M1a stores note drafts and an outbox in a separate IndexedDB database for each environment, origin and user. A local draft and its immutable command commit in one transaction before the UI reports success. The authenticated foreground runner uses stable UUID command IDs. It permits one same-tab run and one renewable IndexedDB lease owner across tabs. A lost lease or changed identity stops dispatch and acknowledgment. Later entities can add dependency order and expected record versions. Finalization remains a separate online action.

Cache identity scopes include environment, exact deployment origin and user. The origin control database coordinates the shared refresh cookie and account departure. A Web Lock serializes lifecycle changes through completion; logout takes an exclusive workspace activity lock before showing the pending-work decision. The selected keep/discard action is journaled before any deletion, and reload resumes the same decision. The app never imports the old anonymous M0 browser database. It provides a read-only export that labels those rows as unowned. There is no offline permission escalation. Expired authentication pauses sync, explicit revocation/disable locks the workspace, conflicts stay held, and transient network, 429 and server failures retry on a timer.

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
