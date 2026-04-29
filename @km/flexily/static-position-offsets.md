---
id: "@km/flexily/static-position-offsets"
aliases:
  - km-flexily.static-position-offsets
  - km-flexily-static-position-offsets
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:11Z
closed_at: 2026-03-13T05:34:56Z
close_reason: Duplicate of km-flexily.static-position-type (P0)
owner: bjorn@stabell.org
---

# [x] POSITION_TYPE_STATIC incorrectly applies position offsets @km/flexily #bug #P2

CSS spec: position:static ignores left/right/top/bottom offsets. Only position:relative and position:absolute apply them. Flexily incorrectly applies position offsets to static nodes in both layout-zero.ts (lines 281, 1254) and the classic implementation. The condition should be 'positionType === POSITION_TYPE_RELATIVE' only, not 'POSITION_TYPE_STATIC || POSITION_TYPE_RELATIVE'. Low priority because the default positionType is RELATIVE and TUI usage never sets STATIC, but it violates the CSS spec and the Yoga API contract. No tests exist for POSITION_TYPE_STATIC. [pro]