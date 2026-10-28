# M0 implementation plan

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame the work with a falsifiable completion predicate, bounded scope, and rigor level.
- [x] Phase B: Design atomic implementation units, put the riskiest unknowns first, and write this plan down.
- [x] Phase C: Treat each unit as an experiment, make the smallest change, verify it on the real artifact, and revert any change that does not advance the predicate.
- [x] Phase D: Keep the append-only decision trail in `decisions.tsv`.
- [x] Phase E: Verify the whole product against the completion predicate and hand it back.

## Definition of done

M0 is complete when a clean local setup can start PostgreSQL and S3-compatible storage, apply explicit migrations twice, seed synthetic data twice, start the NestJS API and Vite PWA, save a draft offline, reload the built PWA offline with that draft intact, then reconnect and retry the same command without creating a second PostgreSQL draft or command receipt. The API must retain the draft across an API restart. Strict type checks, lint, formatting, and a production build must pass. Preview configuration must point each frontend deployment at its paired API deployment and document per-preview PostgreSQL isolation. No financial workflow may exist.

## Scope and rigor

The workspace starts from planning documents and contains no app code or Git repository. The work spans a pnpm workspace, two local services, PostgreSQL schema and operations, a small API, a PWA, browser persistence, and preview configuration. The delivery pack adds a one-time superuser bootstrap CLI. Rigor is high for database writes, retry identity, offline state, and secret handling. UI polish and deployment setup remain narrow because no brand assets or external service account are available.

The baseline has no API, frontend, database schema, app tests, Vercel project for this workspace, or Git metadata. Docker is available. The local runtime is Node.js 24.19.0 with pnpm 11.24.0. A connected Vercel account lists two unrelated projects. No preview PostgreSQL connection is configured.

## Architecture synthesis

Two structurally distinct designs were evaluated in `M0_ARCHITECTURE.md`. Durable immutable command receipts were selected to match `specs/DOMAIN_API.md`; the local outbox keeps the payload immutable and retryable. The architecture artifact records tradeoffs, safeguards, exclusions, and integration boundaries.

## Implementation units

1. Select exact compatible versions, create the strict pnpm workspace and deterministic verification scripts.
2. Add loopback-only PostgreSQL and SeaweedFS services, the environment example, explicit Drizzle migrations, idempotent synthetic seed, storage setup, and one-time bootstrap CLI.
3. Add liveness/readiness and the typed draft create/replay API. Prove validation, replay, conflict, and persistence across API restart against PostgreSQL.
4. Add the Persian RTL PWA screen, manifest, service worker, Dexie draft/outbox transaction, foreground retry, and a built-browser offline/reload/sync proof.
5. Add paired Vercel API/frontend configuration and an exact-target rewrite generator. Record the database integration and account dependencies without claiming a deployment.
6. Run the complete M0 verification, inspect the final files and diff, and record remaining blockers.

## Checkpoint results

| Unit | Predicate                                                                                                                                                                                  | Result                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1    | Frozen install, strict TypeScript, lint, and formatting work from the workspace root.                                                                                                      | Passed                                                                                      |
| 2    | Repeated migration and seed runs are safe. PostgreSQL and private object storage pass health and round-trip checks. Bootstrap refuses a second superuser and does not expose its password. | Passed                                                                                      |
| 3    | Same command and body return one stored result after retries and an API restart. Reusing a command ID with different content returns 409.                                                  | Passed                                                                                      |
| 4    | Built app shell opens offline. A draft survives reload and synchronizes once after reconnect.                                                                                              | Passed                                                                                      |
| 5    | Vercel config contains an exact paired API destination; preview setup documents a separate database branch for each preview.                                                               | Passed (configuration verified; deployment blocked by missing project and preview database) |
| 6    | Full M0 verification passes, with no financial modules or unverified deployment claims.                                                                                                    | Passed                                                                                      |
