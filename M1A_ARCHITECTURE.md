# M1a architecture decision

## Decision

Use one identity domain for users, sessions, refresh history, password lifecycle, and superuser account operations. Give each authenticated browser identity its own draft workspace database, keyed by deployment environment, exact browser origin, and user ID. Keep a small origin-wide control database for the shared refresh cookie, browser identity epoch, and recoverable account departure. Expose a scoped `Workspace` handle to the UI so components cannot choose storage keys or authors.

M1a note drafts are private to their authenticated author. This is a narrow policy for the existing personal note-draft feature; it does not change the PRD's future permission model for shared company records. A successful API authentication alone does not grant access to another user's notes.

## Server shape and boundaries

Keep the existing `users` records and Argon2id hashes. Add:

- `sessions`: session ID, user ID, credential version, absolute expiry, revocation reason/time, and timestamps.
- `refresh_tokens`: SHA-256 hash of each random opaque token, session ID, generation, issue time, and consumption time. Retain consumed hashes through session expiry so replay of any earlier token is detectable.
- shared PostgreSQL login-throttle buckets keyed by normalized username and trusted client address.
- nullable `author_user_id` on drafts. Existing M0 rows remain `NULL` permanently unless an explicit future operator migration adopts them.
- a new authenticated receipt table keyed by `(user_id, command_id)`. Preserve the old global M0 receipts as legacy data outside authenticated replay lookup.

The identity domain owns credential/session mutations and returns a validated principal. HTTP controllers own JSON parsing, cookie adaptation, and error mapping. The draft domain accepts a workspace principal and never accepts an author from the body. The browser and database row types stay private to their respective adapters.

```ts
type WorkspacePrincipal = Readonly<{
  kind: "workspace";
  userId: string;
  sessionId: string;
  credentialVersion: number;
}>;

type PasswordChangePrincipal = Readonly<{
  kind: "password-change";
  userId: string;
  sessionId: string;
}>;

type QueueOutcome =
  | { kind: "pending"; attempts: number }
  | { kind: "auth-required" }
  | { kind: "retry-pending"; retryAt: number }
  | { kind: "conflict"; problem: string }
  | { kind: "validation-failed"; fields: string[] };

interface Workspace {
  saveNote(input: NewNote): Promise<void>;
  listNotes(): Promise<readonly NoteView[]>;
  requestSync(): void;
  exportPending(): Promise<PendingExport>;
  stop(): Promise<void>;
}
```

The global access guard is default-deny. Health, CSRF bootstrap, login, refresh, and logout are explicit policy exceptions. All draft routes require a workspace principal. Only password change and logout accept a restricted temporary-password principal. Admin creation, listing, reset, and activation changes require an active, unrestricted superuser; creation always creates an `ADMIN`, and admin mutations cannot target a superuser.

Access JWTs live in browser memory and expire after 15 minutes. Refresh credentials are random, rotating, HttpOnly, host-only, `SameSite=Lax` cookies with a seven-day absolute session limit; use `Secure` except for explicitly configured loopback HTTP. JWT verification pins issuer, audience, and algorithm. Every protected request checks the session, user active state, credential version, expiry, and forced-change state in PostgreSQL. Reset, password change, and disable revoke sessions transactionally, so an unexpired JWT stops working online immediately.

Unsafe requests require an exact configured browser origin and a matching CSRF header/cookie binding. Do not derive allowed origins from `Host` or arbitrary forwarding headers, and do not enable permissive credentialed CORS. Auth and other sensitive responses use `Cache-Control: no-store`. Login throttling is shared in PostgreSQL and occurs before Argon2 verification; M1a uses the direct socket address and ignores forwarded client IP headers.

Logout verifies a bearer token's signature and session claims even after its access expiry, then revokes the matching session and clears its refresh cookie. If the bearer session and refresh-cookie session differ, revoke only the bearer session and preserve the cookie so a stale tab cannot log out the active account.

Temporary-password sessions are restricted to changing that password or logging out. A successful own-password change verifies the current password, clears the forced-change flag, increments the credential version, and revokes all sessions. Admin reset writes a new temporary Argon2id password and revokes all target sessions. The next login is restricted again.

