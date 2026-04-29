---
id: "@km/tui/search-replace-dialog"
aliases:
  - km-tui.search-replace-dialog
  - km-tui-search-replace-dialog
created_by: claude:d3a7049b
created_at: 2026-02-21T17:10:04Z
closed_at: 2026-02-21T17:12:52Z
---

# [x] Search & Replace dialog: layout broken, overlaps content @km/tui #bug #P2 @claude:d3a7049b

The Find & Replace dialog has rendering/layout issues:
1. Title '[F]ind & Replace' bleeds into card content behind it
2. No clear visual boundaries — dialog overlaps column content
3. Find/Repl fields and regex checkbox crammed into a small area
4. Dialog should be a floating overlay with a proper border and background

Screenshot: ~/Desktop/Screenshot 2026-02-21 at 17.09.11.png