# M0 architecture decision

## Decision

Use a pnpm TypeScript workspace with a shared Zod contract package, a NestJS API, and a React/Vite installable PWA. PostgreSQL is the authority for server drafts and command receipts. Dexie-backed IndexedDB owns device drafts and the immutable outbox. SeaweedFS provides S3-compatible development attachment storage. Vercel frontend and API projects are paired by an exact API deployment URL; preview database branches are isolated per pull request.

## Alternatives considered

1. **Entity-keyed create idempotency.** Use the client-generated draft UUID as the idempotency key, return the existing record when the same UUID is retried, and reject changed content. This is compact, but it does not preserve the API contract's command identity or return a durable prior command result independently of the entity.
2. **Immutable command identity with receipts (selected).** Generate a UUID for both the draft entity and create command. Store a canonical request hash and response snapshot in `command_receipts`, atomically with the draft. Same command and same body replays the saved result; same command with changed body conflicts. A new command targeting an existing draft UUID also conflicts.

## Rationale and grafts

The second design follows `specs/DOMAIN_API.md`, which requires retained command receipts, same-ID/same-body replay, and a conflict for changed content. Its transactional receipt-plus-draft write makes retries safe through timeouts and API restarts. The client keeps a persisted `PENDING` state and a transient in-memory `SENDING` state; views receive a domain-only `DraftView`, while the outbox owns protocol payloads. The PWA observes state and closes its database cleanly. The API keeps the create contract narrow and validates all inbound and stored values at runtime.

M0 has no accounts or authentication endpoints, so the demo create endpoint is intended only for local development and protected previews. Production mode rejects draft writes until authentication is implemented. The one-time CLI bootstrap uses a database advisory lock and permits future multiple superusers; it does not create an auth API or seed credentials. Preview deployments require separate per-PR PostgreSQL branches and immutable frontend-to-API pairing; no floating API alias is generated.

## Boundaries

- `packages/contracts`: shared runtime request, response, and local draft schemas.
- `apps/api`: Nest HTTP boundary, use case transaction, Drizzle schema and migrations.
- `apps/web`: responsive RTL entry form, IndexedDB adapter, outbox runner, service worker.
- `scripts`: deterministic storage initialization, synthetic seed, API idempotency proof, and exact preview rewrite generation.
- `compose.yaml`: loopback-only PostgreSQL and SeaweedFS S3 storage with persistent volumes.

## Excluded

No financial entities or workflows, auth endpoints, finalization, background-only sync, generic API caching, production URL, or deployment claim is part of M0.
