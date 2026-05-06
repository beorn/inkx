---
mentions:
  - km
  - Bjørn
---

# [x] Configurable tree traversal iterator — walkTree with filter/visible/maxDepth @km/storage/tree #task #P2 @Bjørn Stabell

No shared tree iterator exists. TreeReader only has getNode/getChildren — no way to walk a subtree with filtering.

Needed by: J/K spatial nav (visible blocks), validation (dirty subtrees), rendering (visible block list), search.

API:
function* walkTree(tree, rootId, opts?) yields { node, depth, parentId }

- filter: (node) => boolean — skip node + subtree
- visible: (nodeId) => boolean — skip hidden (fold/collapse state)
- maxDepth: number — depth limit
- order: 'dfs' | 'bfs' — traversal order (default dfs)

Currently getVisibleColumnBlocks() in board-actions-nav.ts is an ad-hoc version. Promote to shared infra.

