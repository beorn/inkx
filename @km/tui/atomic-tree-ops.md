---
id: "@km/tui/atomic-tree-ops"
aliases:
  - km-tui.atomic-tree-ops
  - km-tui-atomic-tree-ops
created_by: Bjørn Stabell
created_at: 2026-04-11T00:41:20Z
closed_at: 2026-04-18T08:16:32Z
close_reason: Largely complete via existing sel.transform() infrastructure.
  executeBatchDelete uses sel.transform (atomic cursor repair).
  board-effect-runner.ts REPO_* ops all use sel.transform. board-tree-ops.ts
  split/merge use setSelection atomically. Residual manual move/reorder sites
  (board-actions-edit.ts lines 485, 734, 767) don't change selection and don't
  need atomic wrapping. See feat/selection-plateau.
---

# [x] Atomic tree+selection operations: structural ops include selection update @km/tui #feature #P0

blocks:: [[@km/all/unified-selection]], [[@km/silvery/selection-focus-plateau]]

Make tree-mutating operations (split, merge, delete, degrade, move) atomically include selection updates.

Current: board-tree-ops.ts and board-actions.ts call tree mutation then separately poke selection signals. Callers must manually coordinate: executeDelete() then sel.text.edit() then requestRenderFlush().

Target: Each structural operation returns new state including updated selection. No separate sel.* calls needed. The operation IS the selection update.

Depends on: @km/all/unified-selection (need the Selection type first)