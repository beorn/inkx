---
id: "@km/tui/overflow-indicator-gap"
aliases:
  - km-tui.overflow-indicator-gap
  - km-tui-overflow-indicator-gap
created_by: claude:d697f216
created_at: 2026-02-25T14:21:33Z
closed_at: 2026-02-25T20:02:31Z
---

# [x] Blank line between rightmost overflow indicator and cards @km/tui #bug #P2 @claude:d697f216

Overflow indicators have spacing issues:
- Right indicator shows 2 spaces to its left and 1 to its right (4 spaces total)
- Indicator appears centered instead of flush left/right against the columns
- Should be tight against the column edge with no gap

Previous description: blank line between rightmost overflow indicator and cards. May be from HVL gap={1} or the ColumnSeparator (now width=0) interacting with the always-rendered indicators.

Also: column width reservation is 2 chars (INDICATOR_RESERVED=2) — user says only 1-char needed. This ties into the spacing issue.