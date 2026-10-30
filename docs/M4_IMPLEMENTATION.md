# M4 implementation and verification

M4 extends the existing shared company workspace with project finance records, private document evidence, and a combined management report. The supplied M4 plan and preliminary totals helper were retained.

## Financial posting

- Expense drafts become incurred cost only at online finalization. Separate expense-payment records settle their referenced expense; allocations are not another expense or cash effect. Overpayment remains visible as a negative payable.
- Authenticated command IDs bind a canonical body hash to a durable user-scoped receipt. Draft writes, submission, approval, posting and linked reasoned reversals commit with audit and change-feed publication.
- Project row locks serialize posting and dependency checks. Expected versions reject stale decisions. Reverse active payment dependencies before reversing their expense. Reversals retain the original and post one signed inverse.
- Initial project contract value is protected once finance records exist; signed amendments retain their explanations. Submitted claims contribute no revenue until a separate approval decision; the original submission and approved amount remain distinct. Owner receipts affect cash and receivables, including advances, without creating revenue.
- Supplier billing classification is captured at posting, including the source classification for expense payments. A shared contact does not link an expense to a purchase invoice.

## Offline work and evidence

Finance drafts, explicitly initiated online posting commands, cached finance rows, and binary evidence use the existing environment/origin/account-scoped IndexedDB workspace. Immutable queue bodies survive lost replies. Parent directory records synchronize before finance drafts, and finance drafts before evidence. Cross-tab Web Locks and workspace identity checks fence queue work. Pending counts, export (including binary data), explicit discard, and retry wakeups include the added queues.

Private S3 tickets retain stable attachment IDs, expire after 120 seconds, and bind type and size. Completion checks size and magic bytes, then stores the verified bytes under a separate ready key that upload tickets cannot overwrite. Completion replay retains one link. Downloads are authenticated and audited and expire after 60 seconds. JPG, PNG, WebP and PDF are limited to 10 MB and five files per record. Optional pending evidence requires explicit finalization acknowledgment; its blob stays queued until server confirmation. Local storage initialization installs scoped browser CORS rules without granting public object reads.

## Reporting

The report reads M2, M3 and M4 in one PostgreSQL repeatable-read transaction. It separates labor net of deductions, material consumption and supplier-return valuation adjustments, other expenses, owner revenue/receipts, worker/supplier/expense balances, contract references, and stock movements/value. Transfers and purchase invoices do not become consumption cost. Original and inverse effects are each included once.

Project and business-date filters feed opening, period and closing totals, Jalali-month charts, category budgets, source rows and CSV. Money remains integer strings and BigInt; chart geometry alone uses bounded numeric ratios. The Persian mobile dossier includes finance capture, approvals, reversals, evidence status/download, management tables, charts, filtered CSV and browser print. All changed React component files remain within 200 lines.

## Evidence

- PostgreSQL and private object-store scenarios: run `pnpm verify:m4`.
- Complete retained regression gate: run `pnpm verify:m0` (now includes M4).
- Mobile FIN02, durable offline binary, lost completion reply, unauthorized attachment access and overflow checks: `tests/m4/finance.spec.ts`.
- Synthetic FIN03/FIN04 and multi-month budget/reversal projections: `output/m4/reconciliation.json`; source CSV: `output/m4/statement.csv`.
- Mobile screenshot: `output/playwright/m4/fin02-360.png`; browser print artifact: `output/m4/statement-print.pdf`.

Evidence is local, authenticated and synthetic. No merge, deployment, actual-phone test, hosting-provider verification, or client terminology acceptance is implied. Attachment targets include finance records, workforce records (including worker payments), procurement documents (including invoices), and projects (including contracts). A typed target registry retains foreign keys to the authoritative parents; migration 0015 backfills existing finance attachment identities. The projects overview also exposes the combined company-wide report using the same projection as project dossiers.

Original M4 local gate: `pnpm verify:m0` passed, including all 15 built-browser tests (4.1 minutes). The preliminary totals tests passed 2/2. The 360 px screenshot was visually inspected; the browser-generated print PDF is retained as an output artifact.

## PR 8 review follow-up

Finance and evidence sync check the shared authentication pause before dispatch and between commands. Authentication rejection pauses all queues; refresh also checks the pause inside its lifecycle lock and fences the failure to the original account epoch.

Company budget costs match both project ID and category. The PostgreSQL regression uses two projects sharing transport and asserts each project keeps its own costs and variance.

Unsynchronized drafts expose the same editor as synchronized drafts, including business date edits. An attempted command keeps its immutable payload; newer desired input and edit revision are retained separately. A lost reply replays the original command, then emits a fresh update at the acknowledged version. Definitive validation/conflict failures stop automatic retries and expose explicit accept-server or revise-against-server choices.

The shared private evidence controls now appear on project, workforce and procurement records and local pending entries. Parent validation, foreign keys, private object checks and live-session checks cover every target type. Workforce/procurement finalization also requires explicit acknowledgment of pending evidence. Account departure counts include finance drafts/actions and binary evidence, and export retains the queued blobs.

Regressions live in `tests/m4/followup.spec.ts`, expanded `tests/m2/workforce.spec.ts` and `tests/m3/procurement.spec.ts`, and `apps/api/scripts/verify-m4.ts`. The follow-up full gate output is retained in `output/m4/followup-verify.log`.

The extended offline evidence regression also exposed paused local IndexedDB queries in workforce/procurement. Those local query hooks now use `networkMode: "always"`; server query gates remain online-only. Authentication-pause notifications mark queued notes as requiring sign-in even when refresh rejects before the note queue starts.

Follow-up result: `pnpm verify:m0` passed, including all 20 built-browser tests (4.0 minutes). The current full log is `output/m4/followup-verify.log`. Mobile conflict resolution and offline workforce/procurement evidence screenshots are retained under `output/playwright/m4/`. No merge or deployment was performed.
