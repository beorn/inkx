---
id: "@km/tui/toast-shows-node-id"
aliases:
  - km-tui.toast-shows-node-id
  - km-tui-toast-shows-node-id
created_by: Bjørn Stabell
created_at: 2026-04-06T20:03:03Z
closed_at: 2026-04-06T20:09:13Z
close_reason: "Fixed: shortName falls back to content then 'this item', never internal IDs"
---

# [x] [bug] Toast messages show internal node IDs instead of names @km/tui #bug #P3

shortName() in board-actions-zoom.ts falls back to nodeId.slice(-8) when name/title/content are null. Fix: use a better fallback (parent name, rendered title, or just 'this item').