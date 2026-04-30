---
id: "@km/inbox/flexx-wraprev"
aliases:
  - km-flexx-wraprev
  - "@km/_orphan/flexx-wraprev"
created_at: 2026-01-30T15:25:16Z
closed_at: 2026-01-30T18:29:15Z
---

# [x] [flexx] Fix wrap-reverse cross-axis positioning @km/_orphan #bug #P2

## Summary
Line order is reversed correctly, but cross-axis positioning is computed from top-down instead of bottom-up.

## Failing Test (1)
- wrap-reverse: Line 1 should be at top=80, line 2 at top=60 → actual top=20,0

## Fix
After reversing lines, compute lineCrossOffsets starting from crossAxisSize - lineCrossSize and working backwards.

## Complexity
Low