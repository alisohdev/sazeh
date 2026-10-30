# M3 Procurement and Project-Site Inventory Plan

## Objective

Deliver the procurement and project-stock vertical slice on the current M1/M2 base: a shared material directory, itemized supplier purchasing and settlement, project-site receipts and movements, weighted-average valuation, offline editable drafts with explicit online posting, supplier and stock statements, and finalized-record analytics. Preserve the existing account-scoped queue, authentication boundaries, audit provenance and M1/M2 behavior.

## Approved domain rules

- Keep one stock location per project and one base unit per material. Do not add a central warehouse or automatic unit conversion.
- Purchase invoices create supplier liability. Supplier payments settle liability. Receipts create stock. Consumption creates material cost. These effects remain distinct and are never added together as duplicate expenses.
- Support itemized invoices, partial/full receipts, partial payments and allocations, supplier/project statements, unallocated advances and visible supplier debt or credit.
- Support consumption, atomic project-to-project transfers, consumption returns at the referenced issue cost, and supplier returns that remove current carrying value, credit the original invoice price and expose the valuation difference.
- Use exact decimal quantity arithmetic (three fractional places), whole-toman line rounding and weighted-average carrying value in server posting order. Full depletion takes the entire remaining carrying value. Never allow negative stock.
- Lock all affected project/material balances in stable order and revalidate versions, projects, suppliers, source lines, quantities and dependencies inside the posting transaction.
- “Receive all now” posts the linked invoice and receipt in one transaction and produces liability plus stock exactly once.
- Save financial work offline only as editable server-draft commands. Finalization and reversal require an online, explicit manager action. Retried commands keep the same ID and body; changed content with the same ID conflicts.
- Finalized records are immutable. Corrections are linked, reasoned reversals or current adjustments. Invoice reversal is blocked while allocations or receipts depend on it.
- Reports and charts use finalized effects only. Pending local/server drafts are shown separately. Empty datasets show an empty state and never synthetic metrics.

## Verifiable implementation units

### 1. Material directory and contracts

- Add strict runtime schemas and an M3 OpenAPI document for materials, procurement drafts, lines, finalization, reversals and report filters.
- Add additive PostgreSQL tables and constraints for materials, procurement documents/lines, payment allocations, stock movements, stock balances and account-scoped command receipts.
- Implement shared material list/create/update/archive/reopen behavior with optimistic versions, server-derived actors, soft archive and audit/change-feed publication.
- Verify archive history, stale edits, active-material posting requirements and no unit conversion fields.

### 2. Supplier purchasing and statements

- Implement itemized purchase-invoice drafts, exact server line totals, supplier-payment drafts and allocation validation.
- Finalize invoice liability and payments atomically and idempotently. Keep unallocated payments as supplier advances/credits.
- Provide supplier/project/date-filtered statements with procurement, payments, debt/credit, pending count and source-record drill-down.
- Implement atomic “receive all now” so one command creates the invoice effect and linked stock receipt without double counting.

### 3. Project-site stock and valuation

- Implement partial/full invoice receipts, stock consumption, atomic transfers, consumption returns and supplier returns.
- Maintain per-project/material quantity and carrying value plus immutable posting-ordered movement history.
- Use exact weighted-average issue valuation, original-cost consumption returns, supplier-return credit/current-carrying-value differences and full-depletion remainder handling.
- Reject over-receipt, over-return, negative stock, duplicate posting and concurrent overdraw. Lock transfer endpoints in stable project/material order.

### 4. Offline and mobile workflow

- Forward-migrate the existing per-origin/user IndexedDB database with procurement drafts and immutable outbox commands while preserving notes, directories, workforce work and leases.
- Save draft + command atomically; keep edit revisions, dependencies, retry/auth/conflict/validation states and stale-ack fencing. Sync creates/updates server drafts only.
- Add an explicit online review/finalize action and reasoned reversal flow. Include procurement pending work in export, logout/account-switch review, discard and retry scheduling.
- Add Persian RTL, Jalali/toman, 360 px purchase/stock forms and cards using the existing shadcn/Tailwind and TanStack Query boundaries. Keep React component files at or below 200 lines.

### 5. Analytics, verification and handoff

