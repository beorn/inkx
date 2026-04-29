---
id: "@km/tui/embed-render-types"
aliases:
  - km-tui.embed-render-types
  - km-tui-embed-render-types
created_by: claude:a5c7f7de
created_at: 2026-02-15T09:26:22Z
closed_at: 2026-02-15T22:11:39Z
---

# [x] Embedded nodes: distinguish outline items vs body blocks for rendering @km/tui #task #P2

Current embed rendering treats all embedded nodes the same way. But we need to distinguish between:
- Outline items (oi/li) — should render as cards/nodes (task items, sections)
- Body blocks (p, h, code, quote, etc.) — should render as inline content blocks
Example: embedded blocks in @next#inbox should render as blocks, not as outline items.
This is a design decision — needs discussion about the rendering model for different node types when embedded.