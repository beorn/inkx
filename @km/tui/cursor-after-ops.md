---
mentions:
  - km
  - claude
id: "@km/tui/cursor-after-ops"
aliases:
  - km-tui.cursor-after-ops
  - km-tui-cursor-after-ops
created_by: claude:949598cc
created_at: 2026-02-12T09:28:59Z
closed_at: 2026-02-12T09:36:51Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Verify cursor position and selection state after indent/outdent operations @km/tui #task #P2 @claude:949598cc

Systematically verify and fix cursor position and selection state after indent/outdent operations. Tests should cover: where cursor ends up after indent (auto-clamp to sibling), where cursor ends up after outdent, what happens to multi-selection after batch operations, edge cases at boundaries.

