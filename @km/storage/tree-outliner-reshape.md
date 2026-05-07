---
mentions:
  - km
id: "@km/storage/tree-outliner-reshape"
aliases:
  - outliner-reshape
  - "@km/tree/outliner-reshape"
  - km-tree.outliner-reshape
  - km-tree-outliner-reshape
created_by: Bjørn Stabell
created_at: 2026-04-01T19:43:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tree.outliner-reshape
    depends_on_id: km-tree
    type: parent-child
    created_at: 2026-04-21T23:05:00Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tree
      - type: link
        target: "@km/storage/tree"
---

# [ ] Reshape withOutliner: method bag → (state, op) → [state, effects] @km/tree #task #P3

blocks:: [[@km/storage/tree]]

withOutliner currently returns { indent(), outdent(), splitBlock(), ... } — a method bag that mutates tree imperatively.

TEA shape: withOutliner wraps Tree.apply:
  (state, op) → [state, effects]

The guard logic and spec alignment stay. Only the interface changes.

Depends on: Tree.apply existing (Phase 4 of TEA, or can be approximated with current TreeMutator)

