# Repository guidance

## Frontend architecture

- Keep every React component file at or below 200 lines. Split larger views into focused components; screen components should compose smaller views rather than own an entire workflow.
- Separate presentation from business logic: components render props and dispatch user intent; keep API access in repositories, async state in query hooks, and domain rules in focused helpers or services.
- Use TanStack Query for server-backed asynchronous state. Saves require server confirmation. Do not add persistent browser data caches, offline drafts, outboxes or background mutation replay. Financial drafts are stored on the server and finalized explicitly.
- Keep component state small. Do not use `useState` as a server-data cache. Use it for isolated, short-lived presentation choices; group related workflow transitions in a reducer and move orchestration into hooks. More than two related state values in one component is a signal to consolidate them or extract a hook/component.
- Use shadcn/ui components and Tailwind utilities for new or substantially changed frontend screens. Keep shared colors and surfaces on semantic theme tokens.
- Preserve Persian RTL behavior and verify mobile layouts at 360 px.
