---
mentions:
  - km
id: "@km/tree/operation-model"
aliases:
  - km-tree.operation-model
  - km-tree-operation-model
created_by: Bjørn Stabell
created_at: 2026-04-03T03:56:05Z
closed_at: 2026-04-03T04:23:10Z
close_reason: Shipped b0556467. 7 op types + inverse() + applyOperation().
owner: bjorn@stabell.org
---

# [x] Phase 4: Operation model — low-level ops with inversion for op-based undo @km/tree #task #P3

SlateJS has 9 atomic operation types (insert_text, split_node, merge_node, etc.)
with inverse() for each. km uses high-level ops (split, merge) without inversion.

Add: Operation type with inverse() function.
Operations: insert_node, remove_node, set_node, move_node, split_node, merge_node, set_selection
Each op is invertible — applying inverse undoes the op.
Enables: op-based undo (no snapshots), real-time collaboration (op forwarding), replay.

Keep km's high-level API (split, mergeBackward) as Transforms that emit Operations.
Operations are the internal representation — callers never see them.

Key difference from SlateJS: km uses ID-based addressing, not path-based.
Operations reference node IDs, not array indices. More stable under concurrency.

