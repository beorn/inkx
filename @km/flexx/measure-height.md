---
mentions:
  - km
  - claude
id: "@km/flexx/measure-height"
aliases:
  - km-flexx.measure-height
  - km-flexx-measure-height
created_at: 2026-02-05T12:28:17Z
closed_at: 2026-02-05T12:32:44Z
assignee: claude:b53ef7e4
---

# [x] fix(flexx): measure function height not constrained by parent main axis @km/flexx #bug #P2 @claude:b53ef7e4

Code review C2: Text nodes inside height=1 parent get oversized height. Measure function receives unconstrained main-axis size in layout-zero.ts. Worked around in inkx content-phase.ts.

