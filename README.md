# Sazeh M0 — local application foundation

M0 is the local-first foundation for the construction application. It includes a React/Vite installable PWA, a NestJS API, PostgreSQL with Drizzle migrations, and S3-compatible development attachment storage backed by SeaweedFS. The only user workflow is an offline-capable note draft. Financial modules and authentication endpoints are not implemented.

## Prerequisites

- Node.js 24.x. The repository records 24.22.1 in `.node-version` and requires Node 24.x in `package.json`.
- Corepack and pnpm 12.15.0. The exact package-manager version is pinned in `package.json`.
- Docker Desktop with Compose v2.
- Google Chrome for the browser verification command. Playwright uses the installed Chrome channel.

Run commands below from the repository root in PowerShell.

## First-time setup

```powershell
corepack enable
corepack prepare pnpm@12.15.0 --activate
pnpm --version
Copy-Item -LiteralPath .env.example -Destination .env
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm storage:init
```

The local-only values in `.env.example` are for a developer machine. Do not reuse them in Vercel or any shared environment. PostgreSQL listens on `127.0.0.1:15432`; SeaweedFS exposes its S3 API on `127.0.0.1:8333`. Compose persists database and object data in named Docker volumes. The `attachments` bucket is created with local development credentials.

`pnpm db:migrate` applies checked-in Drizzle SQL migrations and is safe to repeat. `pnpm db:seed` inserts one synthetic draft through the same idempotent command path and is restricted to `APP_ENV=local`. `pnpm storage:init` creates the local bucket if needed. None of these run implicitly when the API starts.

## Run the application

```powershell
pnpm dev
```

- PWA: <http://127.0.0.1:5173>
- API liveness: <http://127.0.0.1:5173/api/health/live>
- API readiness: <http://127.0.0.1:5173/api/health/ready>
- Direct API liveness: <http://127.0.0.1:3000/api/health/live>

Vite forwards `/api/*` requests to NestJS on port 3000. Readiness checks PostgreSQL and, when S3 settings are present, the configured bucket. The note form commits a local draft and its immutable outbox command in one IndexedDB transaction before showing success. It attempts synchronization when opened, when connectivity returns, and when the user selects retry. A retry uses the original command ID and body.

The service worker caches the app shell only; it does not cache API responses. Drafts remain in IndexedDB across reloads. The page includes an export action for drafts that have not synchronized.

The Persian interface uses the supplied, self-hosted IRANSansXFaNum WOFF2 files. The PWA precaches these fonts for offline use. The archive did not include a project license file or code; retain the FontIran project license with any published deployment.

The migration also creates the minimal `users` table needed by the delivery plan. To create the first local superuser record, run:

```powershell
pnpm bootstrap:superuser
```

The command asks for a username and display name, reads the password without echoing it, stores only an Argon2id hash, and refuses to create another superuser. M0 intentionally has no login or session endpoints, so this record is not yet used by the PWA.

## Verify M0

Stop `pnpm dev` before running the complete browser suite; verification starts its own built API and PWA servers.

```powershell
pnpm lint
pnpm typecheck
pnpm format:check
pnpm verify:database
pnpm verify:bootstrap
pnpm build
pnpm storage:verify
pnpm verify:api
pnpm verify:browser
```

Or run all checks in sequence:

```powershell
pnpm verify:m0
```

The API proof sends concurrent retries for one command, checks that reusing its ID with changed content and reusing its entity ID both return `409`, restarts NestJS, retries the command again, reads the saved draft, and confirms PostgreSQL contains exactly one draft and one receipt. The browser proof uses the production build: it installs the service worker, saves while offline, reloads offline, reconnects, syncs through the local API proxy, and reads the resulting server draft.

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
3. Use Node.js 24.x and pnpm 12.15.0 for both projects. Set `APP_ENV=preview` on the preview API, enable deployment protection on both projects, and configure runtime `DATABASE_URL` with a pooled URL for that preview's PostgreSQL branch.
4. Create one isolated PostgreSQL branch per pull request. Set `DATABASE_URL` to its pooled URL and `DATABASE_URL_UNPOOLED` to its direct URL for explicit migrations; `pnpm db:migrate` prefers `DATABASE_URL_UNPOOLED`. Run it before routing frontend traffic to the API. Do not share the production database or use a production credential in a preview.
5. Deploy the API preview first. Copy its exact immutable deployment URL from Vercel's deployment details, then generate the frontend's external `/api/*` rewrite:

   ```powershell
   node scripts/prepare-vercel-preview.mjs --api-url https://<exact-api-deployment>.vercel.app
   ```

   The command writes `apps/web/vercel.json` with that exact API origin. Deploy the frontend from the generated local source. Regenerate it for each paired API deployment; do not point it at a moving production or branch alias.

The workspace has no Vercel project linked to it and no preview PostgreSQL branch or credentials configured, so no preview deployment or URL is claimed. Preview attachment storage is not provisioned by M0; configure a private S3-compatible service if preview attachment work is later added. Authentication endpoints also remain a later milestone: deployment protection is required for any unauthenticated M0 preview API.

## Scope and planning pack

M0 does not include financial records, project administration, authentication routes, attachment upload endpoints, or production deployment. The one-time bootstrap command prepares the minimal user table only.

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

The design synthesis for this milestone is recorded in [M0_ARCHITECTURE.md](M0_ARCHITECTURE.md), with the implementation checklist in [M0_PLAN.md](M0_PLAN.md).
