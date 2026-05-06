---
mentions:
  - km
  - claude
id: "@km/inbox/9wdm6"
aliases:
  - km-9wdm6
  - "@km/_orphan/9wdm6"
created_by: claude:8f007ba9
created_at: 2026-02-19T21:25:11Z
closed_at: 2026-02-19T21:44:58Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Surface dependency data in TUI (deps/blocks already imported) @km/_orphan #feature #P2 @claude:8f007ba9

data.deps and data.blocks are imported from Asana as ^GID references but never rendered on cards or in the detail pane. This is the biggest gap for Asana board parity. Dependencies should be shown: (1) on cards as a blocking indicator icon, (2) in detail pane as linked items. Asana shows dependency chains prominently.

