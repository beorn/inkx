---
mentions:
  - km
  - km
  - km
id: "@km/inbox/rmst"
aliases:
  - km-rmst
  - "@km/_orphan/rmst"
created_at: 2026-01-16T12:34:40Z
closed_at: 2026-01-16T12:47:47Z
---

# [x] Merge @km/shared into @km/tui-core @km/_orphan #task #P2

Move shared utilities (485 lines) from @km/shared into @km/tui-core.

Steps:

1. Copy src/tree.ts and src/icons.ts to @km/tui-core/src/
2. Re-export from @km/tui-core/index.ts (already re-exports icons)
3. Update all imports from @km/shared to @km/tui-core
4. Remove @km/shared package
5. Update workspace dependencies

