---
id: "@km/tui/activity-subitems"
aliases:
  - km-tui.activity-subitems
  - km-tui-activity-subitems
created_by: claude:97b8de73
created_at: 2026-02-23T13:23:52Z
closed_at: 2026-02-23T14:32:26Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Activity/Comments still show as card sub-items (§ Activity) @km/tui #bug #P2 @claude:97b8de73

Every card shows '§ Activity' as a visible sub-item line. These should be hidden at card level (only shown in detail pane). The closed bead @km/tui/activity-cards added isCollapsedChild filter to column-level filtering but it doesn't filter sub-items WITHIN cards rendered by TreeNode. The collapse rule needs to apply inside Card rendering too. Screenshots: 13.08.07.png, 13.08.42.png