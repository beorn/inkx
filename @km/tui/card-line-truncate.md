---
mentions:
  - km
  - claude
id: "@km/tui/card-line-truncate"
aliases:
  - km-tui.card-line-truncate
  - km-tui-card-line-truncate
created_by: claude:a5c7f7de
created_at: 2026-02-14T22:56:04Z
closed_at: 2026-02-14T23:01:04Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Card content lines wrap instead of truncating at line end @km/tui #bug #P1 @claude:a5c7f7de

Reported many times. In cards view, child content lines (list items, paragraphs) inside cards wrap to multiple lines instead of being truncated with ellipsis at the line boundary.

Screenshot shows paths like 'Accessible at /Library/Mobile Documents/comapple~CloudDocs/' wrapping to 2 lines, and 'Early Orbit/ — Business, product/engineering docs (.numbers, .key, .p…' wrapping to 3 lines.

Root cause: In cards view, child TreeNodes (depth > 0) render in multiline mode with no height constraint and no overflow='hidden'. Their content text wraps freely. Each child line should be height={1} with wrap='truncate'.

Fix location: TreeNode.tsx — when rendering children inside a card (multiline variant, depth > 0), each child's content should be single-line truncated.

