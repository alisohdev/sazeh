# Product requirements document

## Purpose and users

Give one construction company's managers a clear view of worker balances, supplier debts, project receipts, site materials and project costs. The same system is demonstrated with synthetic data on Vercel and later deployed with separate real data in Iran. Initial capacity is five admins plus the superuser and ten active projects; these are planning targets, not hard business limits.

Superuser has every business permission plus account administration. All admins can view, create, edit drafts, finalize and correct business records across all projects. No accountant/site-supervisor/viewer roles or multi-person approvals in V1. Every action records its actor. A worker, supplier and project owner are business contacts, not login accounts.

## Core workflows

| ID | Workflow | Acceptance outcome |
|---|---|---|
| FR01 | Account access | Superuser creates an admin with a temporary password; the admin must change it before entering the app. Only superuser manages other accounts. |
| FR02 | Projects | Create project with owner contact, dates, contract value and budgets by category; amend contract with a reason and history. Complete/archive without deleting records. |
| FR03 | Workers | Reuse a worker across projects; choose engagement type and suggested rate for each project. Each earning preserves the entered rate/quantity. |
| FR04 | Earnings | Daily/hourly/quantity entries calculate quantity × rate. Monthly, fixed-contract and manual entries use an approved amount and explanation. Finalize online. |
| FR05 | Worker balances | Record project-specific partial payments, advances and deductions. Show gross approved earnings, deductions, payments and remaining balance. Negative balances show advance/credit, not an error. |
| FR06 | Purchasing | Create suppliers and itemized invoices with quantities, units and prices. Record partial payments and outstanding debt per supplier/project. |
| FR07 | Site inventory | Receive invoice items into a project, consume them, transfer between projects and return them. Maintain non-negative stock, movement history and weighted-average valuation. |
| FR08 | Other costs | Record equipment rental, transport, subcontracting and miscellaneous costs with amount, category, payee and project. Record payment separately, including partial settlement. |
| FR09 | Owner receipts | Track contract amendments, progress claims, approved claim amounts and owner payments. Distinguish unapproved claims, approved revenue, receipts and remaining receivables. |
| FR10 | Reports | Project overview, worker statement, supplier statement, cash flow, budget vs cost, purchases, inventory and approved claims vs costs. Filter by project/date/contact as relevant. |
| FR11 | Evidence | Attach receipt images, PDFs and contracts; private access, mobile camera/gallery selection, upload status and retry. |
| FR12 | Online saving | All saves and file uploads require a server connection and confirmation. Failed requests remain visible; no browser queue or automatic replay. |
| FR13 | Corrections | Draft editing allowed; finalized records have linked corrections/reversals with reason and author. No silent deletion. |

## Simple business rules

- Each financial document has exactly one project. A transfer is one atomic operation with source and destination projects; it is not a cash payment.
- Money entered/displayed in toman; Jalali input/display, ISO date-only business dates internally. Audit timestamps use UTC; display in Asia/Tehran.
- No automatic salary-proration engine. Managers approve partial-month and milestone amounts themselves. Rates are defaults for new entries, never live formulas changing history.
- A deduction reduces a worker's approved earnings and net labor cost. It is not another cash payment. Repaying an advance is already handled by the advance payment in the balance; never deduct it again.
- Advances are permitted. Supplier and owner overpayments are visibly credits/advances. They do not create extra expenses or revenue.
- Purchase invoices create supplier liability. Receiving creates stock. Consumption creates material cost. Payment settles liability. These events must not double-count one another.
- A purchase form can offer “receive all now” as a convenience, creating linked invoice and receipt atomically. Separate partial deliveries remain supported.
- Approved claims determine management earned-revenue reporting; paid receipts determine cash flow. Contract value alone is never earned revenue.
- All finalized operations are server-authoritative. Reports identify their server timestamp and separate pending server drafts from finalized amounts.

## Screens and mobile behavior

1. Login, first-password change, own-password change; superuser account management.
2. Project list: project cards, search and modal creation. Financial analytics have a separate page.
3. Project detail with overview, workers, purchases, stock, expenses, claims/receipts and files.
4. Worker and supplier directories; contact statements with project/date filters.
5. Short forms for earning, payment, deduction, invoice, receipt, consumption, transfer and return. Use expandable detail rather than wide desktop-only forms.
6. Reports with readable mobile cards, drill-down entries, CSV and print layouts.
7. Dedicated analytics page with project/date filters, charts, CSV and print.
8. Audit history on each finalized record.

Use clear Persian labels for server saving, errors, drafts and finalization. A save is successful only after server acknowledgment. Navigation works at 360 px with no page-wide horizontal overflow.

## Online data lifecycle

Authentication, reads, saves and attachment uploads require a server connection. No offline storage, outbox, service-worker application cache or background synchronization is supported. Unsaved form content is temporary and disappears when leaving or reloading the page. Server financial drafts remain editable until explicit finalization.

Financial completion requires pending-draft, stock and balance checks, implemented with the source modules. M1b supports active -> archived -> active only, with required archive/reopen reasons. Archive hides default active lists and does not certify financial completion. Archiving projects/contacts preserves history and existing assignments; block new assignments to archived records. Engagement periods for the same worker/project cannot overlap (inclusive ends, empty end ongoing); workers may span projects. M1b budget categories are editable labels. Materials arrive in M3; earnings/calculations in M2.

Financial charts use authoritative server source data. Synthetic demos must not invent financial metrics.

## Success and nonfunctional acceptance

- All numeric fixtures in specs/ACCEPTANCE.md reconcile exactly with underlying finalized records.
- Five concurrent admin sessions and ten active projects complete entry/reporting without duplicate effects or lost updates.
- A failed save shows an error and retains the current form. Reconnecting or reloading never replays an unsaved request.
- Proposed performance gate: warmed API p95 under 1 second for ordinary list/write actions and under 3 seconds for reports at the documented test dataset, excluding uploads and external network latency. Record cold starts and actual-device timings separately.
- Authentication checks apply to every protected endpoint. Account disabling revokes online access, including all reads and writes.
- Backup restoration, migration rehearsal, attachment access checks, error visibility and user acceptance are production release gates.

## Exclusions

No multi-company SaaS, worker login, statutory accounting/tax filing, automatic payroll deductions, native mobile apps, offline data entry, automated OCR, bank/payment-gateway integration, cheque management, procurement approvals, central warehouse, multi-currency or automatic unit conversion. These exclusions keep the selected workflows understandable; they do not waive reliability requirements.
