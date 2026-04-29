---
id: "@km/tui/zoom-select"
aliases:
  - km-tui.zoom-select
  - km-tui-zoom-select
created_by: claude:54aefa32
created_at: 2026-02-18T00:31:16Z
closed_at: 2026-02-18T07:49:10Z
---

# [x] Zoom out (u) moves selection to parent instead of keeping current node selected @km/tui #bug #P2 @claude:5f0aee02

When zooming out with 'u', the selected node should remain selected. Currently it moves selection to the parent node. The selection should only move to parent if the current card wouldn't be visible in the new view — and even then, we could unfold its parents to keep it visible.