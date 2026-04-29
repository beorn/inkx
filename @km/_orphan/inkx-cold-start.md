---
id: "@km/_orphan/inkx-cold-start"
aliases:
  - km-inkx-cold-start
created_at: 2026-02-01T20:16:55Z
closed_at: 2026-02-04T11:24:02Z
---

# [x] First render layout is 28x slower than subsequent renders (cold start) @km/_orphan #bug #P4

First layout call takes 28ms vs 1ms for warm renders. This is due to empty caches (displayWidth, measure function, layout cache). Need to either: (1) warm caches preemptively, (2) optimize cold path, or (3) lazy-load non-critical initialization. Found via TRACE=1 perf analysis.