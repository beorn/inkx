---
id: "@km/inbox/cxe3g"
aliases:
  - km-cxe3g
  - "@km/_orphan/cxe3g"
created_by: claude:ee8efc0f
created_at: 2026-02-23T12:30:39Z
closed_at: 2026-02-23T13:07:16Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Enable examples to render directly on the web page @km/_orphan #feature #P2 @claude:ee8efc0f

inkx examples should be renderable directly on the VitePress docs site, showing three render targets side by side: Canvas 2D, DOM, and terminal (via xterm.js). This demonstrates inkx's pluggable RenderAdapter architecture — the same React components render to any target. Each example page should show a live interactive demo with tabs for Canvas, DOM, and Terminal views.