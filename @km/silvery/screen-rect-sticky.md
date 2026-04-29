---
id: "@km/silvery/screen-rect-sticky"
aliases:
  - km-silvery.screen-rect-sticky
  - km-silvery-screen-rect-sticky
created_by: claude:c9beade3
created_at: 2026-03-13T05:01:18Z
closed_at: 2026-03-13T05:26:38Z
close_reason: "Fixed: Added renderRect/prevRenderRect to TeaNode,
  computeStickyRenderRects() in layout-phase.ts,
  useRenderRect/useRenderRectCallback hooks exported"
---

# [x] screenRect doesn't account for sticky render offsets — need renderRect @km/silvery #task #P2

screenRectPhase() only subtracts ancestor scroll offsets, not sticky renderOffset. For sticky children, screenRect is natural position not actual rendered position. Either document this or add renderRect/paintRect.