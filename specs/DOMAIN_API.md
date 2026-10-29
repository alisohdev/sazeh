# Domain and API implementation specification

## Shared conventions

All identifiers are UUIDs generated before local draft creation where necessary. Money is a JSON decimal integer string in toman, such as "1000000"; quantities are decimal strings, such as "2.500". Reject exponent notation, non-finite numbers and extra precision. Normalize Persian/Arabic digits at input boundaries. Store business dates as ISO date-only values; convert Jalali in the UI. Store UTC audit timestamps separately.

Every mutable entity includes id, version, created_at, updated_at and actor metadata. Draft write requires expectedVersion. A stale version returns 409 with current server representation. Directory archiving is soft-state; finalized documents cannot be deleted. All financial and stock operations require a valid project and authorized active account.

## Implemented M1a identity and draft rules

The API accepts only the SUPERUSER and ADMIN roles. It has no registration route, worker login or additional role. The `bootstrap:superuser` command creates the first superuser from the local operator CLI.

The global access guard protects every route by default. Health endpoints, CSRF bootstrap, login, refresh and logout are explicit public exceptions. Password change accepts a restricted temporary-password session. Draft reads and writes require a full authenticated session. The API checks the account, credential version and unrevoked session against PostgreSQL on every protected request.

Access JWTs use HS256, the `sazeh-api` issuer and `sazeh-browser` audience. They expire after 15 minutes and stay in browser memory. The browser stores only the rotating opaque refresh token in an HttpOnly, SameSite=Lax cookie. The session expires after seven days. Unsafe requests require the exact configured `AUTH_ALLOWED_ORIGIN`, JSON content type and a signed CSRF cookie/header pair. Login attempts use shared PostgreSQL limits keyed by normalized username and client address.

Admin creation and password reset return one temporary password. The API stores only an Argon2id hash and sets `mustChangePassword`. Until the admin changes that password, protected application routes return 403. Password change, reset, account disable, session revocation, logout and refresh-token replay invalidate the affected online session immediately.

Logout verifies signed bearer claims after access expiry so an expired bearer with its valid refresh cookie still revokes the session. If a stale tab's bearer belongs to a different session than the refresh cookie, the API revokes only that bearer session and leaves the cookie intact.

The server records `author_user_id` from the authenticated principal. It rejects author fields in the command body. Draft reads return only a row owned by the current user. Authenticated command receipts use (`user_id`, `command_id`) as their key, so one user's retry cannot replay another user's response.

The M1a migration adds nullable `author_user_id` to `note_drafts`. Existing synthetic M0 rows keep a NULL author and are inaccessible through the protected API. Existing global M0 command receipts remain legacy data and are not consulted for authenticated retries. The application never adopts old rows on login. The browser provides an explicit read-only export for the prior anonymous IndexedDB database and labels each exported row as unowned.

## Data model

