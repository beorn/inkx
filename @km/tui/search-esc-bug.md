---
id: "@km/tui/search-esc-bug"
aliases:
  - km-tui.search-esc-bug
  - km-tui-search-esc-bug
created_by: claude:499eee95
created_at: 2026-02-13T18:27:47Z
closed_at: 2026-02-13T18:45:27Z
---

# [x] Escape doesn't close search dialog @km/tui #bug #P2

explore-search-fts.test.ts:36 fails:
BUG: Escape did not close the search dialog. The dialog is still visible after pressing Escape.

This may be a keybinding issue where Escape isn't reaching the search dialog, or the dialog's close handler isn't working.