---
id: "@km/silvery/perf-child-pos"
aliases:
  - km-silvery.perf-child-pos
  - km-silvery-perf-child-pos
created_by: claude:c9beade3
created_at: 2026-03-13T04:31:08Z
closed_at: 2026-03-13T05:22:00Z
close_reason: "Deferred: childPositionChanged is computed per-node in content
  phase by comparing prevLayout positions. Precomputing in layout phase would
  save repeated comparisons but adds complexity to layout phase. No measured
  perf impact — only triggers when subtreeDirty."
---

# [x] Perf: Precompute childPositionChanged bit in layout phase @km/silvery #task #P3

hasChildPositionChanged(node) is O(children) and called repeatedly (node fast-path, absoluteChildMutated). Have layout phase set childPositionChangedThisFrame on parent when any child x/y changes. Found by GPT pipeline review.