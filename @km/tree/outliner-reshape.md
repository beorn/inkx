---
id: "@km/tree/outliner-reshape"
aliases:
  - km-tree.outliner-reshape
  - km-tree-outliner-reshape
created_by: Bjørn Stabell
created_at: 2026-04-01T19:43:21Z
---

# [ ] Reshape withOutliner: method bag → (state, op) → [state, effects] @km/tree #task #P3

blocks:: [[@km/tree]]

withOutliner currently returns { indent(), outdent(), splitBlock(), ... } — a method bag that mutates tree imperatively.

TEA shape: withOutliner wraps Tree.apply:
  (state, op) → [state, effects]

The guard logic and spec alignment stay. Only the interface changes.

Depends on: Tree.apply existing (Phase 4 of TEA, or can be approximated with current TreeMutator)