---
id: "@km/_orphan/flexx-measure-phase"
aliases:
  - km-flexx-measure-phase
created_at: 2026-01-30T17:49:01Z
closed_at: 2026-01-30T21:02:35Z
assignee: claude:b8b4780b
---

# [x] [flexx] Separate measure from layout phase @km/_orphan #feature #P1 @claude:b8b4780b

## Summary
Introduce a measureNode() function that computes size without positions. Currently layoutNode() is called 3 times per node in worst case (intrinsic sizing, baseline, final layout), causing O(n²) behavior.

## Implementation
1. Create measureNode(node, width, wm, height, hm) -> {w, h, baseline?}
2. Replace line 677 (intrinsic sizing) call with measureNode
3. Replace line 872 (baseline) call with measureNode  
4. Keep line 1238 for actual layout with positioning

## Expected Impact
Should reduce layout calls from 3x to 1x per node in common cases.

## References
- Yoga and Taffy both separate measure from layout phases
- GPT-5.2 analysis identified this as highest-impact optimization