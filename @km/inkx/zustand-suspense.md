---
id: "@km/inkx/zustand-suspense"
aliases:
  - km-inkx.zustand-suspense
  - km-inkx-zustand-suspense
created_by: claude:97b8de73
created_at: 2026-02-23T02:04:49Z
closed_at: 2026-02-23T07:44:49Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Ergonomic Zustand + Suspense pattern for sync/async data loading @km/inkx #task #P3 @claude:97b8de73

Figure out an ergonomic and safe way to combine Zustand external store with React Suspense for showing loading state during heavy synchronous computation (e.g., zoom deriveColumnsFromRepo on 300k nodes) and async data fetching. Key challenges: (1) Zustand set() mutates immediately — no 'old state' to show during transitions, (2) useColumns runs inside render (hooks unconditional) so deferring rootId doesn't defer the computation, (3) createSuspenseLoader exists but only used for simple cases (ProjectPicker). Need a pattern that works for store-driven state changes where the heavy work is in a useMemo. Consider startTransition, useDeferredValue, and whether the loader should compute columns or just defer the rootId change.