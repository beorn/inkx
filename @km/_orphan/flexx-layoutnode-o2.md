---
id: "@km/_orphan/flexx-layoutnode-o2"
aliases:
  - km-flexx-layoutnode-o2
created_at: 2026-01-30T17:17:30Z
closed_at: 2026-01-30T17:49:24Z
---

# [x] Investigate Flexx O(n²) recursive layoutNode calls @km/_orphan #bug #P1 @claude:b8b4780b

Even with measure caching, Flexx layout may still be slow due to recursive layoutNode structure.

The layout algorithm calls layoutNode() recursively in multiple places:
- Line 665: For intrinsic sizing of auto-sized children with children  
- Line 860: For baseline calculation
- Line 1225: For final positioning

Each recursive call goes through the entire subtree. With 1629 nodes, this can cause O(n²) behavior.

Measure caching reduces the cost per call, but doesn't reduce the number of layoutNode calls. Need to investigate:
1. Whether Yoga has similar recursion patterns
2. If layout results can be cached like measure results
3. If algorithm can be restructured to single-pass or smarter multi-pass

LLM analysis (Gemini) suggested this would be a major architectural change with high risk. The measure caching is the pragmatic fix; this is the 'proper' fix if still needed.