Draft creation keeps M0's atomic receipt-plus-draft transaction. The transaction rechecks the current account/session, claims the receipt under `(userId, commandId)`, compares canonical request hashes on replay, and inserts the draft with the principal's user ID. Same-user/same-body retries return the saved acknowledgement; changed bodies return a conflict. Another user's receipt is invisible. Existing null-author rows are not returned by authenticated draft reads and can never be replayed or claimed by login, migration, or seed execution.

## Browser storage and synchronization

Create a separate IndexedDB workspace for each `(environment, origin, userId)`. Each contains drafts, immutable outbox commands, server snapshots, and its renewable sync lease. Database names are derived from a validated scope, and only the workspace module can open them. Access tokens, refresh tokens, and passwords are never persisted in IndexedDB or local storage.

Use an origin-wide control database for a monotonic identity epoch and a recoverable account-departure journal. The browser Web Locks API serializes login, refresh, password change, and the full logout transition through durable completion. Each tab captures the current epoch; an epoch change fences stale tabs. `BroadcastChannel` may notify tabs promptly, but the durable control record is authoritative. Do not use expiring tab ownership IDs for lifecycle locks.

The old anonymous `sazeh-m0-drafts` browser database remains untouched and quarantined. M1a never opens it as an authenticated workspace and never uploads its commands. The UI provides an explicit export that preserves the unowned identity. On logout or account switch, advance the identity epoch, acquire an exclusive workspace activity lock, and count after accepted local saves have committed. Then require the user to cancel, keep/export pending work, or explicitly discard it. Persist the selected action before deleting anything so a crash can repeat discard safely. Offline logout records a tombstone and blocks another account until server revocation completes.

Session expiry pauses sync but preserves local capture and the outbox. Reconnection refreshes before sending. An authentication rejection marks commands `auth-required`; it does not delete or retry them under another user. A disabled/revoked session locks that workspace until the same account authenticates again. A different account always opens a different database.

The runner uses an in-memory single-flight promise before its first asynchronous step, plus a cross-tab lease with a unique run ID, generation, and short expiry. It renews while active. Before each request and each acknowledgement transaction it checks scope, identity epoch, lease owner/generation, and live in-memory access token. On lost ownership, expiry, logout, or account change it aborts and stops dispatch; acknowledgement is owner-fenced. Retries keep the same immutable command ID and body. A timer wakes the queue at the earliest transient retry time or active lease expiry, so a surviving tab can recover after the owner closes. Conflicts and validation failures remain held until an explicit resolution is added.

Map API results to explicit states: expired/missing authentication pauses for authentication, explicit session revocation or account disable locks the workspace, `409` holds a conflict, `422` holds validation errors, and network/`429`/`5xx` failures retry with bounded backoff and `Retry-After`. Ordinary session expiry returns `AUTH_REQUIRED`; refresh replay returns `SESSION_REVOKED` after its revocation commits. Verify command and entity identifiers before acknowledging. Preserve M0's local draft-plus-outbox transaction and duplicate prevention.

Do not enable Express forwarded-header trust for M1a. Login throttling uses the direct socket address so an untrusted `X-Forwarded-For` value cannot select another bucket. A future proxy deployment must add a validated proxy-address allowlist before using forwarded addresses.

## Alternatives and evidence

Two structurally distinct proposals were reviewed. Candidate B used one shared IndexedDB with compound identity keys and allowed all authenticated admins to read current and legacy notes. Candidate A used per-user databases and author-only note access. The independent comparison recommended A: the user's explicit offline identity scope and private-data boundary favor isolation, while equal future business permissions do not establish access to anonymous M0 notes. Candidate B's single database makes some departure updates atomic but depends on every query carrying the correct compound scope.

Retain B's stronger departure protocol in A: use the origin control database to durably fence tabs, stop runners, record the pending-work choice, and finish the transition. Since separate databases cannot share one IndexedDB transaction, each phase must be idempotent and recoverable after a crash.

The implementation preserves M0's atomic local save, server receipt transaction, immutable command IDs, and restart-safe idempotency. Direct API and built-browser verification cover live revocation, refresh replay, unowned data, stale-runner fencing, logout recovery, sync outcomes, and the 360 px Persian RTL layout. No financial or project-management modules are part of this slice.
