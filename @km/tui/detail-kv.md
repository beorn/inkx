---
mentions:
  - km
id: "@km/tui/detail-kv"
aliases:
  - km-tui.detail-kv
  - km-tui-detail-kv
created_by: claude:1d8b0fc3
created_at: 2026-02-15T15:28:16Z
closed_at: 2026-02-15T15:29:17Z
owner: bjorn@stabell.org
---

# [x] Detail pane: show unknown node.data fields as key:value @km/tui #task #P2

The TUI detail pane currently only renders known fields (status, priority, due, assigned, tags, subtasks, backlinks). Any node.data field that doesn't match a known field should be rendered as a generic key:value line. This ensures bd-style metadata (close_reason, blocked_by, design, notes, etc.) and any future extensions are visible without needing explicit UI code for each field.

