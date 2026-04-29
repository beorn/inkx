---
id: "@km/silvery/ag-canvas/virtual-scroll"
aliases:
  - km-silvery.ag-canvas.virtual-scroll
  - km-silvery-ag-canvas-virtual-scroll
created_by: Bjørn Stabell
created_at: 2026-03-31T06:56:25Z
closed_at: 2026-03-31T07:32:39Z
close_reason: "Implemented in c4e7e807 + 312abd8: tests, delta sync, editing, mouse, scroll"
---

# [x] Canvas virtual scrolling @km/silvery #feature #P3

Implement virtual scrolling in the canvas renderer so only visible content is rendered. Currently the full canvas is rendered at full height and CSS overflow:scroll handles viewport clipping. True virtual scrolling would render only visible rows based on scroll offset, enabling much larger boards without performance degradation. Requires scroll offset support in the silvery render pipeline (ag-term canvas adapter).