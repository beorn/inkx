---
mentions:
  - km
id: "@km/tui/view-ghost-chars"
aliases:
  - km-tui.view-ghost-chars
  - km-tui-view-ghost-chars
created_by: claude:a5c7f7de
created_at: 2026-02-14T16:27:07Z
closed_at: 2026-02-14T20:48:45Z
owner: bjorn@stabell.org
---

# [x] Ghost characters persist after view mode switching (CARDS/TABS/COLUMN) @km/tui #bug #P2

After switching between CARDS/COLUMNVIEW/TABVIEW, stray characters from the previous view remain in blank screen areas. Characters visible: 'e', 't', '...', 'C', '@' (teal). These persist across subsequent view changes and are only cleared by restarting TUI. Likely cause: view transitions don't fully clear the terminal buffer.

