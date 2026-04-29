---
id: "@km/tui/border-after-detail-close"
aliases:
  - km-tui.border-after-detail-close
  - km-tui-border-after-detail-close
created_by: claude:d3a7049b
created_at: 2026-02-20T10:33:20Z
closed_at: 2026-02-20T12:35:02Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Border rendering issues after closing detail pane @km/tui #bug #P2 @claude:d3a7049b

After closing a detail pane, section card borders render inconsistently across columns. In the screenshot (2026-02-20 10:32), the left column (Study) has a proper bordered section card, while the right column ([Fam] Buy) has partial/missing box borders around its content — items are visible but the card border frame is broken or missing segments. This suggests the detail pane close doesn't properly trigger a full re-render of the board columns, leaving stale border state.