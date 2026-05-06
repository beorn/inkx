---
mentions:
  - km
  - claude
id: "@km/tui/multiselect-ops"
aliases:
  - km-tui.multiselect-ops
  - km-tui-multiselect-ops
created_by: claude:949598cc
created_at: 2026-02-12T09:28:58Z
closed_at: 2026-02-12T09:36:51Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Multi-select indent/outdent with atomic batch semantics @km/tui #feature #P2 @claude:949598cc

When multiple nodes are selected, Tab/Shift+Tab should indent/outdent ALL selected nodes atomically. If any node can't be moved (e.g., first child can't outdent further), the entire batch fails and nothing moves. Reference: Decker's multi-select operations pattern. Also applies to future operations (delete, move, etc.).

