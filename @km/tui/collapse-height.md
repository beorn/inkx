---
id: "@km/tui/collapse-height"
aliases:
  - km-tui.collapse-height
  - km-tui-collapse-height
created_by: claude:a5c7f7de
created_at: 2026-02-14T15:56:40Z
closed_at: 2026-02-14T16:00:52Z
---

# [x] Column stays too tall after uncollapsing @km/tui #bug #P2

After uncollapsing a column, it stays at full height instead of resizing to match content. The VirtualList doesn't properly recalculate when transitioning from collapsed (no VirtualList) to expanded (with VirtualList). May need key-based remounting or explicit dimension tracking.