---
id: "@km/silvery/ag-canvas/npm-package"
aliases:
  - km-silvery.ag-canvas.npm-package
  - km-silvery-ag-canvas-npm-package
created_by: Bjørn Stabell
created_at: 2026-03-31T07:08:40Z
---

# [ ] Ship @silvery/canvas as standalone npm package @km/silvery #feature #P4

Extract the canvas rendering code into a standalone @silvery/ag-exp-canvas package. Currently lives in ag-react/src/ui/canvas/ and ag-term/src/adapters/canvas-adapter.ts. Needs: own package.json, independent tests, public API surface (renderToCanvas, CanvasInstance, CanvasRenderOptions), docs on silvery.dev. Aligns with era2a composability: @silvery/ag-exp-canvas in the framework×platform matrix.