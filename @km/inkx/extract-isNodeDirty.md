---
id: "@km/inkx/extract-isNodeDirty"
aliases:
  - km-inkx.extract-isNodeDirty
  - km-inkx-extract-isNodeDirty
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:48:10Z
closed_at: 2026-02-09T13:58:12Z
---

# [x] content-phase: Extract isNodeDirty/shouldSkipRendering helper @km/inkx #task #P1

Fast-path decision in renderNodeToBuffer checks multiple flags + child position shift. Encapsulate in a well-named function like shouldSkipRendering(node) to make the main flow more readable. Deep research recommendation #6.