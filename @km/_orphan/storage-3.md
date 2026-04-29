---
id: "@km/_orphan/storage-3"
aliases:
  - km-storage-3
created_at: 2026-01-20T10:32:30Z
closed_at: 2026-02-14T08:52:47Z
assignee: claude:124bfbe5
---

# [x] Split db-queries.ts into focused modules @km/_orphan #task #P3 @claude:124bfbe5

packages/@km/storage/src/db-queries.ts is 800 lines with 27+ functions mixing node queries, task queries, search, and converters. Split into db-queries.ts, db-search.ts, db-tasks.ts.