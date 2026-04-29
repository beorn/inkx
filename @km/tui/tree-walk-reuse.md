---
id: "@km/tui/tree-walk-reuse"
aliases:
  - km-tui.tree-walk-reuse
  - km-tui-tree-walk-reuse
created_by: Bjørn Stabell
created_at: 2026-04-08T07:01:10Z
closed_at: 2026-04-08T23:50:21Z
close_reason: "Superseded: v3 computed engine makes tree walks transparent. No
  manual catalog needed."
owner: bjorn@stabell.org
---

# [x] Analyze tree-walk + reduced signal reuse across km, silvery, flexily @km/tui #task #P3

Survey completed. Tree-walking primitives and reduced signals have broad reuse potential across km, silvery, and flexily.

## Key findings

### REFRAME opportunities (changes how we think)

1. **ProjectedReducer** — fuse ProjectedMap + tree reduction into one pipeline. All per-node state computed via unified tree reduction, not scattered signal bags. Merges view-tree-projection + reactive.ts + tree-concerns.ts.

2. **Concern-driven visibility** — collapse/card-filter/task-filter should be orthogonal "concerns" with direction semantics, not independent filters merged in visible-lens.

3. **Monadic tree reductions** — tree.descendants(set) and tree.ancestors(set) as two primitives replacing expandWithDescendants(), manual ancestor walks in 3+ files, and TreeConcernEngine's walkDown/walkUp.

4. **Clean data/signal boundary** — TreeLens = data, ViewTree = signals. Currently ViewTree is both.

### Concrete reuse sites (9 manual walks found)

| File | Walk type | Replacement |
|------|-----------|-------------|
| navigate-to-node.ts:126 | ancestor chain | tree.up(nodeId) |
| board-selection-helpers.ts:33 | parent walk + early exit | tree.up(nodeId).find() |
| ui-context.tsx:120 findBoardRootId | ancestor walk for fs_path | tree.up(nodeId).find(n => n.fs_path) |
| reactive.ts syncCursor | 4 derived signals from cursor | tree.ancestors(cursor) derivation |
| reactive.ts expandWithDescendants | recursive DFS | tree.descendants(set) |
| visible-lens.ts:180 walkOrder | iterative DFS with stack | [...tree.down(rootId)] |
| view-lens.ts computeColumnChildren | manual children + cache | reduced signal |
| flexily layout-traversal.ts | dirty flag + position delta DFS | tree.down(node) |

### Cross-package opportunities

- **Flexily constraint fingerprinting** → reusable for @km/_orphan/board lens caching
- **Flexily fresh-vs-incremental test oracle** → port to @km/_orphan/board for caching bug detection
- **Silvery focus scopes** → same TreeAccess interface
- **@km/storage SQL CTEs** → could implement TreeAccess for cross-layer algorithms

### Estimated impact

~150 LOC of manual walks replaced by iterator/combinator calls. 5 signal propagation mechanisms → 1 (TreeConcernEngine / reduced signals). 3 tree abstractions → 1 (TreeAccess).

## Relationship to hierarchical-node-state

Phase 1 of hierarchical-node-state builds the core engine. These reuse opportunities become available AFTER Phase 1 lands. Not blockers — follow-up work.