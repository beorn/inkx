---
mentions:
  - km
id: "@km/tui/tree"
aliases:
  - km-tui.tree
  - km-tui-tree
created_by: Bjørn Stabell
created_at: 2026-04-08T23:58:13Z
closed_at: 2026-04-09T00:38:40Z
close_reason: >-
  All 4 phases complete. Quality plateau reached for reactive tree system.


  P1 (86ff72cfb): Fixed 62 test failures — rebind() preserving signal
  subscriptions

  P2 (f63488fa5): Deleted syncCursor/syncSelected/syncEdit +
  expandWithDescendants

  P3 (699f6f4f3): Eliminated ancestorDone prop drilling → doneAncestor signal

  P4 (11422cefa): Converted ReactiveNodeStore class to createNodeStore() factory


  reactive.ts: 389 → 310 LOC (-79). All sync ceremony eliminated.

  One obvious way: createNodeStore() + signals + useTreeNode().

  216/216 test files pass (5757 tests, 1 flaky column-rendering).
owner: bjorn@stabell.org
---

# [x] Reactive tree quality plateau — eliminate sync ceremony, direct signals, factory function @km/tui #epic #P1

## Goal

Reach the quality plateau for the reactive tree system. One obvious way to read and write per-node state — no sync methods, no bridges, no prop drilling, no class wrapper.

## Current State (2026-04-08)

The v1-v3 engine work is DONE: reactive-graph.ts (computed-based, ~220 LOC) with DSL for tree.ancestors/descendants, 5 primaries + 5 reduced signals, useTreeNode hook. But the **consumer layer** still uses the old imperative patterns:

### Blast Radius

| Pattern                                  | Refs | Files                                  | Phase |
| ---------------------------------------- | ---- | -------------------------------------- | ----- |
| syncCursor/syncSelected/syncEdit         | 9    | 3 (Board.tsx, testing.ts, reactive.ts) | 2     |
| expandWithDescendants/collectDescendants | 10   | 2 (reactive.ts, undoable-repo.ts)      | 2     |
| expandedEditCardId bridge                | 3    | 1 (reactive.ts)                        | 2     |
| ancestorDone prop drilling               | 7    | 1 (NodeView.tsx)                       | 3     |
| shouldStripColor 4 implementations       | 20+  | 4 (selection-style.ts documents this)  | 3     |
| class ReactiveNodeStore                  | 1    | 1 (reactive.ts, 389 LOC)               | 4     |
| Stale bench import (reduced-signals.ts)  | 1    | 1 (computed-vs-engine.bench.ts)        | 1     |

### Test Failures (62 total from v3 Phase 3)

- board-view.spec.ts: 5 failures (fold signal format change)
- text-cursor-bugs.spec.ts: 7 failures (edit signal format)
- edit-save-repro.test.ts: 4 failures (edit signal format)
- input-mode.test.ts: 1 failure (fold)
- card-layout.test.tsx: 1 failure (fold body indicator)
- mouse-click.test.ts: 1 failure (edit mode navigation)
- position/location tests: ~43 failures (position orthogonality)

## Design Doc

docs/design/tree-reduce.md (updated for v3)

## Phases

See child beads for phase details.

