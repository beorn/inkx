---
id: "@km/silvery/long-lived-ag"
aliases:
  - km-silvery.long-lived-ag
  - km-silvery-long-lived-ag
created_by: Bjørn Stabell
created_at: 2026-04-09T17:37:14Z
closed_at: 2026-04-09T23:47:42Z
close_reason: Shipped. Lazy Ag creation in createApp, reused across frames. Commit f5b33b9e.
---

# [x] Long-lived Ag instance — cache pipeline state across frames @km/silvery #feature #P2 @Bjørn Stabell

Phase 0b of signals engine. Cache Ag instance on renderer across frames. Dirty set lives on the Ag. Avoids per-frame pipeline state allocation. ~1-2 days. Prerequisite for Phase 2. See design/v20-canvas/signals-engine-architecture.md.