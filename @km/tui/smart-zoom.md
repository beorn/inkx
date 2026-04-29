---
id: "@km/tui/smart-zoom"
aliases:
  - km-tui.smart-zoom
  - km-tui-smart-zoom
created_by: claude:36393b5d
created_at: 2026-02-18T23:43:09Z
closed_at: 2026-02-19T06:57:54Z
---

# [x] Structure-aware ancestor walking in findZoomTarget @km/tui #task #P2

O3 recommendation: Instead of always zooming to grandparent, walk up ancestors checking each candidate: does this node have oi children? Stop at the lowest ancestor yielding a multi-column layout (>=2 columns). Fall back to single-column only if no ancestor provides multiple columns. This makes the board adapt to data shape — avoids landing on a flat 117-item Description column when a higher ancestor would give meaningful columns.