---
id: "@km/tui/runtime-invariants"
aliases:
  - km-tui.runtime-invariants
  - km-tui-runtime-invariants
created_by: Bjørn Stabell
created_at: 2026-04-01T05:48:06Z
owner: bjorn@stabell.org
---

# [ ] Add runtime invariant checks after every action — crash on corrupt state @km/tui #task #P2

Runtime invariant checks that run after every action to detect state corruption.

## Implemented
- Created apps/@km/tui/src/invariants.ts with 8 invariant checks:
  1. cursor-exists: cursor points to a valid node
  2. cursor-under-root: cursor is descendant of board root
  3. edit-node-exists: inline edit target exists
  4. column-node-exists: column headers reference valid nodes
  5. card-node-exists: column cards reference valid nodes
  6. selection-node-exists: multi-selection IDs are valid
  7. colIndex/cardIndex-bounds: index consistency
  8. cursor-in-columns: cursor node exists but not found in columns
  9. edit-node-in-columns: edit target resolvable in columns

- Wired into board-app.ts: runs after every action in handleKey
- KM_STRICT=1 env var enables crash-on-violation (like SILVERY_STRICT)
- Non-strict mode: logs via km:invariants namespace
- InvariantViolationError handled in tui.tsx error handler

## Tests
- board.test.ts: unit tests for invariant detection
- board-edit.slow.spec.ts: delete consistency + enter-after-edit tests