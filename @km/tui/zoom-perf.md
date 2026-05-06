---
mentions:
  - km
id: "@km/tui/zoom-perf"
aliases:
  - km-tui.zoom-perf
  - km-tui-zoom-perf
created_by: claude:d3a7049b
created_at: 2026-02-22T08:24:31Z
closed_at: 2026-02-22T23:17:55Z
owner: bjorn@stabell.org
---

# [x] Optimize zoom so there are no freezes @km/tui #task #P3

Zooming in/out is too sluggish on large vaults (11K files). Current fixes: batch preload, aggressive folding >20 cols, deferred fold via setTimeout(0), layout cache, adaptive preload depth. Still blocks for several seconds on large boards. Needs: async SQLite queries (Worker), progressive rendering, or chunked processing to eliminate all freezes.

