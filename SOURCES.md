# Official sources

Reviewed 28 October 2026. These sources establish platform/browser capabilities, not client requirements or hosting purchases. Recheck version-specific details during implementation.

- S1: Vercel, NestJS deployment: https://vercel.com/docs/frameworks/backend/nestjs — documents deployment of a NestJS application through Vercel Functions. Validate current platform limits and adapter compatibility during M0.
- S2: Liara, NodeJS platform: https://docs.liara.ir/paas/nodejs/getting-started/ — documents NodeJS deployment and links PostgreSQL/Drizzle/NestJS integration. Exact service plan remains unselected.
- S3: MDN, Background Synchronization API: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API — browser support is limited; foreground/reopen synchronization is the required fallback.
- S4: MDN, Storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — browser quotas/eviction constrain local persistence; a local queue is not a guaranteed backup.
- S5: Liara, Object storage: https://docs.liara.ir/object-storage/about/ — documents S3 compatibility, supporting a portable private attachment adapter.

The technical source evidence does not guarantee connectivity, performance, account availability, budget or residency of an unselected preview service. Those are verified in the deployment gate.
