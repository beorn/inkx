---
mentions:
  - km
  - claude
id: "@km/storage/link-resolution-bugs"
aliases:
  - km-storage.link-resolution-bugs
  - km-storage-link-resolution-bugs
created_by: claude:c9beade3
created_at: 2026-03-13T06:22:59Z
closed_at: 2026-03-13T07:09:34Z
close_reason: "Fixed in Pro Review Round 1: recursive CTE delete, link
  disambiguation, section-scoped resolution, rename target scoping, cache
  invalidation on mutations, phrase search, negated ref scoping, compaction
  dependency preservation. All with TDD (31 new tests)."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Wikilink resolution: name collisions, over-broad section updates, rename corruption @km/storage #bug #P0 @claude:c9beade3

Three P0 link resolution bugs: (1) createLinkResolver Map silently overwrites on duplicate names, findFileByName LIMIT 1 with no ambiguity. (2) resolveLinks WHERE clause too broad — [[doc#A]] and [[doc#B]] can both resolve to same target. (3) renameNode updates ALL links matching old name, not just those with target_id of renamed node.

