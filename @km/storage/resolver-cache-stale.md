---
id: "@km/storage/resolver-cache-stale"
aliases:
  - km-storage.resolver-cache-stale
  - km-storage-resolver-cache-stale
created_by: claude:c9beade3
created_at: 2026-03-13T06:23:02Z
closed_at: 2026-03-13T07:09:34Z
close_reason: "Fixed in Pro Review Round 1: recursive CTE delete, link
  disambiguation, section-scoped resolution, rename target scoping, cache
  invalidation on mutations, phrase search, negated ref scoping, compaction
  dependency preservation. All with TDD (31 new tests)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Resolver caches never invalidated on normal mutations @km/storage #bug #P0 @claude:c9beade3

clearNameIndex()/clearResolveCache() only called in expandDirectory(), not after updateNode/moveNode/deleteNode/addNode. resolveByName()/resolveNode() can return deleted nodes, old names, or miss new nodes until manual cache clear.