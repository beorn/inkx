---
id: "@km/silvery/ag-canvas/tests"
aliases:
  - km-silvery.ag-canvas.tests
  - km-silvery-ag-canvas-tests
created_by: Bjørn Stabell
created_at: 2026-03-31T07:08:15Z
closed_at: 2026-03-31T07:32:35Z
close_reason: "Implemented in c4e7e807 + 312abd8: tests, delta sync, editing, mouse, scroll"
---

# [x] Canvas rendering test suite @km/silvery #task #P2

Zero tests exist for canvas rendering. Add coverage: renderCanvasOnce produces correct dimensions, text measurement (proportional vs monospace), text wrapping at constrained widths, Box padding/border content area, HiDPI scaling (2x DPR → 2x pixel buffer), clearRect on re-render, useInput key delivery, resize preserving React state.