---
id: "@km/flexx/dead-code"
aliases:
  - km-flexx.dead-code
  - km-flexx-dead-code
created_at: 2026-02-05T12:28:18Z
closed_at: 2026-02-05T12:31:23Z
assignee: claude:b53ef7e4
---

# [x] refactor(flexx): remove dead effectiveMainSize branches @km/flexx #task #P3 @claude:b53ef7e4

Code review I3: Three identical branches assign effectiveMainSize = childMainSize in layout-zero.ts ~2182-2190. Simplify to const.