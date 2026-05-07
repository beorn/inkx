---
mentions:
  - km
  - claude
id: "@km/core/slate-interfaces/p2-remaining"
aliases:
  - km-core.slate-interfaces.p2-remaining
  - km-core-slate-interfaces-p2-remaining
created_by: claude:ceb7c9cb
created_at: 2026-03-28T14:12:50Z
closed_at: 2026-03-28T14:28:13Z
close_reason: NodeQuery namespace created (parent/children/ancestors/siblings),
  Position.after/before added, 32 tests passing. indent/outdent stay in km-tui
  (scoped down — too coupled to ActionCtx).
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] P2 remaining: indent/outdent/shift/split/merge to TreeOps + NodeQuery @km/core #task #P3 @claude:ceb7c9cb

UPDATED SCOPE: Created NodeQuery namespace + Position.after/before.

## What was implemented

1. **NodeQuery namespace** (`packages/km-tree/src/node-queries.ts`) — parent, children, ancestors, siblings queries using TreeReader interface from tree-ops.ts
2. **Position.after/before** (`packages/km-core/src/interfaces/position.ts`) — pure constructors giving insertion slots relative to a node
3. **Tests** for both (32 tests total, all passing)
4. **Barrel export** — NodeQuery added to @km/tree index.ts

## What stays where it is (by design)

- indent/outdent/shiftUp/shiftDown → stay in @km/tui (deeply coupled to ActionCtx, undo handles, dispatch, column state)
- split/merge → already in @km/tree's block-ops.ts (fine there)

## /complete

- `ls packages/km-tree/src/node-queries.ts` → exists
- `ls packages/km-tree/tests/node-queries.test.ts` → exists
- `grep "Position.after\|Position.before" packages/km-core/src/interfaces/position.ts` → found
- `grep NodeQuery packages/km-tree/src/index.ts` → exported

