---
mentions:
  - km
id: "@km/flexily/dead-code-resolve-edge-calls"
aliases:
  - km-flexily.dead-code-resolve-edge-calls
  - km-flexily-dead-code-resolve-edge-calls
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:34Z
closed_at: 2026-03-13T05:34:57Z
close_reason: Duplicate of km-flexily.dead-stats (P2)
owner: bjorn@stabell.org
---

# [x] resolveEdgeCalls counter is never incremented in zero implementation @km/flexily #task #P4

layout-stats.ts exports resolveEdgeCalls and it's re-exported through index.ts, but there is no incResolveEdgeCalls() function and no code increments it. It's always 0 in the zero implementation. Either add the increment calls where edges are resolved (layout-helpers.ts resolveEdgeValue/resolveEdgeBorderValue) or remove the dead counter. The classic implementation also has it as dead code. [pro]

