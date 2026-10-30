## Summary

Persist project expense drafts and independent partial payments, with server-authoritative posting, reasoned reversals, contract amendments, submitted claims and separate approval decisions, and owner receipts/advances. Add private finance evidence and a shared company/project management report.

```text
Persian dossier / company overview
  -> account-scoped IndexedDB drafts, immutable actions and binary queue
  -> validated authenticated commands
  -> PostgreSQL transaction: receipt + version/dependency locks + audit + change feed
  -> finalized M2/M3/M4 projection -> balances, Jalali charts, source rows, CSV/print
```

## Evidence

- **Before:** FIN02 existed only as a preliminary in-memory totals helper; no persisted expense posting workflow.
  **After:** PostgreSQL verification asserts 10,000 incurred minus 4,000 paid equals 6,000 payable, with one cash effect and no duplicated expense. It also checks immutable retries, changed-body conflicts, concurrent posting, dependency reversal, reversal replay, FIN03/04, filtered reconciliation and a multi-month budget overrun.
- Private local S3 verification checks signed upload, verified completion and replay, private download and denial of unsigned object access. Built-browser M4 coverage saves a draft and image offline, reloads, loses the completion reply, recovers, posts a partial payment and checks 360 px overflow.
- Evidence: [implementation notes](https://github.com/alisohdev/sazeh/blob/alirezasoh/codex-m4-project-finances/docs/M4_IMPLEMENTATION.md), [synthetic reconciliation](https://github.com/alisohdev/sazeh/blob/alirezasoh/codex-m4-project-finances/output/m4/reconciliation.json), [CSV](https://github.com/alisohdev/sazeh/blob/alirezasoh/codex-m4-project-finances/output/m4/statement.csv), [mobile screenshot](https://github.com/alisohdev/sazeh/blob/alirezasoh/codex-m4-project-finances/output/playwright/m4/fin02-360.png), [verification log](https://github.com/alisohdev/sazeh/blob/alirezasoh/codex-m4-project-finances/output/m4/followup-verify.log).
- `pnpm verify:m0` passed: lint, typecheck, formatting, repeated migration/seed, bootstrap, build, storage, M1?M2 API integration, M3, M4, and all **20 browser tests (4.0m)**. The retained preliminary totals tests also pass (2/2).

## Merge Danger

**Door:** two-way for application code; additive migrations retain financial history and must not be dropped as an application rollback.

**Blast Radius:** financial

Changes affect shared sync authentication and account departure counts/exports in addition to finance. All new React components stay within 200 lines. Existing M1-M3 regression tests are retained. Draft only; no merge or deployment.

Evidence is local and synthetic. Actual-phone, preview/production hosting, client terminology acceptance and recovery of production backups remain release work. Attachment controls now cover finance, workforce, procurement, and project parents, including their offline drafts.

## Review follow-up

Addresses all four findings against `1fde190`: shared authentication pause and rejection handling in finance sync; project/category budget matching; editable local finance drafts with immutable attempted commands, newer edit revisions, and explicit conflict resolution; typed private attachment parents for workforce payments, procurement invoices and project contracts. Includes a backward-compatible target backfill, pending-evidence finalization checks, and pending binary work in account departure counts.

New browser regressions cover expired sessions with multiple queued commands, local editing/reload, lost acknowledgment plus a newer edit, explicit stale-version revise/accept-server choices, and offline project evidence with account switching. Existing M2/M3 browser flows now capture and recover their own offline evidence before posting. Expanded PostgreSQL/storage coverage checks all attachment target types, invalid parents, invalid sessions and two projects sharing one budget category.

Follow-up validation: `pnpm verify:m0` passed in full, including all 20 browser tests (4.0 minutes). The 360 px conflict, workforce evidence, and procurement evidence screenshots were inspected. Evidence is committed under `output/playwright/m4/`; the complete current gate log is `output/m4/followup-verify.log`.
