---
mentions:
  - km
  - claude
id: "@km/tui/detail-nav-ancestor"
aliases:
  - km-tui.detail-nav-ancestor
  - km-tui-detail-nav-ancestor
created_by: claude:53ab8041
created_at: 2026-03-03T12:56:12Z
closed_at: 2026-03-03T13:01:28Z
owner: bjorn@stabell.org
assignee: claude:53ab8041
---

# [x] Detail nav crash: cursor has no ancestor under root (same ID) @km/tui #bug #P1 @claude:53ab8041

Zooming into a folder in detail view crashes with:
Error: [detail-nav] cursor 01KJE4W8Y9GSCM58EXPKR8VZX3 has no ancestor under root 01KJE4W8Y9GSCM58EXPKR8VZX3

Repro: km view --repo imports/asana stabell
Steps: Open detail pane (D), navigate up (k, k), then zoom triggers the crash.

Also has severe performance issues — event loop blocked 989ms (startup), 1761ms (toggle_detail_pane), 548ms and 531ms (cursor_up).

The error message says cursor=X has no ancestor under root=X — the cursor and root are the SAME ID. This is likely a tree navigation bug where the root is also the cursor, and findAncestor fails because a node is not its own ancestor.

