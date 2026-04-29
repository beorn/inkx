---
id: "@km/silvery/effect-driven-render"
aliases:
  - km-silvery.effect-driven-render
  - km-silvery-effect-driven-render
created_by: Bjørn Stabell
created_at: 2026-04-10T18:53:10Z
closed_at: 2026-04-10T19:56:49Z
close_reason: "RED verdict: fundamentally incompatible with top-down cascade
  architecture. Current skip logic is already near-O(dirty). Better investments:
  dirty-node jump table, buffer region caching."
---

# [x] G6: Effect-driven rendering — O(dirty) instead of O(tree) @km/silvery #feature #P3

Replace tree-walk rendering with effect-driven dirty-node rendering.

## Current state
renderNodeToBuffer walks the entire tree. canSkipChildSubtree skips clean subtrees,
but the path from root to each dirty node is still traversed. For cursor move on
1000 items, ~5-10 levels × 2 dirty nodes = 10-20 node visits. Minimal overhead.

## Proposed change
Each dirty node registers an alien-signals effect. When dirty flags are set,
the effect fires and renders only that node + its subtree. No tree walk needed.

## Expected impact
- Cursor move: O(2) instead of O(log N) — microsecond-level improvement
- Resize: still O(N) (all nodes dirty) — no improvement
- Best for: partially dirty large trees (fold/unfold, scroll in/out)

## Risk
HIGH — requires rethinking the render phase's top-down traversal order,
hasPrevBuffer/ancestorCleared cascade, and buffer cloning strategy.

## Prerequisite
- PreparedText cache (done: G1-G3)
- Strong test coverage (STRICT mode)

## Design doc
vendor/internal/silvery/design/v10-terminal/signals-pipeline-prototype.md (Design G, step 6)