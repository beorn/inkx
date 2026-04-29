---
id: "@km/tui/help"
aliases:
  - km-tui.help
  - km-tui-help
created_by: claude:536645b5
created_at: 2026-02-20T16:11:39Z
closed_at: 2026-02-21T08:01:31Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Help, hints, progress, chord menus, and dialog boxes @km/tui #epic #P2 @claude:d3a7049b

Unified design for all overlay chrome UI elements: bottom-anchored (key bar, which-key, find bar), centered floating (dialogs), and transient indicators (progress, save confirmation). Covers visual consistency, layering/z-order, modal vs non-modal behavior, and sizing.

Children:
- @km/tui/whichkey (DONE) — chord suffix popup
- @km/tui/keybar (DONE) — mode-aware bottom hints
- @km/tui/search-replace — floating search/replace dialog
- @km/tui/local-find — inline find bar
- @km/tui/omnibox — universal command palette

TBD: help screen (?), task dialog (T), progress/status indicators, toast notifications.