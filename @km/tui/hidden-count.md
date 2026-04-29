---
id: "@km/tui/hidden-count"
aliases:
  - km-tui.hidden-count
  - km-tui-hidden-count
created_by: claude:536645b5
created_at: 2026-02-21T16:22:07Z
closed_at: 2026-02-21T17:07:44Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Show hidden item count at end of each column @km/tui #feature #P2 @claude:d3a7049b

When items are hidden by filters (e.g., 'tc' toggle_hide_done), show a minimalist indicator at the bottom of each column/list showing how many items are hidden and why.

Design ideas:
- Line at the end of the card list, below the last visible card
- Minimalist format, e.g.: '˄3 done' or '↕ 3 done' or '+3 ✓' or '3 hidden (done)'
- Should be dim/subtle — not visually competing with actual cards
- If multiple filters active, combine: '+3 done, +1 archived'
- Should update live when filters change
- Clicking/selecting the indicator could toggle the filter (future)

Implementation notes:
- CardColumn.tsx already knows which nodes are filtered out (via filterFn)
- Count the filtered items per-column, group by filter reason
- Render a small Text element at the bottom of the column when count > 0