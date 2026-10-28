# Coding agent handoff

Read README.md, DECISIONS.md, PRD.md, adr/ADRS.md and both specifications before implementation. Treat product-owner decisions as authoritative and engineering defaults as the current planning baseline. Do not infer client sign-off or production readiness.

Start with milestone M0 only. Create the project foundation for React + Vite PWA, NestJS, Drizzle and PostgreSQL, with strict TypeScript, explicit migrations, synthetic fixtures and documented local startup. Choose and pin compatible exact versions using current official documentation. Keep the architecture a modular monolith; no tenant engine, microservices, automatic payroll, external payment provider or unrequested features.

Prepare local PostgreSQL and S3-compatible development storage, /api proxying and health endpoints. Prove a small IndexedDB draft -> idempotent server draft synchronization path before expanding the domain. Prepare paired Vercel frontend/API configuration and isolate preview data. Validate cookie forwarding, pooled DB connections and direct upload compatibility if configured credentials exist; otherwise report the exact missing external dependency and continue local work. Never fabricate a live preview URL or ask for secrets in chat.

Do not implement financial finalization until the M0 storage/sync/environment feasibility gate passes. Do not use in-memory arrays as the authoritative database. No localStorage credentials, float money calculations, offline final posting or background-sync-only behavior.

Deliver: repository structure, selected versions/rationale, documented commands, environment example without secrets, migrations/seed, feasibility tests and results, preview configuration, known blockers and a proposed M1 plan. Keep all subsequent milestones separate and reviewable. Do not silently implement the entire product in one change.

Planning documents are in Markdown so they can be checked into the implementation repository. No application code, repository, commits, accounts or deployments were created by the planning task itself.
