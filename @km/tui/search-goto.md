---
id: "@km/tui/search-goto"
aliases:
  - km-tui.search-goto
  - km-tui-search-goto
created_at: 2026-02-04T14:29:42Z
closed_at: 2026-02-04T14:39:14Z
---

# [x] Search Enter doesn't navigate to non-file items @km/tui #bug #P2 @claude:44a381e0

When selecting a search result that's not a file (section, paragraph, bullet, etc.) and pressing Enter, the dialog closes but nothing happens - the item is not shown/highlighted.

Repro:
1. Open search with /
2. Search for content that's inside a file (a section or paragraph)
3. Press Enter on the result
4. Dialog closes but the item is not visible

Expected: Should zoom to show the item and highlight/select it.