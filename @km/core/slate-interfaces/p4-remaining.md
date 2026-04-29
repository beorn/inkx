---
id: "@km/core/slate-interfaces/p4-remaining"
aliases:
  - km-core.slate-interfaces.p4-remaining
  - km-core-slate-interfaces-p4-remaining
created_by: claude:ceb7c9cb
created_at: 2026-03-28T14:13:00Z
closed_at: 2026-03-28T14:29:12Z
close_reason: Selection.moveTo and forEach added,
  handleReparentTo/handleTaskStatusCycle/handleClearTask simplified, 10 tests
  added
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] P4 remaining: Selection.moveTo + Selection.forEach @km/core #task #P3 @claude:ceb7c9cb

## Gap from @km/core/slate-interfaces/p4-selection

The P4 agent created Selection.nodes, .nodeIds, .cardIndices, .isEmpty, .contains but did not create:

1. **Selection.moveTo(ctx, pos)** — batch move all selected nodes to a Position, with undo batching
2. **Selection.forEach(ctx, fn)** — iterate over selected nodes with automatic undo batch wrapping

These are convenience methods that would DRY up patterns in handleReparentTo and board-actions-edit.ts where the same undo batch + iterate + move pattern repeats.

### /complete
- `grep "moveTo\|forEach" apps/km-tui/src/selection.ts` → >0
- Tests for both methods in selection.test.ts