# Sazeh

Online Persian RTL construction project management: projects, people, workforce accounting, procurement, inventory, finance, evidence and analytics. React/Vite, TanStack Query, NestJS, Drizzle/PostgreSQL and private S3-compatible storage.

All saves require a server response. There is no IndexedDB, offline draft queue, background synchronization or cached application shell. Server-side financial drafts still require explicit finalization.

## Prerequisites

- Node.js 24.x. The repository records 24.22.1 in `.node-version` and requires Node 24.x in `package.json`.
- Corepack and pnpm 12.15.0. The exact package-manager version is pinned in `package.json`.
- Docker Desktop with Compose v2.
- Microsoft Edge for the browser verification command. Playwright uses the installed Edge channel.

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

- Web app: <http://127.0.0.1:5173>
- API liveness: <http://127.0.0.1:5173/api/health/live>
- API readiness: <http://127.0.0.1:5173/api/health/ready>
- Direct API liveness: <http://127.0.0.1:3000/api/health/live>

Vite proxies `/api/*` to the local API. PostgreSQL stores application data; attachments use private object storage.

## Account setup

Run `pnpm bootstrap:superuser` once against the intended database. It creates the first superuser; it is not a password reset. The superuser creates admin accounts and their initial passwords must be changed on first login.

## Checks

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`: source and production build checks.
- `pnpm verify:browser`: five isolated browser regressions with HTTP fixtures; no database required. Covers confirmed saves, visible failures, no reconnect replay, online notes, login/logout and 360 px RTL.
- `pnpm verify:api`, `pnpm verify:m3`, `pnpm verify:m4`: real PostgreSQL API, accounting, stock and reconciliation checks. Require local services and `.env`.
- `pnpm verify`: complete source, database, API, storage and browser checks.

Browser fixtures prove UI request behavior, not authenticated production operation. Use the database-backed checks and real storage validation for the corresponding server behavior.

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

## Product reference

- [Requirements](PRD.md)
- [Decisions](DECISIONS.md)
- [Domain and API](specs/DOMAIN_API.md)
- [Acceptance and accounting examples](specs/ACCEPTANCE.md)
- [Security](specs/SECURITY.md)
- [Persian client proposal](CLIENT_PROPOSAL_FA.md)
