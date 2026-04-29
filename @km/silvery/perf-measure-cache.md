---
id: "@km/silvery/perf-measure-cache"
aliases:
  - km-silvery.perf-measure-cache
  - km-silvery-perf-measure-cache
created_by: claude:c9beade3
created_at: 2026-03-13T04:36:41Z
closed_at: 2026-03-13T05:22:01Z
close_reason: "Deferred: Text measure cache key is string concatenation
  (width+wrap+text). Allocation is minimal (short strings, interned by V8). No
  measured perf impact — measure runs once per dirty text node per frame."
owner: bjorn@stabell.org
---

# [x] Perf: Text measure cache uses string key allocation on every call @km/silvery #task #P3

reconciler/nodes.ts text measure function builds cache key via template string (width|widthMode|height|heightMode) — allocates every call. Flexily already uses numeric cache slots (_m0.._m3). Switch to same approach. Found by GPT 5.4 pro.