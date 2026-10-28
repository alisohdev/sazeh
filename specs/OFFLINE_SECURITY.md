# Offline synchronization and security specification

## M1a implementation

Each browser workspace uses a separate IndexedDB database keyed by environment, exact origin and user ID. An origin control database stores the current account phase, epoch and recoverable departure journal. Browser Web Locks serialize login, refresh, password change and the full logout transition through durable completion. Neither database stores access tokens, refresh tokens or passwords. Browsers without Web Locks fail lifecycle and save coordination visibly instead of falling back to an expiring owner ID.

Tabs notify one another of local draft-state changes through a BroadcastChannel named from the same environment/origin/user workspace key. Messages contain no draft text or credentials; each tab reloads the changed rows from its own IndexedDB connection.

The foreground sync runner uses a same-tab single-flight promise and a per-user IndexedDB lease with a random owner ID, generation and 30-second expiry. It renews the lease every 10 seconds. A surviving tab schedules recovery at the active lease expiry, including when the owner closes while its request is in flight. Before sending a command or saving an acknowledgment, the runner checks the account epoch and lease owner. It stops when either changes. Draft saves hold a shared workspace activity lock; logout changes the identity phase and takes the exclusive lock before counting, so a save already admitted is either committed and counted or rejected.

M1a saves each note and immutable outbox command in one IndexedDB transaction. A repeated entity ID fails the local insert instead of creating a duplicate. The API atomically stores the authenticated receipt and server draft. The receipt key is the authenticated user ID and command ID.

The runner stores expired or missing authentication as AUTH_REQUIRED, explicit revocation or account disable as an authentication lock, 409 as CONFLICT, 400 and 422 as VALIDATION_FAILED, and network, 429 and 5xx failures as RETRY_PENDING. Authentication rejection records a pause in the shared identity control record, stopping automatic upload for every pending command and tab until successful authentication clears it. Local saves remain available. The browser checks the authenticated user ID before sending after refresh. Conflict and validation rows are excluded from later retry runs. A timer wakes transient failures at their persisted retry time and pending work when another tab's lease expires. Scheduling and timer callbacks check that the workspace is current and authentication permits sync; identity changes cancel outstanding wake-ups.

Logout holds an origin-wide Web Lock from the departure transition through the pending-work decision, local action, server revocation and durable completion. If the page reloads while the decision is open, the Web Lock is released and a new page resumes the same departure journal and presents the decision again. The user can cancel, keep or export pending work, or explicitly discard and log out. The selected keep or discard action is persisted before local deletion; recovery repeats a discard idempotently if needed. An interrupted offline logout remains pending and blocks a new account until the server logout completes. Account switching opens a separate user database and never reads or uploads the prior user's commands.

The migration leaves existing server drafts with a NULL author. Protected reads do not return them. The application never assigns these rows during login. The browser does not open the prior anonymous M0 IndexedDB database for normal use. It offers an explicit read-only export that marks each row unowned.

## Local persistence

IndexedDB stores workspace metadata, authorized snapshots, local drafts, outbox commands, attachment blobs and conflict records. Keys include environment, origin and user ID. The current company is implicit because deployments are single-company. Never store passwords or refresh/access credentials in this database.

Every save uses one IndexedDB transaction for draft + outbox. Show “saved on device” only after commit succeeds. On quota/write error, keep form content in memory and explicitly say it was not saved. Provide a draft export action; request persistent storage, but do not assume it is granted or prevents user deletion.

First use needs online login/bootstrap. Reopening an offline-installed app may show the last user's cached workspace on that trusted device; this is not fresh authentication. Display offline/last-sync status. Each user has a separate database. Prevent account switching until pending work is exported or explicitly discarded. Explicit logout warns about pending work and offers cancel, export then logout, or discard then logout. Never silently delete pending drafts.

If the server disables the account, stop sync and lock the cached workspace when that is detected. Do not upload old drafts under a different admin's identity. Remote revocation cannot erase an already disconnected browser. Lost-device handling includes server session revocation and communicating that local device data remains outside server control.

