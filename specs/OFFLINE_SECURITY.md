# Offline synchronization and security specification

## Local persistence

IndexedDB stores workspace metadata, authorized snapshots, local drafts, outbox commands, attachment blobs and conflict records. Keys include environment, origin and user ID. The current company is implicit because deployments are single-company. Never store passwords or refresh/access credentials in this database.

Every save uses one IndexedDB transaction for draft + outbox. Show “saved on device” only after commit succeeds. On quota/write error, keep form content in memory and explicitly say it was not saved. Provide a draft export action; request persistent storage, but do not assume it is granted or prevents user deletion.

First use needs online login/bootstrap. Reopening an offline-installed app may show the last user's cached workspace on that trusted device; this is a product convenience, not fresh authentication. Display offline/last-sync status. A new user cannot view the previous user's cache. Prevent account switching until pending work is exported or explicitly discarded and cached data is cleared. Explicit logout warns about pending work and offers cancel, export then logout, or discard then logout. Never silently delete pending drafts.

If the server disables the account, stop sync and lock the cached workspace when that is detected. Do not upload old drafts under a different admin's identity. Remote revocation cannot erase an already disconnected browser. Lost-device handling includes server session revocation and communicating that local device data remains outside server control.

## Outbox state machine

LOCAL_PENDING -> SENDING -> ACKNOWLEDGED. On 401, AUTH_REQUIRED; on 409, CONFLICT; on 422, VALIDATION_FAILED; on transient network/5xx, RETRY_PENDING. Independent commands continue; dependent commands wait. Only the matching server acknowledgment advances an entry to acknowledged. After crash/restart, uncertain SENDING becomes retryable with the exact same command ID and body.

Use immutable outbox command payloads after first send. Editing pending content creates a superseding command with explicit dependency; do not reuse the original command ID with different content. For unsent commands, replacing locally is allowed only before any send attempt and still uses a fresh command ID for clarity. Client-created UUIDs allow offline parent-child references; sync parent creation first.

Only one foreground runner operates per origin/user, coordinated across tabs through an IndexedDB lease with timeout. Duplicate runners must still be harmless due to server idempotency. Trigger on app open/focus, connectivity restoration, manual retry and bounded periodic retry while active. A navigator online flag is a hint, not proof that the API is reachable. Exponential backoff with jitter for transient failures; respect Retry-After.

## Server protocol and change feed

Process each command atomically, with per-command outcomes. Partial batch success is permitted and visible. Sync command endpoints create/edit drafts and permitted reference records only; cannot finalize, approve claims, reverse money, change passwords or manage accounts.

Use optimistic expectedVersion for updates. Conflicts show local and server versions, with choices to keep server or create a revised draft from the local values. No automatic merge of amounts, project IDs, stock quantities or finalized states.

Server change cursors must reflect committed transactions, not client clocks or a bare auto-increment sequence that may commit out of order. Proposed implementation at this scale: one transactional revision row locked before each publishing mutation, with change payloads and revision committed together. This serializes publication and prevents skipped late commits. A transaction may publish multiple ordered changes under one revision. Store tombstones for deleted drafts/archived entities.

Bootstrap data and its high-watermark must represent one consistent database snapshot. A paginated bootstrap needs a stable snapshot token/materialized bounded snapshot; do not return a moving set under one cursor. If a cursor expires, rebuild the server cache without overwriting local drafts/outbox/blobs. Schema migrations preserve the queue; an incompatible API returns UPGRADE_REQUIRED and holds submissions rather than dropping them.

## Finalization after reconnect

Sync succeeds into server DRAFT state. The manager reviews and finalizes online; no automatic posting. Finalization revalidates active account, latest document version, project lifecycle, stock, monetary totals and linked documents. Concurrent stock issues cannot overdraw available quantity. Reports display authoritative finalized totals and separate draft/pending counts.

## Attachment sequence

1. Save draft, attachment metadata and blob atomically where feasible; failures leave clear per-file status.
2. Sync target draft, request upload ticket, upload to private object store.
3. Complete upload through API; verify metadata and mark READY.
4. Delete local blob only after successful server confirmation. Renew expired tickets without creating another attachment identity.

An optional failed attachment does not block a draft's text sync. Finalization asks the manager to retry or explicitly remove a pending attachment; it must not silently drop promised evidence. Individual file size limits and queue storage usage are visible. Cached thumbnails/previously downloaded files are optional; uncached remote files are unavailable offline.

## PWA and security controls

- Manifest with Persian name placeholder, icons and standalone display; service worker precaches hashed shell assets and offline fallback. Self-host fonts/icons so initial production runtime does not depend on external CDNs.
- No generic service-worker caching of authenticated HTTP API responses. Save only intentional authorized data in scoped IndexedDB stores. Clear server cache snapshots on logout/account switch.
- Update prompt when a new worker is available; preserve draft schema and avoid forced reload during entry. Test queue survival across app updates.
- HTTPS except localhost development; secure cookies, origin allowlist, CSRF protection for cookie-auth endpoints, rate-limited login/reset, Argon2id hashes and no credential logging.
- Active session/account check on every protected request, including uploads/download tickets. Require current password for self change; forced temporary-password reset is separate. Revoke refresh families on reuse/reset/disable.
- Whitelist document fields and action kinds; never accept role, actor, finalized status, calculated totals or object-storage keys from unchecked client input.
- Private attachments, verified type/size, random keys and short-lived URLs. Treat PDFs as untrusted downloads, not executable content. CSV exports escape formula-leading cells.
- Audit records are application-append-only; admin business permissions do not include audit deletion, credential access or server configuration.
- Five-admin load does not justify trusting the client or skipping database constraints.

## Preview limitations

Vercel frontend and backend must use the exact paired versions. Same-origin /api routing must preserve host-only refresh cookies and validate the browser-facing origin. A deployment protection login can block API rewrites; verify authorized routing explicitly. Test a production build locally over HTTPS or localhost, not only the Vite dev server.

PWA storage belongs to its origin. A different PR URL starts a different cache; a stable preview alias is needed for repeated offline tests. Drain/export queues before moving to a new origin. Never present preview-to-production browser cache as automatically migrated.
