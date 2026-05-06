---
mentions:
  - km
id: "@km/tree/slatejs-alignment"
aliases:
  - km-tree.slatejs-alignment
  - km-tree-slatejs-alignment
created_by: Bjørn Stabell
created_at: 2026-04-03T03:34:20Z
closed_at: 2026-04-03T04:23:12Z
close_reason: "All 7 phases shipped. Full SlateJS alignment: vocabulary, atomic
  cursor, normalization, operations, selection, plugins, op log."
owner: bjorn@stabell.org
---

# [x] [epic] SlateJS alignment — operations vocabulary, atomic cursor, normalization @km/tree #epic #P2

Full SlateJS alignment for km's tree/editor model. Board = Editor.

km keeps: ID-based addressing, KNode traits, flat parent_id, effects model, markdown sync.
km adopts: SlateJS vocabulary, atomic cursor, normalization, operation model, plugin composition.

## Completed

- Phase 1: SlateJS vocabulary (split, mergeBackward, KNode.string, KTree.previous/next, degrade)
- Phase 2: Atomic cursor (board-tree-ops.ts wraps tree ops + cursor atomically)

## Remaining

- Phase 3: Auto-normalization — schema enforcement after every operation
- Phase 4: Operation model — low-level ops with inversion for op-based undo
- Phase 5: Selection model — Point/Range types, auto-adjustment after ops
- Phase 6: Plugin composition — withHistory, withNormalization, withVim as formal decorators
- Phase 7: Operation log — record ops for undo/collaboration/replay

