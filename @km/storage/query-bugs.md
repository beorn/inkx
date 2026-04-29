---
id: "@km/storage/query-bugs"
aliases:
  - km-storage.query-bugs
  - km-storage-query-bugs
created_by: claude:c9beade3
created_at: 2026-03-13T06:23:00Z
closed_at: 2026-03-13T07:09:34Z
close_reason: "Fixed in Pro Review Round 1: recursive CTE delete, link
  disambiguation, section-scoped resolution, rename target scoping, cache
  invalidation on mutations, phrase search, negated ref scoping, compaction
  dependency preservation. All with TDD (31 new tests)."
---

# [x] Query executor: quoted phrases ignored, negated ref filters inspect whole JSON blob @km/storage #bug #P0 @claude:c9beade3

Two P0 query bugs: (1) Parser populates ast.phrases but executeQuery() never uses them — quoted searches silently drop phrase filter. (2) Negated @mention/#tag/+project uses json_extract(data,'$') NOT LIKE instead of checking specific array path — -@alice excludes nodes with 'alice' anywhere in data.