| Record | Minimum fields and relationships |
|---|---|
| users | username normalized/unique, displayName, passwordHash, role SUPERUSER/ADMIN, active, mustChangePassword, credentialVersion |
| sessions | userId, credentialVersion, absolute expiry, revokedAt, revocationReason, lastUsedAt |
| refresh_tokens | tokenHash, sessionId, generation, issuedAt, consumedAt; retain consumed hashes through session expiry |
| login_buckets | hashed normalized username or client address, failed-attempt count, resetAt |
| account_audit | actorUserId, actorSessionId, targetUserId, action, createdAt; no password values |
| note_drafts | authorUserId nullable only for unowned M0 legacy rows, text, version, status, createdAt |
| projects | name, ownerContactId, business dates, lifecycle, contract initial value, version |
| contract_amendments | projectId, signed change amount, reason, businessDate, finalized metadata |
| budgets | projectId, category, amount; changes audited, baseline retained |
| contacts | displayName, phone optional, worker/supplier/owner flags, archived |
| engagements | workerId, projectId, type, defaultRate, effective dates; changes do not alter earning snapshots |
| documents | projectId, kind, businessDate, status DRAFT/FINALIZED/REVERSED, version, description, correctionOfId, actors |
| earning_lines | documentId, workerId, engagement type, period/work description, quantity/rate or manually approved amount |
| deductions | documentId, workerId, amount, required reason |
| payments | documentId, contactId, direction, method CASH/TRANSFER/OTHER, reference optional, amount, purpose WORKER/SUPPLIER/EXPENSE/OWNER |
| payment_allocations | paymentId, targetDocumentId, amount; same project/contact and permitted target kind |
| materials | name, baseUnit, archived; no automatic unit conversions |
| purchase_lines | invoiceDocumentId, materialId, quantity, unitPrice, lineTotal, supplierId via invoice header |
| stock_movements | documentId, projectId, materialId, quantityDelta, valueDelta, sourceLineId, pairedTransferId, postingOrder |
| stock_balances | projectId + materialId unique, quantity, carryingValue, version; updated transactionally with movements |
| expense_lines | documentId, category, payeeContactId, amount, description |
| claims | documentId, amount, status SUBMITTED/APPROVED/REJECTED, approval note; only approved/finalized amounts count |
| attachments | id, draft/document target, creator, object key, filename, mediaType, size, state STAGED/READY/FAILED |
| audit_events | actor/session, entity, action, before/after draft change or finalized effect IDs, reason, timestamp |
| command_receipts | legacy M0 global command receipts; not used by authenticated M1a commands |
| authenticated_command_receipts | userId + commandId unique, canonical request hash, result snapshot, createdAt |
| sync_changes | server revision, affected entity snapshots/tombstones, committed actor/time; no password/session secrets |

Use typed domain tables/check constraints for financial kinds, not arbitrary unvalidated JSON money records. Schema names are logical; implementation may split headers/lines while preserving invariants. Project transfers have two endpoints but post one atomic stock document; account balances remain project-specific.

## Planned M1b directory rules

Shared business data is accessible to full-session ADMIN and SUPERUSER accounts; private-note ownership does not apply. Actors come from the authenticated principal. Commit directory mutation, audit event, published change revision and command receipt (where applicable) atomically. Mutable records use expectedVersion; stale updates return 409 with current server representation.

Projects start active and support active -> archived -> active only in M1b. Require a nonblank archive/reopen reason. Default lists show active projects; explicit filters expose archived records. Archive does not certify financial completion. Completion with stock/balance checks waits for the modules that supply those sources.

Contacts have independent worker/supplier/owner flags, no login credentials and preserved history. Block new assignments to archived contacts/projects, including owner assignment and engagement endpoint changes. Existing assignments remain visible after archive. Suppliers stay company-wide until M3 purchasing documents relate them to projects.

Engagement types: DAILY, HOURLY, QUANTITY, MONTHLY, FIXED_CONTRACT, MANUAL. Default rates are validated whole-toman strings; M2 owns calculations/earnings. Workers may span projects. For the same worker/project, periods cannot overlap regardless of type, including concurrent create/update. End dates are inclusive; omitted end means ongoing; reject end before start. Next-day adjacency is allowed, same-day endpoint overlap rejected. Enforce overlap and archive-assignment rules transactionally.

Budgets use editable category labels with retained baseline and audited versioned changes; no category-management subsystem. M1b overview counts distinct server projects matching filters before pagination and distinct linked workers per project, labeled as including historical links. Engagement counts are separate. Pending local rows stay separate from server counts. Counts/drill-down share filters; cached snapshots show last-sync status. Financial charts and computed metrics wait for M2-M4 sources.

## Posting and corrections

States: local draft -> server draft -> online finalized. Sync error/conflict are client transport states, not financial posting states. Only online finalization creates financial/stock effects. A finalized document may be reversed once; correction link, reason and original effects remain visible.

Within one transaction: authorize/session-check, claim command ID, check expected version/state, lock affected balances in stable order, validate totals/dependencies, write effects, update balances, audit, publish sync revision and save command result. Roll back everything on failure. Competing finalizations cannot both post the same document.

Retries with same command ID and same request hash return the prior result. Same ID with different content is a conflict. Retain finalized command identities with the financial history; never expire them while old devices can replay commands. Draft commands must also be retained or their replay rejected explicitly by a protocol retention boundary, never treated as new.

