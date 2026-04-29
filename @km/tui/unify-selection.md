---
id: "@km/tui/unify-selection"
aliases:
  - km-tui.unify-selection
  - km-tui-unify-selection
created_by: claude:36393b5d
created_at: 2026-02-19T13:28:50Z
closed_at: 2026-02-19T16:17:34Z
owner: bjorn@stabell.org
---

# [x] Unify dual selection systems: selectedNodes vs ui.multiSelected @km/tui #task #P3

Two parallel selection systems: selectedNodes (Set<string> node IDs on store root) and ui.multiSelected (Set<SelectionKey> using colIndex:cardIndex format). Unify into selectedNodes (node-ID based, survives column reflow). Eliminate multiSelected, SelectionKey, makeSelectionKey, parseSelectionKey.