---
id: "@km/silvery/sel-p2-provider"
aliases:
  - km-silvery.sel-p2-provider
  - km-silvery-sel-p2-provider
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:27Z
closed_at: 2026-04-04T16:13:00Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Selection Phase 2: Store + signals (createSelection) @km/silvery #task #P1 @Bjørn Stabell

Store + signals. createSelection(app) returns the integrated store.

## What changes
- `packages/silvery-selection/src/store.ts` — createSelection(app), the full store object
- `packages/silvery-selection/src/sub-text.ts` — sel.text accessor (computed + methods)
- `packages/silvery-selection/src/sub-path.ts` — sel.path stub
- `packages/silvery-selection/src/sub-crop.ts` — sel.crop stub
- `packages/silvery-selection/src/reconcile.ts` — reconciliation effect on ag tree changes
- `packages/silvery-selection/src/node-signals.ts` — write agNode.selected on selection change

## Store shape
sel.node.cursor/anchor/ids + select/extend/collapse/remove/selectableAncestor
sel.text()/edit/select/deselect + sel.path() [stub] + sel.crop() [stub]
sel.drag()/start/end/cancel
sel.root.id/set/up
sel.kind + sel.deselect() + sel.selectAll()

## Tests
- tests/store.test.ts — all store operations, signal reactivity, ag tree reads
- tests/reconcile.test.ts — prune, repair cursor/anchor, cancel drag, virtualization
- tests/sub.test.ts — text/path/crop accessors, polymorphic sel.sub

## /complete
```
bun vitest run packages/silvery-selection/ → all pass
grep "createSelection" packages/silvery-selection/src/index.ts → exported
```