Reversals must respect dependencies: release/reverse payment allocations before reversing an invoice or claim; reverse dependent stock movements before reversing a receipt if needed. If dependent facts cannot be unwound, create explicit current correcting documents. No direct balance overwrites.

## Balance rules

Worker balance = finalized approved earnings - finalized deductions - net outgoing worker payments. An advance is an outgoing payment before earnings; do not subtract it twice. A negative balance means worker advance/credit. Payment refunds are separate linked incoming adjustments.

Supplier balance = finalized purchase invoices + supplier-billed other expenses - supplier credit notes - net outgoing supplier payments. Include both purchases and applicable expenses exactly once. Owner receivable = approved finalized claims - net owner receipts. Allocation is for reconciliation, not an extra debit/credit effect. Unallocated overpayments remain project/contact advances.

Invoice total = sum(round_half_up(quantity × unitPrice, 0)). Simple V1 invoice prices are all-inclusive; no separate tax/discount engine. Freight can be a separate transport expense. Receipts cannot exceed the invoice line's outstanding receivable quantity. Each receipt uses that invoice price. A supplier return has a linked credit and stock effect; see ADR 004.

Weighted-average issue value = issueQuantity × currentCarryingValue/currentQuantity, using decimal precision and stored line rounding. When issuing the entire remaining stock, issue the entire carrying value. Two concurrent movements lock source/destination balances in stable ID order. Block quantity below zero.

Reports:

- Procurement: invoices less supplier credit notes, separate from consumption.
- Incurred project cost: net approved labor + net material consumption + other finalized expenses + explicit valuation adjustments. Internal stock transfers do not create company expense or cash.
- Cash flow: owner receipts and refunds in, worker/supplier/expense payments and owner refunds out. No double count of allocation rows.
- Budget variance: category budget minus incurred category cost.
- Management earned margin: approved claims minus incurred cost. Label basis explicitly; never label contract value minus payments as actual profit.

## Implemented and planned endpoint families

Prefix /api/v1. Auth responses and sensitive API data use Cache-Control: no-store. Browser-managed offline snapshots are separate from HTTP caching.

