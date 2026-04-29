---
id: "@km/inkx/param-object"
aliases:
  - km-inkx.param-object
  - km-inkx-param-object
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:47:51Z
closed_at: 2026-02-09T13:58:11Z
---

# [x] content-phase: Introduce Parameter Object for boolean params @km/inkx #task #P1

renderNormalChildren (10 params) and renderScrollContainerChildren (8 params) pass many booleans positionally. Replace with a RenderFlags interface: { hasPrevBuffer, parentRegionCleared, parentRegionChanged, ancestorCleared, childPositionChanged }. Eliminates Boolean Blindness at call sites. Deep research recommendation #1.