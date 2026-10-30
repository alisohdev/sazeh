# Security and data handling

- Every application read/write requires a valid server session. Only health, CSRF, login, refresh and logout are public exceptions. Restricted temporary-password sessions only access password change/logout.
- The server derives actors from the session and checks account activation, session revocation and credential version. Request bodies cannot select another author.
- Access JWTs last 15 minutes and remain in memory. Refresh credentials rotate in an HttpOnly, SameSite cookie, with seven-day absolute session expiry. Unsafe requests require the configured origin and CSRF cookie/header pair. Passwords are Argon2id hashes.
- Login, account changes, logout and password changes clear private browser query data. Cross-tab notifications invalidate the other tab's session. A sessionStorage flag records explicit logout; it contains no business data or credentials.
- There is no IndexedDB persistence, local draft export, outbox, deferred logout or background upload. Failed requests do not become saved work and are never automatically replayed after reconnection. Unsaved form contents are temporary.
- Existing browser databases from older releases are no longer opened or used. This change does not silently erase previously saved browser data. Server records and migration history are retained.
- New releases do not register a service worker. The retirement worker and startup cleanup unregister older app-shell workers and remove their Workbox caches.
- Attachments remain private, scoped to authorized records, limited to JPEG/PNG/WebP/PDF and 10 MB per file. Uploads require a server ticket and verified completion. Downloads use expiring private URLs.
- Finalization, reversal, stock validation, optimistic versions and duplicate-command protection are enforced on the server. Server-side financial drafts remain outside finalized reports.
- Production readiness requires database/file backup restoration, migration rehearsal, configured secrets, isolated preview data and authenticated feature verification. Mock browser tests do not establish production security or accounting correctness.