## Outbox state machine

PENDING -> SENDING -> SYNCED. Expired or missing authentication uses AUTH_REQUIRED; explicit session revocation or account disable locks the workspace. On 409, use CONFLICT. On 400 or 422, use VALIDATION_FAILED. Use RETRY_PENDING for network, 429 and 5xx failures. Other 403 responses are not authentication failures. Independent commands continue; dependent commands wait. Only the matching server acknowledgment advances an entry to SYNCED. After a crash or restart, an uncertain SENDING entry becomes retryable with the same command ID and body.

Use immutable outbox command payloads after first send. Editing pending content creates a superseding command with explicit dependency; do not reuse the original command ID with different content. For unsent commands, replacing locally is allowed only before any send attempt and still uses a fresh command ID for clarity. Client-created UUIDs allow offline parent-child references; sync parent creation first.

Only one foreground runner operates per origin/user, coordinated across tabs through a renewable IndexedDB lease. The runner checks the lease owner and generation before dispatch, retry-state writes and acknowledgment. Duplicate delivery remains safe through server idempotency. Trigger sync on app open, connectivity restoration, due retry time and manual retry. A navigator online flag is a hint, not proof that the API is reachable. Use exponential backoff with jitter for transient failures and respect Retry-After.

## Server protocol and change feed

Process each command atomically, with per-command outcomes. Partial batch success is permitted and visible. Sync command endpoints create/edit drafts and permitted reference records only; cannot finalize, approve claims, reverse money, change passwords or manage accounts.

Use optimistic expectedVersion for updates. Conflicts show local and server versions, with choices to keep server or create a revised draft from the local values. No automatic merge of amounts, project IDs, stock quantities or finalized states.

Server change cursors must reflect committed transactions, not client clocks or a bare auto-increment sequence that may commit out of order. Proposed implementation at this scale: one transactional revision row locked before each publishing mutation, with change payloads and revision committed together. This serializes publication and prevents skipped late commits. A transaction may publish multiple ordered changes under one revision. Store tombstones for deleted drafts/archived entities.

Bootstrap data and its high-watermark must represent one consistent database snapshot. A paginated bootstrap needs a stable snapshot token/materialized bounded snapshot; do not return a moving set under one cursor. If a cursor expires, rebuild the server cache without overwriting local drafts/outbox/blobs. Schema migrations preserve the queue; an incompatible API returns UPGRADE_REQUIRED and holds submissions rather than dropping them.

## Planned M1b directory synchronization

M1b extends the existing account-scoped database by forward migration, preserving note/outbox/lease data. Shared server directories do not change local account isolation. Direct REST and queued mutations use the same domain transaction, version, audit and commit-publication rules. Parent contacts/projects sync before dependent assignments. Block new assignments to archived contacts/projects; retain historical links.

Track local edit revision separately from the acknowledged command. A delayed reply acknowledges only its own immutable command/revision; it cannot overwrite newer local values or mark a newer edit synced. Editing after send creates a fresh dependent command. Conflicts remain held until keep-server or revised-draft resolution.

M1b acceptance must exercise a concurrent consistent bootstrap, paginated change recovery, archive tombstones and obsolete-cursor reset without losing pending edits. Also test lost-reply replay, changed-body rejection, parent ordering, delayed replies, account switching and existing M1a lease/auth/logout regressions. Use PostgreSQL and built-browser checks; observable behavior, not browser-lane count, is the criterion.

## Finalization after reconnect

Financial document sync succeeds into server DRAFT state. M1b directory sync instead acknowledges permitted directory mutations; it performs no financial finalization. The manager reviews and finalizes online; no automatic posting. Finalization revalidates active account, latest document version, project lifecycle, stock, monetary totals and linked documents. Concurrent stock issues cannot overdraw available quantity. Reports display authoritative finalized totals and separate draft/pending counts.

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
