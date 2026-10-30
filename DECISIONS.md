# Decision register

## Confirmed by the product owner

| ID | Decision |
|---|---|
| D01 | Build a production-ready first release, covering workers and materials rather than a disposable demo. |
| D02 | One company; roughly five admins and ten active projects. No SaaS tenancy or company switcher. |
| D03 | Superuser creates/manages admin accounts. Admins manage business data; no subordinate user roles in V1. Workers do not log in. |
| D04 | Username/password, temporary password, forced first-login change, self password change, administrative reset and disabling. |
| D05 | React + Vite frontend; NestJS API; Drizzle; PostgreSQL; JWT-based authentication. |
| D06 | A worker can work on multiple projects. Each earning, deduction or payment belongs to one project. |
| D07 | All six engagement types; manager-controlled simple calculations. Partial payments, advances and deductions. |
| D08 | Project-site inventory, suppliers, invoices, receipts, consumption, transfers, returns and supplier balances. No central warehouse. |
| D09 | Budgets, contract value/amendments, progress claims and incoming payments; distinguish amounts earned/incurred from cash movement. |
| D10 | Drafts editable; finalized financial records corrected through auditable adjustments/reversals. |
| D11 | Persian RTL, Jalali dates, toman and mobile-friendly online web UI. |
| D12 | Online-only as requested on 30 October 2026. Remove browser databases, offline saves, queues, background replay and offline logout recovery. Save success requires server confirmation. Retain server financial drafts and explicit finalization. |
| D13 | Local development first, Vercel preview, later Iran-based hosting such as Liara. |

## Project and directory rules

The business rules below remain in effect with online server storage.

| ID | Decision |
|---|---|
| D15 | M1b lifecycle is active -> archived -> active. Require archive/reopen reasons; retain IDs/history. Archive hides default active lists and does not certify financial completion. |
| D16 | Block new assignments to archived projects/contacts; retain existing assignments and history. |
| D17 | Engagement types: DAILY, HOURLY, QUANTITY, MONTHLY, FIXED_CONTRACT, MANUAL. Workers may span projects. Same worker/project periods cannot overlap; ends inclusive, empty end ongoing. |
| D18 | M1b budget categories are editable labels without a category-management subsystem. |
| D19 | Projects list first; creation and editing in a modal. Reports and charts live on a dedicated analytics page. |
| D20 | Warmed ordinary API p95 below one second on a defined dataset. |
| D21 | Verify observable correctness, account isolation and financial rules. UI review uses screenshots. Remove obsolete offline tests and historical milestone evidence. |

## Engineering defaults for this draft

These are recommendations chosen to make the pack implementable. They are not newly discovered client requirements. Keep the current decisions here.

- Node.js supported LTS shared across deployment targets; pnpm workspace. Pin compatible exact versions in milestone M0, not from memory.
- NestJS modular monolith using the default Express adapter; REST/OpenAPI; React Router and TanStack Query; no persistent browser data cache. No microservices, Redis or event broker required for this scale.
- One location per project, one base unit per material; no automatic unit conversions. Weighted-average stock valuation; no costing selector. User explicitly asked to keep this simple; the algorithm is an engineering default.
- Material consumption is the material expense in incurred-cost reports. Procurement totals and stock value are shown separately. Never add purchases and consumption together as cost. This is a management-report convention to validate with the client, not statutory accounting advice.
- Approved progress claims are the management measure of earned revenue. Contract value is a ceiling/reference; receipts are cash. Report labels do not claim audited profit.
- No automatic overtime, absence, prorating, insurance, tax, retention or statutory payroll. Monthly/fixed earnings are manually approved amounts with a period/milestone description.
- Toman amounts are whole integers; quantities have up to three decimal places. Server uses decimal arithmetic and explicit half-up rounding to one toman. No JavaScript floating-point money calculations.
- Access JWT 15 minutes; rotating opaque refresh token up to 7 days absolute. Database session validation supports immediate online revocation. No cached offline workspace.
- Draft attachments: JPG, PNG, WebP or PDF, up to 10 MB each and five per record. Limits are configurable; evidence optional unless a particular workflow specifies it.
- Daily backups, initial recovery targets RPO 24 hours/RTO 4 hours, verified before production and subject to selected hosting plan.
- CSV and print-friendly reports in V1. No Excel import, bank integrations, native mobile app, OCR or advanced accounting package.

## Dependencies that remain before production

- Client validation of sample forms, cost/revenue conventions and contract/claim behavior. Architecture planning can proceed meanwhile.
- Final hosting account, preview database and private object-storage provider. No subscription purchase or deployment was performed.
- Actual company name, initial superuser provisioning, domain, opening balances and historical migration policy.
- Pin library/runtime versions after compatibility checks. Choose hosting resources through the five-user load test, not guessed instance sizes.
- Test on actual Android devices and at least one iOS browser. Saving requires connectivity and visible server confirmation.
