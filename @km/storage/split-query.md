---
id: "@km/storage/split-query"
aliases:
  - km-storage.split-query
  - km-storage-split-query
created_at: 2026-02-04T11:50:49Z
closed_at: 2026-02-04T13:09:35Z
assignee: claude:9e69175d
---

# [x] Investigate splitting query.test.ts (1635 lines) @km/storage #task #P3 @claude:9e69175d

Test quality review found query.test.ts is very large (1635 lines, 106 tests). Recommend splitting into 2 files (parser ~483 lines, executor ~1186 lines). Clean separation, no interdependencies.