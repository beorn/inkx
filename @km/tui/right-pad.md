---
mentions:
  - km
id: "@km/tui/right-pad"
aliases:
  - km-tui.right-pad
  - km-tui-right-pad
created_by: claude:124bfbe5
created_at: 2026-02-12T21:59:18Z
closed_at: 2026-02-14T22:30:50Z
owner: bjorn@stabell.org
---

# [x] Cards and column header have extra whitespace on inner right padding @km/tui #bug #P3

Cards have paddingRight={1} on the Box (CardColumn.tsx line ~180) which adds a visible whitespace column inside the right border. Column headers have <Box width={1}> spacers on both sides. The right padding/spacer appears excessive — either remove paddingRight from cards or reduce the spacer width.

