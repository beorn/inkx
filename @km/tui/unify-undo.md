---
mentions:
  - km
  - Bjørn
id: "@km/tui/unify-undo"
aliases:
  - km-tui.unify-undo
  - km-tui-unify-undo
created_by: Bjørn Stabell
created_at: 2026-04-02T01:32:09Z
closed_at: 2026-04-02T01:50:10Z
close_reason: "Consolidated: history-plugin.ts was dead code (never imported in
  production). Deleted 254 lines + 236 lines of tests. Active
  UndoStack+UndoableRepo system remains as the single undo mechanism. Commit
  7ecfa98a."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Consolidate undo — merge UndoStack + history-plugin into single mechanism @km/tui #task #P2 @Bjørn Stabell

Two competing undo mechanisms:

- Imperative: undo-stack.ts (117 lines) + undo/ dir (3 files, ~250 lines) + manual entries in board-actions.ts (~50 lines)
- TEA-style: board/history-plugin.ts (~250 lines) with time-based grouping

Plus: keyboard-card-ops.ts wraps moves in undo batches (~30 lines), selection.ts has undo-batched moveTo/forEach.

TARGET: Single unified undo system. Auto-record repo mutations (already done by undoable-repo), capture cursor+fold state per entry, support time-based grouping. One mechanism, not two.

IMPACT: ~200 lines removed, 6+ files simplified. Eliminates bugs from stale fold state in undo entries, missing cursor restore, inconsistent batch boundaries.
ORTHOGONAL to ViewNode — can be done independently.

