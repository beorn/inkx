---
id: "@km/silvery/perf-inherited-cache"
aliases:
  - km-silvery.perf-inherited-cache
  - km-silvery-perf-inherited-cache
created_by: claude:c9beade3
created_at: 2026-03-13T04:31:07Z
closed_at: 2026-03-13T05:22:24Z
close_reason: "Deferred: findInheritedBg walks ancestors ~6-8 times per node at
  clearing/region sites. Already cached for text rendering (boxInheritedBg
  passed down). Remaining calls are in clearNodeRegion, clearExcessArea,
  fillRegionWithColor — would need inheritedBg threaded through all helper
  functions. Non-trivial refactor, no measured bottleneck."
owner: bjorn@stabell.org
---

# [x] Perf: Cache findInheritedBg/Fg during traversal instead of repeated ancestor walks @km/silvery #task #P2

findInheritedBg()/findInheritedFg() called per rendered node, often multiple times (clearNodeRegion, renderText, renderBox, scroll clear, overflow clear). O(depth) each call. Thread inherited bg/fg/colored-ancestor-rect through NodeRenderState or traversal context. Would also reduce correctness risk. Found by GPT pipeline review.