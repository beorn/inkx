---
mentions:
  - km
  - claude
id: "@km/inkx/narrative-order"
aliases:
  - km-inkx.narrative-order
  - km-inkx-narrative-order
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:47:59Z
closed_at: 2026-02-09T14:01:50Z
owner: bjorn@stabell.org
assignee: claude:dffe6eeb
---

# [x] content-phase: Reorder functions for narrative flow (top-down) @km/inkx #task #P1 @claude:dffe6eeb

Move helpers (findInheritedBg, hasChildPositionChanged, computeChildClipBounds) below main rendering functions. Present architecture top-down: contentPhase → renderNodeToBuffer → renderNormalChildren/renderScrollContainerChildren → helpers at bottom. Deep research recommendation #2.

