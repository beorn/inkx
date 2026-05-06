---
mentions:
  - km
id: "@km/fast-md/0-content-hash-caching-skip-re-parsing-unchanged-fil"
aliases:
  - km-fast-md.0
  - km-fast-md-0
  - "@km/fast-md/0"
created_at: 2026-01-23T15:25:58Z
closed_at: 2026-01-23T21:42:00Z
---

# [x] Content hash caching - skip re-parsing unchanged files @km/fast-md #task #P1

Check mtime first, then content hash. Cache parsed nodes+wikilinks. Biggest impact - makes repeat loads near-instant.

