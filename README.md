# Sazeh — local-first application

This repository contains the M0 local-first foundation and the M1a authentication vertical slice. It includes a React/Vite installable PWA, a NestJS API, PostgreSQL with Drizzle migrations, and S3-compatible development attachment storage backed by SeaweedFS. The application supports authenticated offline note drafts, superuser-managed admin accounts, and refreshable sessions. Financial modules and project management are not implemented.

## Prerequisites

- Node.js 24.x. The repository records 24.22.1 in `.node-version` and requires Node 24.x in `package.json`.
- Corepack and pnpm 12.15.0. The exact package-manager version is pinned in `package.json`.
- Docker Desktop with Compose v2.
- Google Chrome for the browser verification command. Playwright uses the installed Chrome channel.

Run commands below from the repository root in PowerShell.

## First-time setup

```powershell
corepack pnpm --version
Copy-Item -LiteralPath .env.example -Destination .env
corepack pnpm install --frozen-lockfile
docker compose up -d --wait
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm storage:init
```

Use `corepack pnpm` directly in PowerShell. Do not run `corepack enable` from an elevated shell or write package-manager shims beside Node under Program Files. The local-only values in `.env.example` are for a developer machine. Replace `JWT_SECRET` with a new random value and configure the exact browser-facing origin in every shared environment. The API ignores forwarded IP headers and uses the direct socket address for login throttling. PostgreSQL listens on `127.0.0.1:15432`; SeaweedFS exposes its S3 API on `127.0.0.1:8333`. Compose persists database and object data in named Docker volumes. The `attachments` bucket is created with local development credentials.

`corepack pnpm db:migrate` applies checked-in Drizzle SQL migrations and is safe to repeat. `corepack pnpm db:seed` inserts the synthetic M0 draft as explicitly unowned legacy data and is restricted to `APP_ENV=local`. It does not use the authenticated API or assign an owner. `corepack pnpm storage:init` creates the local bucket if needed. None of these run implicitly when the API starts.

## Run the application

```powershell
corepack pnpm dev
```

- PWA: <http://127.0.0.1:5173>
- API liveness: <http://127.0.0.1:5173/api/health/live>
- API readiness: <http://127.0.0.1:5173/api/health/ready>
- Direct API liveness: <http://127.0.0.1:3000/api/health/live>

Vite forwards `/api/*` requests to NestJS on port 3000. Readiness checks PostgreSQL and, when S3 settings are present, the configured bucket. The note form commits a local draft and its immutable outbox command in one IndexedDB transaction before showing success. It attempts synchronization when opened, when connectivity returns, and when the user selects retry. A retry uses the original command ID and body.

The service worker caches the app shell only; it does not cache API responses. Drafts remain in IndexedDB across reloads. The page includes an export action for drafts that have not synchronized.

The local browser origin must match `AUTH_ALLOWED_ORIGIN` exactly (`http://127.0.0.1:5173` by default). The API rejects unsafe requests without that origin and a CSRF cookie/header pair. The local cookie uses the localhost HTTP exception; shared environments must use HTTPS. M1a login throttling uses the direct socket address and ignores forwarded IP headers. Behind a proxy, requests share the proxy's throttle bucket until a future release adds a trusted proxy allowlist.

The Persian interface uses the supplied, self-hosted IRANSansXFaNum WOFF2 files. The PWA precaches these fonts for offline use. The archive did not include a project license file or code; retain the FontIran project license with any published deployment.

The migration also creates the minimal `users` table needed by the delivery plan. To create the first local superuser record, run:

```powershell
corepack pnpm bootstrap:superuser
```

The command asks for a username and display name, reads the password without echoing it, stores only an Argon2id hash, and refuses to create another superuser. Sign in with this account in the PWA. A superuser creates ordinary admin accounts in the application; the API generates and displays each temporary password once. New and reset passwords must be changed before the account can access drafts or admin screens. No public registration or worker accounts exist.

Authenticated drafts are visible only to their author. The server records the author from the live session, and idempotency receipts are keyed by user and command. Every protected request checks the current database session and account status, so logout, password reset, session revocation, or disabling an account takes effect before an access JWT expires.

Each browser workspace uses a separate IndexedDB database derived from environment, origin, and user ID. Access tokens stay in memory. The old anonymous `sazeh-m0-drafts` database is never opened for sync or imported into an account. An explicit legacy export downloads old anonymous M0 drafts marked unowned; the export cannot be uploaded automatically. M0 server seed drafts also remain ownerless and are not returned by the authenticated draft API.

## Verify M0

