---
mentions:
  - km
id: "@km/inkx/hot-reload"
aliases:
  - km-inkx.hot-reload
  - km-inkx-hot-reload
created_by: claude:ee8efc0f
created_at: 2026-02-23T01:22:53Z
closed_at: 2026-02-23T01:50:47Z
owner: bjorn@stabell.org
---

# [x] Hot reload with state preservation @km/inkx #feature #P4

Watch source files and reload the component tree on change, preserving application state when possible. Like Textual's auto-reload feature. Useful during development to see changes immediately without restarting. Could integrate with Bun's file watcher and React's hot module replacement patterns.

