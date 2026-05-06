---
mentions:
  - km
  - Bjørn
id: "@km/tui/v2-reactive-tree"
aliases:
  - km-tui.v2-reactive-tree
  - km-tui-v2-reactive-tree
created_by: Bjørn Stabell
created_at: 2026-04-08T15:08:30Z
closed_at: 2026-04-08T17:05:28Z
close_reason: "Engine shipped: primary(), .reduce(), includeSelf, walk
  coalescing, 5 primaries + 5 reduced signals, useTreeNode hook. Consumer
  migration tracked in km-tui.v3-reactive-tree."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] v2 Reactive Tree — .reduce(), excludedSigils, factory function, all gaps @km/tui #task #P1 @Bjørn Stabell

v2 Reactive Tree engine -- SHIPPED.

## What shipped (this session)

### Phase A: Engine Core

- .reduce() combinator with full recompute path (separate from delta-count fast path)
- primary() descriptors replacing signal-as-schema (typed init, factory for non-primitives)
- includeSelf option on all combinators
- Walk coalescing: multiple signals same direction+source = one walk
- Generalized primary types (string[], not just boolean)
- Root-to-self traversal order for ancestors + .reduce()
- Custom equality support (arrayShallowEqual)
- Batch dedup for .reduce() descriptors

### Phase B: New Signals

- isDone primary + doneAncestor reduced signal
- ownSigils primary + excludedSigils via .reduce(concat, [], { includeSelf })
- Bridge: reduced excludedSigils synced to old NodeReactiveState for transition

### Phase C: Ergonomics

- useTreeNode(nodeId) hook -- single accessor for all per-node signals

### Perf Discovery

- 73% output phase was SILVERY_STRICT test overhead, not production cost
- Production: ~10ms/press, output phase 0.2ms/frame

## Stats

- 15 files changed, +1231/-443 (net +788)
- Engine: 457 LOC, Tests: 302 LOC
- 28 engine tests + 12 golden visual tests

