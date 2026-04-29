---
id: "@km/storage/event-compaction-replay"
aliases:
  - km-storage.event-compaction-replay
  - km-storage-event-compaction-replay
created_by: claude:c9beade3
created_at: 2026-03-13T06:23:03Z
closed_at: 2026-03-13T07:09:34Z
close_reason: "Fixed in Pro Review Round 1: recursive CTE delete, link
  disambiguation, section-scoped resolution, rename target scoping, cache
  invalidation on mutations, phrase search, negated ref scoping, compaction
  dependency preservation. All with TDD (31 new tests)."
---

# [x] Event compaction can produce unreplayable events.jsonl @km/storage #bug #P1 @claude:c9beade3

identifyStaleEvents drops node_created whose id exists in DB, while keeping later update/delete events. After compaction, replaying from empty DB can fail. Fix: compact by replaying into fresh DB and re-emitting minimal valid log.