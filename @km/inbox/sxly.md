---
mentions:
  - km
  - km
  - km
id: "@km/inbox/sxly"
aliases:
  - km-sxly
  - "@km/_orphan/sxly"
created_at: 2026-01-16T12:34:26Z
closed_at: 2026-01-16T12:39:47Z
---

# [x] Merge @km/watch into @km/store @km/_orphan #task #P2

Move file watching code (1,604 lines) from @km/watch into @km/store.

Steps:

1. Copy src/*.ts files to @km/store/src/watch/
2. Re-export from @km/store/index.ts
3. Update apps/@km/_orphan/cli imports
4. Remove @km/watch package
5. Update workspace dependencies