| Method/path | Contract |
|---|---|
| GET /auth/csrf | implemented; return a signed CSRF token and set its double-submit cookie |
| POST /auth/login | implemented; username/password, memory-only access token and refresh cookie; rate-limited |
| POST /auth/refresh | implemented; rotate refresh cookie and return a new access token |
| POST /auth/logout | implemented; revoke the refresh-token session and clear the cookie |
| GET /auth/me | implemented; return the current user |
| POST /auth/password | implemented; check currentPassword, change newPassword and revoke sessions |
| POST /auth/sessions/revoke | implemented; revoke the current user's sessions |
| GET /admins | implemented; superuser only; list admins without password hashes |
| POST /admins | implemented; superuser only; create an ADMIN and return a one-time temporary password |
| POST /admins/:id/reset-password | implemented; superuser only; reset an admin password and revoke its sessions |
| POST /admins/:id/status | implemented; superuser only; disable or reactivate an ADMIN |
| POST /drafts | implemented; require a full session, create the draft with the server-selected author and claim a user-scoped receipt atomically |
| GET /drafts/:id | implemented; require a full session and return only a draft owned by that user |
| GET, POST /projects | M1b implemented; active projects are the default list; `archived=true` selects archived records; cursor and bounded limit pagination |
| GET, PATCH /projects/:id | M1b implemented; detail includes owner, assignment history, budgets and distinct worker count; update requires `expectedVersion` |
| POST /projects/:id/lifecycle | M1b implemented; archive/reopen requires `expectedVersion` and a nonblank reason; does not certify financial completion |
| GET, POST /contacts | M1b implemented; shared contacts use independent worker/supplier/owner flags and are not login accounts |
| PATCH /contacts/:id | M1b implemented; expectedVersion protects edits |
| POST /contacts/:id/lifecycle | M1b implemented; archive/reopen requires a reason; historical assignments remain available |
| GET, POST, PATCH /materials | M3 typed material directory and soft archive |
| GET, POST /engagements | M1b implemented; worker/project rates and six engagement types; inclusive effective dates and overlap restrictions |
| PATCH /engagements/:id | M1b implemented; expectedVersion and the same transactional assignment restrictions apply |
| GET, PUT /projects/:id/budgets | M1b implemented; editable labels, versioned amounts, retained baseline and audit history |
| GET, POST /documents | type-filtered paginated list/create draft with discriminated kind payload |
| GET, PATCH, DELETE /documents/:id | read; versioned edit/delete only while draft |
| POST /documents/:id/finalize | online, commandId, expectedVersion; validate and post atomically |
| POST /documents/:id/reverse | online, commandId, reason; validate dependencies and post inverse effects |
| POST /claims/:id/decision | approve/reject submitted claim, expectedVersion, note; posting atomic on approval |
| GET /reports/:reportName | allowlisted report and filters, asOf timestamp, totals and drill-down IDs |
| GET /reports/:reportName/export | CSV with safe escaping/formula-injection protection; same filters/totals |
| POST /attachments/upload-ticket | target draft, filename/type/size; return expiring scoped URL and attachment ID |
| POST /attachments/:id/complete | validate upload before READY; idempotent |
| GET /attachments/:id/download | authorization then expiring private URL |
| POST /sync/commands | M1b implemented; authenticated batch of up to 100 immutable directory commands; per-command result; no financial finalization |
| GET /sync/bootstrap | M1b implemented; stable snapshot ID, bounded pages, and a cursor matching the snapshot revision |
| GET /sync/changes?cursor= | M1b implemented; repeatable-read, commit-ordered change page with cursor, high watermark and reset-required errors for invalid or expired cursors. Retain the latest 10,000 revisions; older cursors return 409 `CURSOR_EXPIRED` and clients rebuild server snapshots while preserving local drafts and outbox commands. |
| GET /health/live, /health/ready | process liveness; dependency readiness without secrets |

M1b's machine-readable request, response, pagination and synchronization field schemas are in [openapi-m1b.yaml](openapi-m1b.yaml). Runtime Zod schemas live in `packages/contracts/src/index.ts`; the API derives audit actors from authenticated principals and commits directory changes, audit records and revisions transactionally. Directory receipts bind a user, command UUID and canonical request body. A repeated UUID/body returns the saved result; a repeated UUID with changed content conflicts.

Every later financial document kind must also have a runtime-validated DTO and OpenAPI schema before its module is implemented: EARNING, DEDUCTION, WORKER_PAYMENT, PURCHASE_INVOICE, SUPPLIER_PAYMENT, STOCK_RECEIPT, STOCK_ISSUE, STOCK_TRANSFER, STOCK_RETURN, SUPPLIER_RETURN, EXPENSE, EXPENSE_PAYMENT, OWNER_CLAIM, OWNER_RECEIPT, CONTRACT_AMENDMENT, REVERSAL. Reverse direction/refunds use explicit linked correction kinds, never negative values accepted into an unrelated normal form.

Example earning draft:

```json
{"commandId":"uuid","entityId":"uuid","expectedVersion":0,"kind":"EARNING","projectId":"uuid","businessDate":"2026-10-28","workerId":"uuid","engagementType":"DAILY","quantity":"3.000","rateToman":"1000000","description":"Work completed"}
```

Server responds with id, version, DRAFT status and calculated amountToman "3000000". Caller totals are not trusted. Manually approved earnings replace quantity/rate with amountToman and required period/milestone description.

Errors use {code,message,fieldErrors,requestId,currentVersion?}. 400 malformed, 401 login required, 403 forbidden, 404 missing, 409 stale version/duplicate mismatch/dependency/stock conflict, 422 business validation, 429 throttled. Do not automatically retry 409/422. Report pagination is cursor-based with bounded page sizes. M1b request, response, pagination and synchronization schemas are implemented in [openapi-m1b.yaml](openapi-m1b.yaml); each later financial module must add its own runtime-validated DTOs and OpenAPI schemas before frontend integration.
