---
id: "@km/tui/u-zoom-out"
aliases:
  - km-tui.u-zoom-out
  - km-tui-u-zoom-out
created_by: claude:a5c7f7de
created_at: 2026-02-14T23:34:47Z
closed_at: 2026-02-15T09:07:10Z
---

# [x] u key: zoom out to parent (keep cursor), at repo root move cursor to parent @km/tui #feature #P2

When pressing 'u':
- Board root moves to parent (zoom out one level)
- Cursor stays on the same node as much as possible
- If board root is already the repo root, cursor moves to parent instead

Currently 'u' is mapped to HISTORY_UNDO. This feature would remap 'u' to zoom-out behavior. Undo would need a different binding.