# Domain and API implementation specification

## Shared conventions

All identifiers are UUIDs generated before local draft creation where necessary. Money is a JSON decimal integer string in toman, such as "1000000"; quantities are decimal strings, such as "2.500". Reject exponent notation, non-finite numbers and extra precision. Normalize Persian/Arabic digits at input boundaries. Store business dates as ISO date-only values; convert Jalali in the UI. Store UTC audit timestamps separately.

Every mutable entity includes id, version, created_at, updated_at and actor metadata. Draft write requires expectedVersion. A stale version returns 409 with current server representation. Directory archiving is soft-state; finalized documents cannot be deleted. All financial and stock operations require a valid project and authorized active account.

## Data model

| Record | Minimum fields and relationships |
|---|---|
| users | username normalized/unique, displayName, passwordHash, role SUPERUSER/ADMIN, active, mustChangePassword, credentialVersion |
| sessions | userId, refresh token hash/family, expiry, revokedAt, lastUsedAt; never plaintext credentials |
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
| command_receipts | userId + commandId unique, canonical request hash, result entity/version, final status |
| sync_changes | server revision, affected entity snapshots/tombstones, committed actor/time; no password/session secrets |

Use typed domain tables/check constraints for financial kinds, not arbitrary unvalidated JSON money records. Schema names are logical; implementation may split headers/lines while preserving invariants. Project transfers have two endpoints but post one atomic stock document; account balances remain project-specific.

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

## Endpoint families

Prefix /api/v1. Auth responses and sensitive API data use Cache-Control: no-store. Browser-managed offline snapshots are separate from HTTP caching.

| Method/path | Contract |
|---|---|
| POST /auth/login | username/password; access token in response, refresh cookie; generic failure, rate-limited |
| POST /auth/refresh | rotate refresh cookie, new access token; origin/CSRF protections |
| POST /auth/logout | revoke current session and clear cookie; idempotent |
| GET /auth/me | current user, capabilities, mustChangePassword |
| POST /auth/change-password | currentPassword/newPassword; revoke sessions; re-login after success |
| GET, POST /admins | superuser only; list/create, never return password hashes |
| POST /admins/:id/reset-password | superuser; temporary password reset and revoke all target sessions |
| PATCH /admins/:id/status | superuser; disable/reactivate; cannot disable last active superuser |
| GET, POST /projects | paginated list/create; explicit lifecycle fields |
| GET, PATCH /projects/:id | project detail/update with expectedVersion |
| POST /projects/:id/lifecycle | complete/archive/reopen with server checks and reason |
| GET, POST, PATCH /contacts and /materials | typed validated directories and soft archive |
| GET, POST, PATCH /engagements | worker/project rates and type defaults |
| GET, PUT /projects/:id/budgets | versioned budget lines and audit history |
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
| POST /sync/commands | bounded batch of draft/directory commands only; per-command result, no finalization |
| GET /sync/bootstrap | versioned initial authorized workspace snapshot; bounded pages under consistent snapshot token |
| GET /sync/changes?cursor= | authorized change feed with opaque cursor and tombstones; reset-required response if cursor obsolete |
| GET /health/live, /health/ready | process liveness; dependency readiness without secrets |

Every document kind must have a runtime-validated DTO and OpenAPI schema: EARNING, DEDUCTION, WORKER_PAYMENT, PURCHASE_INVOICE, SUPPLIER_PAYMENT, STOCK_RECEIPT, STOCK_ISSUE, STOCK_TRANSFER, STOCK_RETURN, SUPPLIER_RETURN, EXPENSE, EXPENSE_PAYMENT, OWNER_CLAIM, OWNER_RECEIPT, CONTRACT_AMENDMENT, REVERSAL. Reverse direction/refunds use explicit linked correction kinds, never negative values accepted into an unrelated normal form.

Example earning draft:
```json
{"commandId":"uuid","entityId":"uuid","expectedVersion":0,"kind":"EARNING","projectId":"uuid","businessDate":"2026-10-28","workerId":"uuid","engagementType":"DAILY","quantity":"3.000","rateToman":"1000000","description":"Work completed"}
```
Server responds with id, version, DRAFT status and calculated amountToman "3000000". Caller totals are not trusted. Manually approved earnings replace quantity/rate with amountToman and required period/milestone description.

Errors use {code,message,fieldErrors,requestId,currentVersion?}. 400 malformed, 401 login required, 403 forbidden, 404 missing, 409 stale version/duplicate mismatch/dependency/stock conflict, 422 business validation, 429 throttled. Do not automatically retry 409/422. Report pagination is cursor-based with bounded page sizes. Generate the exact OpenAPI field schemas during the relevant milestone before frontend integration; this document defines semantics, not a finished machine-readable OpenAPI file.
