---
id: "@km/silvery/selection/3-selection-follows-tree-ops-via-transform-slatejs-p"
aliases:
  - km-silvery.selection.3
  - km-silvery-selection-3
  - "@km/silvery/selection/3"
created_by: Bjørn Stabell
created_at: 2026-04-04T16:03:15Z
closed_at: 2026-04-04T20:21:53Z
---

# [x] Selection follows tree ops via transform (SlateJS pattern) — eliminate reconciliation effect @km/silvery #task #P1 @Bjørn Stabell

Replace the reconciliation effect with SlateJS-style selection transform through tree ops.

## Current (reconciliation effect)
Tree changes → effect fires → applyReconcile prunes stale IDs from selection.
Two steps, async, possible stale state between tree change and reconcile.

## Target (transform through op)
Every tree op (deleteNode, moveNode, etc.) transforms selection in the same apply() call.
One step, atomic, no stale state.

## How (SlateJS pattern)
```ts
function applyTreeOp(state: AppState, op: TreeOp): AppState {
  const tree = applyToTree(state.tree, op)
  const selection = transformSelection(state.selection, op, tree)
  return { ...state, tree, selection }
}
```

transformSelection maps selection positions through the tree op:
- deleteNode(C): remove C from selection, repair cursor/anchor
- moveNode(C, newParent): C stays selected if still in root scope, removed if not
- insertNode: no selection change (new node is not selected)

## Benefits
- Atomic: tree + selection change together, undo reverses both
- No ordering bugs: no gap between tree change and selection fixup
- No reconciliation effect to maintain
- Matches SlateJS proven architecture (Editor.apply → Selection.transform)

## Depends on
- km using unified apply() for all tree mutations (already mostly true via UndoableRepo)
- Selection state accessible from tree op handlers

## What to delete
- Remove applyReconcile as standalone function (fold logic into per-op transforms)
- Remove reconciliation effect in store.ts
- Remove tree-change watcher from selection store