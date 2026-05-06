---
mentions:
  - km
  - claude
id: "@km/tui/detailpane-empty"
aliases:
  - km-tui.detailpane-empty
  - km-tui-detailpane-empty
created_by: claude:d697f216
created_at: 2026-02-25T14:44:16Z
closed_at: 2026-02-25T17:18:53Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Detail pane disappears on 'n' — should always show something useful @km/tui #bug #P1 @claude:d697f216

Steps to reproduce:

1. Open detail pane (shows currently selected card)
2. Press 'n' (new item)
3. Detail pane disappears / shows nothing

Expected: Detail pane should ALWAYS show something useful. Even if the selected node changes or becomes invalid, show fallback content (e.g., node ID, type, debug info) — never silently show nothing.

Principle: no silent failures. If there's nothing to display, show a clear message explaining why (e.g., 'No node selected', 'Node not found: <id>').

