---
mentions:
  - km
  - claude
id: "@km/tui/search-keyeat"
aliases:
  - km-tui.search-keyeat
  - km-tui-search-keyeat
created_at: 2026-02-04T14:29:50Z
closed_at: 2026-02-04T14:48:39Z
assignee: claude:44a381e0
---

# [x] Search dialog eats keypresses while opening @km/tui #bug #P2 @claude:44a381e0

When opening the search dialog with / and immediately typing, characters are lost/eaten until the dialog fully opens.

Repro:

1. Press / followed quickly by search text (e.g., /hello)
2. Some characters are missing when the dialog appears

Root cause: The heavy node query blocks the render, so useInput doesn't register until after the query completes. The startTransition fix defers the query but the dialog still isn't instant.

Fix needed: The dialog should open immediately with empty/loading state, input handler registers first, then results load lazily.