- Add finalized-only purchases by supplier/material, supplier debt, stock quantity/value and consumption trend endpoints with project/supplier/material/date filters and source IDs.
- Render meaningful charts only when source rows exist; otherwise show explicit empty states. Label posting-order valuation versus business-date filtering.
- Verify STOCK01–05 and FIN01 with PostgreSQL, including concurrent issues/transfers, partial deliveries, lost replies, changed-body retries, duplicate finalization, returns and valuation rounding.
- Add focused built-browser coverage and 360 px screenshots for offline draft/review/finalization, statements and analytics. Run the retained M1/M2 regression suite and inspect generated artifacts.
- Open a draft PR to `main` with exact verification evidence, mobile screenshots, analytics examples and limitations. Stop before merge or deployment.

## Acceptance mapping

- **STOCK01:** receipts 100 @ 200 and 100 @ 300, then consumption 50 -> quantity 150, value 37,500, consumed cost 12,500, average 250.
- **STOCK02:** transfer 20 from A to B -> A 130/32,500; B 20/5,000; no company expense or cash effect.
- **STOCK03:** return 10 from the issue -> restore 10/2,500; net consumption cost 10,000.
- **STOCK04:** two concurrent issues of 80 against 100 -> one succeeds, one conflicts, quantity never negative.
- **STOCK05:** supplier return 10 bought @ 200 at average 250 -> stock -10/-2,500; supplier credit 2,000; visible 500 valuation loss.
- **FIN01:** invoice 50,000; payment 20,000; fully received and unconsumed -> debt 30,000; procurement 50,000; stock 50,000; consumption 0; cash out 20,000.
- **COR02:** invoice reversal with allocations or dependent receipts names the dependencies and changes no balances.
- **SYNC02/03/11:** lost replies replay one draft/posting; changed content under the same command ID returns conflict; finalization intent survives refresh.
- **MOBILE01/LOCAL01/02:** exact Persian-digit input, Jalali date round-trip, toman display and no page-wide overflow at 360 px.

## Working boundaries

- Base revision: `5793189` on `codex/m3-procurement-inventory-2`.
- Preserve the unrelated untracked `debug.log` and do not modify or stage `pnpm-workspace.yaml`.
- Use synthetic local fixtures only. Do not merge, deploy, provision infrastructure or touch production data.
- Evidence boundaries: local PostgreSQL and desktop Chrome at a 360 px viewport are not actual-device, preview or production proof.

## Verification record

Verified on 30 October 2026 against the local PostgreSQL database and the built PWA:

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` - pass.
- `pnpm build` - pass; Vite reports the existing large-entry-chunk warning (the M3 build is about 969 kB minified / 285 kB gzip) but produces the PWA and service worker.
- `pnpm verify:m3` - pass after an idempotent migration. It covers STOCK01-05, FIN01, COR02, partial deliveries, duplicate source-line rejection, value conservation across rounded partial receipts and supplier credits, over-receipt, issue and transfer races, immutable lost-reply replay, changed-body conflict, duplicate finalization, receive-all atomicity, filtered line-level report totals, separated supplier debt/advance balances, half-up rounding and JSON-safe reports.
- `pnpm verify:api` - pass for the retained M1a/M1b/M2 identity, directory, sync-recovery, workforce, concurrent-finalization, reversal and account-isolation suite.
- `pnpm verify:browser -- tests/m3/procurement.spec.ts` - pass in built Chrome at 360 x 800. It saves an invoice offline, reloads it, commits a reply that is then lost, proves the retry body is identical, explicitly finalizes receive-all, filters by project, checks finalized-only totals and verifies no horizontal overflow.
- The full `pnpm verify:m0` gate passes lint, type-check, formatting, idempotent database migration/seed, bootstrap, build, storage, retained API verification, expanded M3 verification and all 14 built-browser tests. The browser suite now follows the split routes and project-dossier note workflow while retaining offline account isolation, parent ordering, conflict handling, abandoned-upload recovery, workforce and procurement lost-reply replay, explicit finalization and 360 px RTL coverage.

Captured evidence:

- `output/playwright/m3/m3-mobile-offline-invoice-draft.png` - pending work remains visibly separate from finalized totals.
- `output/playwright/m3/m3-mobile-finalized-analytics.png` - a synthetic 2,500,000-toman finalized invoice shows 2,500,000 procurement, supplier debt and stock value; zero payment/consumption; linked invoice/receipt source records; and a supplier-purchase bar with drill-down.

Evidence boundaries and limitations:

- Tests use synthetic local fixtures, one PostgreSQL instance and desktop Chrome emulating a 360 px viewport; they do not prove actual-device, preview, production, backup/restore or multi-process production-pool behavior.
- Reports expose management valuation in server posting order and label that business-date filters do not reorder stock history. No period-close accounting, procurement approval workflow, unit conversion, central warehouse, deployment or production migration is included.
