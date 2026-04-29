---
id: "@km/silvery/ag-canvas/mouse-input"
aliases:
  - km-silvery.ag-canvas.mouse-input
  - km-silvery-ag-canvas-mouse-input
created_by: Bjørn Stabell
created_at: 2026-03-31T07:08:04Z
closed_at: 2026-03-31T07:32:38Z
close_reason: "Implemented in c4e7e807 + 312abd8: tests, delta sync, editing, mouse, scroll"
owner: bjorn@stabell.org
---

# [x] Mouse input for canvas (click, scroll, drag) @km/silvery #feature #P3

Add mouse event handling to the canvas renderer. Click → hit test ag tree to find clicked node → dispatch selection. Scroll → viewport scroll or virtual scroll. Drag → card reordering. Requires: hit testing from ag tree screenRect, mouse event conversion in canvas/input.ts, click-to-select in BoardView.