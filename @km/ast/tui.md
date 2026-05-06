---
mentions:
  - km
id: "@km/ast/tui"
aliases:
  - km-ast.tui
  - km-ast-tui
created_by: claude:124bfbe5
created_at: 2026-02-14T00:11:06Z
closed_at: 2026-02-14T00:59:45Z
owner: bjorn@stabell.org
---

# [x] Update TUI and commands for km-ast types @km/ast #task #P1

Update apps/@km/tui/ and packages/@km/_orphan/commands/ for @km/ast types.

TUI changes:

- use-columns.ts: NON_COLUMN_TYPES → isOutline predicate
- state.ts: update type checks for body content, embed detection
- CardColumn.tsx: update rendering for oi/li/p/h types
- TreeNode.tsx: update type-based rendering
- board-actions*.ts: update type checks
- keyboard-*.ts: update type checks

Commands:

- Update all type checks in command handlers
- Update task creation to use li + task_marker
- Update query building

~28 files total