Stop `corepack pnpm dev` before running the complete browser suite; verification starts its own built API and PWA servers.

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm verify:database
corepack pnpm verify:bootstrap
corepack pnpm build
corepack pnpm storage:verify
corepack pnpm verify:api
corepack pnpm verify:browser
```

Or run all checks in sequence:

```powershell
corepack pnpm verify:m0
```

The API proof uses direct HTTP calls to verify anonymous access denial, first-login restrictions, superuser-only admin operations, reset, password change, cookie and bearer logout, session revocation, refresh replay, immediate account disable, exact origin/CSRF checks, login throttling, server-selected draft authors, private draft reads, user-scoped receipt replay, duplicate prevention, and legacy M0 quarantine. The browser proof uses the production build and authenticated fixtures. It saves offline, expires the server session, confirms that sync pauses without deleting the command, syncs one draft across two tabs after reauthentication, and checks held conflicts, validation failures, timed transient retries, and duplicate prevention. It exports pending work before an account switch and checks that the next user cannot see or upload it. The test reads the resulting rows from PostgreSQL and checks their owners.

## Version pins

All direct dependencies use exact versions and the repository commits `pnpm-lock.yaml` for the full transitive graph.

| Area                 | Pinned versions                                                                       |
| -------------------- | ------------------------------------------------------------------------------------- |
| Runtime/tooling      | Node 24.x (`.node-version` 24.22.1), pnpm 12.15.0, TypeScript 6.0.3                   |
| Web                  | React/React DOM 19.3.1, Vite 8.3.5, React plugin 6.1.2, PWA plugin 2.0.0, Dexie 4.4.7 |
| API                  | NestJS 12.3.2, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, postgres.js 3.4.9, Zod 4.6.7  |
| Quality/verification | ESLint 10.13.0, typescript-eslint 8.72.1, Prettier 3.9.10, Playwright 1.64.1          |
| Local services       | PostgreSQL 17.11 Alpine 3.23, SeaweedFS 4.51                                          |

The pinned Node major satisfies the Vite and NestJS runtime minimums. TypeScript 6.0.3 stays within the selected typescript-eslint peer range. Keep package versions exact; update them together with the lockfile and verification.

## Vercel preview setup

The configuration is prepared for two Vercel projects backed by this same repository:

1. Set the API project's Root Directory to `apps/api`; it uses `apps/api/vercel.json` and the `api/[...path].ts` NestJS adapter.
2. Set the frontend project's Root Directory to `apps/web`; enable Vercel's option to include source files outside that directory so both projects can install the root pnpm workspace.
3. Use Node.js 24.x and pnpm 12.15.0 for both projects. Set `APP_ENV=preview` and a fresh `JWT_SECRET` on the preview API, set `AUTH_ALLOWED_ORIGIN` to the exact paired frontend URL, and enable deployment protection on both projects. Configure runtime `DATABASE_URL` with a pooled URL for that preview's PostgreSQL branch.
4. Create one isolated PostgreSQL branch per pull request. Set `DATABASE_URL` to its pooled URL and `DATABASE_URL_UNPOOLED` to its direct URL for explicit migrations; `corepack pnpm db:migrate` prefers `DATABASE_URL_UNPOOLED`. Run it before routing frontend traffic to the API. Do not share the production database or use a production credential in a preview.
5. Deploy the API preview first. Copy its exact immutable deployment URL from Vercel's deployment details, then generate the frontend's external `/api/*` rewrite:

   ```powershell
   node scripts/prepare-vercel-preview.mjs --api-url https://<exact-api-deployment>.vercel.app
   ```

   The command writes `apps/web/vercel.json` with that exact API origin. Deploy the frontend from the generated local source. Regenerate it for each paired API deployment; do not point it at a moving production or branch alias.

The workspace has no Vercel project linked to it and no preview PostgreSQL branch or credentials configured, so no preview deployment or URL is claimed. Do not deploy a preview until it has a paired exact frontend origin, fresh auth secrets, isolated data, and application-level authentication. Preview attachment storage is not provisioned; configure a private S3-compatible service before attachment work is added.

## Scope and planning pack

The M0 baseline did not include financial records, project administration, authentication routes, attachment upload endpoints, or production deployment. M1a adds authentication and admin account management; it does not add financial or project-management workflows. The one-time bootstrap command prepares the first superuser account.

The planning pack remains available:

1. [Product requirements](PRD.md)
2. [Decision register](DECISIONS.md)
3. [Architecture decisions](adr/ADRS.md)
4. [Domain and API contract](specs/DOMAIN_API.md)
5. [Offline and security requirements](specs/OFFLINE_SECURITY.md)
6. [Acceptance requirements](specs/ACCEPTANCE.md)
7. [Delivery plan](DELIVERY.md)
8. [Client proposal](CLIENT_PROPOSAL_FA.md)
9. [Implementation brief](IMPLEMENTATION_BRIEF.md)
10. [Source references](SOURCES.md)

The design syntheses are recorded in [M0_ARCHITECTURE.md](M0_ARCHITECTURE.md) and [M1A_ARCHITECTURE.md](M1A_ARCHITECTURE.md), with implementation checklists in [M0_PLAN.md](M0_PLAN.md) and [M1A_PLAN.md](M1A_PLAN.md).
