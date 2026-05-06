---
mentions:
  - km
  - claude
id: "@km/tui/search-nav"
aliases:
  - km-tui.search-nav
  - km-tui-search-nav
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:30:04Z
closed_at: 2026-02-19T08:10:30Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Search: Enter doesn't navigate cursor to the matched card @km/tui #bug #P2 @claude:36393b5d

When using / search and pressing Enter on a result, the board navigates to the parent section/column but doesn't select the actual matched card. User has to manually scroll/zoom to find it. Expected: cursor should land on the exact matched node.

