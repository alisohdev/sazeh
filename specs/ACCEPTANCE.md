# Acceptance and verification specification

All fixtures are synthetic. Amounts below are toman. Run calculation tests without network, posting tests against real PostgreSQL, and browser tests against a built application. Passing mocks alone is not a production gate.

| Test | Scenario | Required result |
|---|---|---|
| AUTH01 | Admin calls account-create/reset/disable endpoints | 403; no account mutation, regardless of hidden UI buttons. |
| AUTH02 | Temporary-password login | Only password change/logout accessible until changed; old temporary password unusable afterward. |
| AUTH03 | Disable admin with unexpired JWT | Next protected request/sync rejected; session revoked. Disconnected cache limitation documented. |
| AUTH04 | Refresh token replay, wrong audience, expired JWT | Rejected, no renewed access; replay revokes family. |
| LAB01 | 3 days × 1,000,000; deduction 200,000; advance 500,000; later payment 1,000,000 | Earnings 3,000,000; net cost 2,800,000; cash paid 1,500,000; worker balance 1,300,000. |
| LAB02 | Same worker earns 400,000 in project B | Project A balance unchanged; separate B statement. |
| LAB03 | Rate later becomes 1,200,000 | LAB01 remains 3,000,000 gross. New entries use new default only. |
| LAB04 | Monthly partial period manually approved at 5,000,000 | Exactly 5,000,000, no automatic absence/proration rules. |
| STOCK01 | Receive 100 units @200 then 100 @300; consume 50 | Quantity 150; stock value 37,500; consumed cost 12,500; average 250. |
| STOCK02 | Transfer 20 of remaining units A -> B | A 130/32,500; B 20/5,000; no company cash/cost created by transfer. |
| STOCK03 | Return 10 units from STOCK01 consumption | Restore 10 units/value 2,500 to A; net consumption cost becomes 10,000. |
| STOCK04 | Two admins each issue 80 when stock is 100 | One may succeed; the other conflicts; final stock never negative. |
| STOCK05 | Supplier return 10 units bought @200, current average 250 | Stock decreases 10/value 2,500; supplier credit 2,000; visible 500 valuation loss adjustment. |
| FIN01 | Invoice 50,000; payment 20,000; fully received but not consumed | Supplier debt 30,000; procurement 50,000; stock 50,000; material consumption cost 0; cash out 20,000. |
| FIN02 | Expense 10,000; pay 4,000 | Expense cost 10,000; payable 6,000; cash out 4,000. |
| FIN03 | Contract 100m + amendment 20m; approved claim 30m; owner pays 20m; incurred cost 18m | Revised contract 120m; receivable 10m; management earned margin 12m; receipt 20m. Contract remainder is not revenue. |
| FIN04 | Owner pays 40m against claims 30m | Receivable -10m displayed as advance/credit; no extra 10m earned revenue. |
| COR01 | Reverse finalized deduction with reason | Original retained, linked inverse recorded, balance/cost recomputed once. |
| COR02 | Reverse invoice with allocated payment/dependent receipt | Reject with named dependencies; no partial reversal or corrupted totals. |
| SYNC01 | Save offline, refresh/reopen same installed origin | Draft and outbox remain, clearly local; server balances unchanged. |
| SYNC02 | Server commits command but reply is lost; retry 10 times | One draft/effect, same entity identity/result. |
| SYNC03 | Same command ID with changed body | 409, no additional effect. |
| SYNC04 | Two offline edits to same version | One accepted; other reviewed conflict; no silent overwrite. |
| SYNC05 | Offline draft plus parent/new worker and attachment | Parent syncs before child; binary retries independently; no duplicates. |
| SYNC06 | One invalid command in batch | Valid independent commands acknowledged; invalid entry stays visible with field errors. |
| SYNC07 | Token expires while offline | Draft capture continues in cached workspace; sync waits for authentication, no credential persistence. |
| SYNC08 | Global revisions under concurrent commits and paginated pulls | No missed committed changes; tombstones applied; rebuild preserves unsynced work. |
| SYNC09 | App/service-worker/schema update with pending queue | Queue remains usable or safely held for upgrade; never discarded. |
| FILE01 | Upload succeeds but completion reply lost | Retry completion links one verified attachment. |
| FILE02 | Unauthenticated/disabled user requests attachment | Denied; bucket objects not publicly readable. |
| LOCAL01 | Toman large values, fractional quantities, Persian digits | Exact server arithmetic and documented rounding; no float drift. |
| LOCAL02 | Jalali month/year boundaries and Tehran dates | Business date round-trip unchanged; audit timestamp shown separately. |
| MOBILE01 | 360 px Android viewport and actual phone | All forms usable, focus visible, no page-wide overflow, tap targets adequate. |
| OPS01 | Restore DB + referenced files to clean environment | Sample statements, attachments and finalized totals match backup. |

## Report reconciliation

For every report, aggregate only applicable finalized effects, incorporate reversals once and reconcile to drill-down rows. Ensure project/date/contact filters also apply to exports. Statement opening balance is all prior applicable effects; period activity plus opening equals closing. Cash vs cost uses distinct sources. Pending local and server drafts never enter final totals.

Stock valuation order is server posting order, while business-date filters can show backdated records. Label the distinction and test it. Historical stock reports must use posting sequence/as-of timestamp to reproduce carrying value, not sort by arbitrary client dates.

## Load and deployment gates

Proposed fixture: 10 active projects, 100 workers, 30 suppliers, 100 material types, 10,000 business documents and 1,000 attachment metadata entries. Run five active sessions with mixed reads, draft edits, finalizations and sync retries for at least 10 minutes. Verify no duplicate effects, deadlock data loss or pool exhaustion. Record hardware, network, dataset and p50/p95 results; adjust fixture with actual client usage.

Run local complete workflow, Vercel preview login/cookie/rewrite/persistence/upload workflow, then Iran-hosting rehearsal. At least one actual-device offline test must disable connectivity, restart the PWA, create drafts, restore connectivity and verify server data. Browser support targets: current Chrome/Edge desktop and Android Chrome; Safari/iOS basic app/offline behavior tested separately without promising background sync.

Go-live requires approved client sample reports, passed critical tests, tested backup restore, configured monitoring, safe migration procedure and no unresolved data-loss/security defects. No fixed schedule is committed by this specification.
