---
mentions:
  - km
  - km
  - km
id: "@km/inbox/yq5o"
aliases:
  - km-yq5o
  - "@km/_orphan/yq5o"
created_at: 2026-01-16T12:34:22Z
closed_at: 2026-01-16T12:36:20Z
---

# [x] Merge @km/query into @km/core @km/_orphan #task #P2

Move query parser (437 lines) from @km/query into @km/core.

Steps:

1. Copy src/parser.ts and src/date.ts to @km/core
2. Re-export from @km/core/index.ts
3. Update @km/store to import from @km/core instead
4. Remove @km/query package
5. Update workspace dependencies

