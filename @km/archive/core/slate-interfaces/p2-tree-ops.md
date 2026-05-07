---
mentions:
  - km
  - claude
id: "@km/core/slate-interfaces/p2-tree-ops"
aliases:
  - km-core.slate-interfaces.p2-tree-ops
  - km-core-slate-interfaces-p2-tree-ops
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:18Z
closed_at: 2026-03-28T08:24:45Z
close_reason: TreeOps created in km-tree with 4 helpers (moveTo, toSortOrder,
  nodeAt, isAtPosition) + TreeReader/TreeMover interfaces. Old exports deleted
  from position-resolver.ts. 23 new tests. All callers updated.
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Phase 2: TreeOps — consolidate scattered mutations @km/core #task #P2 @claude:ceb7c9cb

## Goal

Consolidate scattered tree mutations into one TreeOps namespace in @km/tree using the existing TreeMutator interface.

## BREAK FIRST, FIX SECOND

Move functions to TreeOps. DELETE originals. No re-exports. No transition. Fix all callers.

> "BAD: Re-export for backwards compat." — Lesson 4
> "Copy = debt until deletion. Delete old copy in the SAME commit." — Case Study 7

## Changes

### @km/tree/src/tree-ops.ts (NEW)

```typescript
export const TreeOps = {
  moveTo(tree: TreeMutator, nodeId: string, pos: Position): boolean,
  indent(tree: TreeMutator, nodeId: string): boolean,
  outdent(tree: TreeMutator, nodeId: string): boolean,
  shiftUp(tree: TreeMutator, nodeId: string): boolean,
  shiftDown(tree: TreeMutator, nodeId: string): boolean,
  split(tree: TreeMutator, nodeId: string, offset: number): SplitResult,
  merge(tree: TreeMutator, nodeId: string, dir: "prev" | "next"): MergeResult,
  insertAfter(tree: TreeMutator, siblingId: string, node: Partial<KNode>): string,
  remove(tree: TreeMutator, nodeId: string): void,
}
```

### @km/tree/src/node-queries.ts (NEW)

```typescript
export const NodeQuery = {
  parent(tree: TreeMutator, nodeId: string): KNode | null,
  children(tree: TreeMutator, parentId: string): KNode[],
  ancestors(tree: TreeMutator, nodeId: string): KNode[],
  siblings(tree: TreeMutator, nodeId: string): KNode[],
}
```

### Deletions (SAME COMMIT)

- DELETE indentNode/outdentNode from keyboard-card-ops.ts (NOT re-export)
- DELETE handleShiftCard internals that duplicate TreeOps logic from board-actions-edit.ts
- DELETE moveTo/toSortOrder/isAtPosition from position-resolver.ts (moved to TreeOps)

### Position.after / Position.before (NEW)

Add to @km/_orphan/core Position namespace (pure, no repo):

```typescript
// These need a siblings list, so they take TreeMutator
export const PositionOps = {
  after(tree: TreeMutator, nodeId: string): Position | null,
  before(tree: TreeMutator, nodeId: string): Position | null,
  nodeAt(tree: TreeMutator, pos: Position): KNode | null,
  toSortOrder(tree: TreeMutator, pos: Position): number,
}
```

Note: repo-dependent resolution (resolveLocationKey) stays in @km/tui.

### New tests (SAME COMMIT)

- @km/tree/tests/tree-ops.test.ts — every TreeOps method
- @km/tree/tests/node-queries.test.ts — every NodeQuery method

### Fix callers

- @km/tui handlers → TreeOps.moveTo, TreeOps.indent, etc.
- handleReparentTo body shrinks to <10 lines

## Definition of Done

- [ ] Source uses TreeOps (no manual sibling arithmetic)
- [ ] Tests use TreeOps
- [ ] Old functions deleted (not re-exported)
- [ ] New files have tests
- [ ] grep finds no manual patterns TreeOps replaces

## /complete (exact greps)

- `grep -rn "export function indentNode\|export function outdentNode" apps/km-tui/src/keyboard/keyboard-card-ops.ts` → 0 (deleted)
- `grep -rn "export function moveTo\|export function toSortOrder\|export function isAtPosition" apps/km-tui/src/board/position-resolver.ts` → 0 (moved)
- `grep -rn "TreeOps\." km-tree/src/tree-ops.ts` → >0
- `grep -rn "NodeQuery\." km-tree/src/node-queries.ts` → >0
- `ls km-tree/tests/tree-ops.test.ts` → exists
- `ls km-tree/tests/node-queries.test.ts` → exists
- All tests pass

