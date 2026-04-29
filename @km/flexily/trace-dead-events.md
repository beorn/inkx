---
id: "@km/flexily/trace-dead-events"
aliases:
  - km-flexily.trace-dead-events
  - km-flexily-trace-dead-events
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:19Z
closed_at: 2026-03-13T05:43:08Z
close_reason: "Fixed: All 10 TraceEventType values are now emitted. Added
  cache_hit/cache_miss at getCachedLayout call sites in layout-zero.ts,
  measure_cache_hit/measure_cache_miss in cachedMeasure() in node-zero.ts, and
  measure_save_restore at save/restore sites in layout-zero.ts."
owner: bjorn@stabell.org
---

# [x] Bug: Trace facility promises cache/measure events it never emits @km/flexily #bug #P1
