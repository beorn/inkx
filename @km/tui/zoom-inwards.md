---
mentions:
  - km
id: "@km/tui/zoom-inwards"
aliases:
  - km-tui.zoom-inwards
  - km-tui-zoom-inwards
created_at: 2026-02-05T22:58:33Z
closed_at: 2026-02-06T07:33:53Z
---

# [x] fix: zoom_inwards zooms all the way instead of one level @km/tui #bug #P2

Pressing i (zoom_inwards) falls through to handleZoomIn which zooms directly to the cursor node. Should zoom one level closer from root toward cursor.

