---
id: "@km/tui/collapse-persist"
aliases:
  - km-tui.collapse-persist
  - km-tui-collapse-persist
created_by: claude:124bfbe5
created_at: 2026-02-12T22:29:33Z
closed_at: 2026-02-14T09:08:05Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Collapse columns: persist to DB, vertical 3-char styling @km/tui #feature #P3 @claude:124bfbe5

Column collapse: (1) persist collapsed state to DB across restarts. (2) Collapsed column renders name vertically down the full height (no count needed). The 'column head' should fill the entire available height, not just a narrow strip.