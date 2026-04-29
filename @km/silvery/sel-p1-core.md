---
id: "@km/silvery/sel-p1-core"
aliases:
  - km-silvery.sel-p1-core
  - km-silvery-sel-p1-core
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:19Z
closed_at: 2026-04-04T16:12:59Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Selection Phase 1: Core value model + pure functions @km/silvery #task #P1 @Bjørn Stabell

Pure transitions + types. Zero dependencies. No signals, no React, no ag tree.

## What changes
- `packages/silvery-selection/src/types.ts` — ID, OrderedSet, SelectionState, TextEdit, PressHit, PointerState
- `packages/silvery-selection/src/apply.ts` — applySelect, applyExtend, applyReconcile, applyCollapse, applyRemove, applySelectAll, applyTextEdit, applyTextSelect, applyExitSub, applyDeselect
- `packages/silvery-selection/src/pointer.ts` — applyPointerEvent (pure pointer state machine: idle, pointing-*, dragging-*)
- `packages/silvery-selection/src/ordered-set.ts` — OrderedSet implementation (array + cached Set for O(1) has)
- `packages/silvery-selection/src/index.ts` — barrel export
- `packages/silvery-selection/package.json` + tsconfig.json

## Tests
- tests/apply.test.ts — all apply* functions, cursor/anchor rules table
- tests/pointer.test.ts — all pointer states, transitions, morphing, modifiers
- tests/ordered-set.test.ts — OrderedSet operations
- tests/invariants.test.ts — state invariants

## /complete
```
bun vitest run packages/silvery-selection/ → all pass
grep "applySelect\|applyExtend\|applyReconcile" packages/silvery-selection/tests/ → hits
grep "applyPointerEvent" packages/silvery-selection/tests/ → hits
```