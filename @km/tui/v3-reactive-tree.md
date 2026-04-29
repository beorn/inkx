---
id: "@km/tui/v3-reactive-tree"
aliases:
  - km-tui.v3-reactive-tree
  - km-tui-v3-reactive-tree
created_by: Bjørn Stabell
created_at: 2026-04-08T17:04:54Z
closed_at: 2026-04-09T00:57:29Z
close_reason: "All v3 phases complete. P1: computed engine (d32fe0b1a). P2:
  cutover (5ffd355ae). P3: store merge (762b7468f). P4 (sync elimination) and
  factory conversion done under km-tui.tree epic. 18 test failures from P3 fixed
  in km-tui.tree.p1-fix."
---

# [x] v3 reactiveTree — computed-based engine, same DSL, -800 LOC @km/tui #task #P2 @Bjørn Stabell

v3: Replace count-based engine with computed-based engine. Same DSL, ~80 LOC, 5-38x faster.

## Why

Benchmarks show alien-signals computed() is 5-38x faster than our count-based engine at our scale (depth 3-4, 50-200 nodes). We reimplemented dependency tracking, caching, batching, and equality -- all of which alien-signals does natively in C/Rust. The v2 engine was a learning step that proved the API. v3 keeps the DSL, deletes the machinery.

## Current State

- reduced-signals.ts: 532 LOC (count-based engine + DSL + types)
- reactive.ts: 475 LOC (ReactiveNodeStore class wrapping the engine)
- 28 engine tests, 12 golden tests
- Consumers: Board.tsx, CardColumn.tsx, TreeNode.tsx via syncCursor/syncSelected/syncEdit

## Target State

- reactive-graph.ts: ~80 LOC (computed-based engine + DSL)
- No ReactiveNodeStore class (factory function)
- No sync methods (direct signal writes)
- Same DSL, same consumer API, same test coverage

## Phases

### Phase 1: Build computed engine alongside old (@km/tui/v3-phase1)

Build reactive-graph.ts (~80 LOC) implementing the same DSL with computed():

    const store = reactiveGraph((tree) => ({
      cursor:           signal(false),
      cursorDescendant: tree.descendants(s => s.cursor).some(),
    }), { parent, children })

graph.descendants(s => s.cursor).some() compiles to:
    computed(() => { for (id of walkDown(nodeId)) if (get(id).cursor()) return true; return false })

Graph bound at creation. No batch() needed -- alien-signals handles it.

Files:
- reactive-graph.ts -- NEW (~80 LOC)
- reactive-graph.test.ts -- NEW (port all 28 tests)

Delete: nothing yet (old engine stays until phase 2)
/complete:
    bun vitest run apps/@km/tui/tests/reactive-graph.test.ts  # all pass
    ls apps/@km/tui/src/state/reactive-graph.ts  # exists

### Phase 2: Cut over ReactiveNodeStore to computed engine (@km/tui/v3-phase2)

ReactiveNodeStore.reduced switches from createReactiveTree to reactiveGraph.
Verify all 216 test files still pass.

Files:
- reactive.ts -- switch this.reduced to reactiveGraph
- Board.tsx -- pass visibleLens to reactiveGraph at creation

Delete: reduced-signals.ts (the count-based engine, ~500 LOC)
/complete:
    rg 'createReactiveTree|ReducedSignalStore' --glob '!.beads' -t ts -c | wc -l  # 0
    rg 'reduced-signals' apps/@km/tui/src/ -c | wc -l  # 0
    ls apps/@km/tui/src/state/reduced-signals.ts  # should NOT exist
    bun run test:fast  # pass

### Phase 3: Merge stores + factory function (@km/tui/v3-phase3)

Move all per-node state (foldOverride, edit, hovered, sticky) into the graph schema.
Convert ReactiveNodeStore class to createNodeStore() factory. Delete NodeReactiveState interface.

Files:
- reactive.ts -- rewrite as factory wrapping reactiveGraph
- Board.tsx, CardColumn.tsx, TreeNode.tsx -- use store.get(id).field() directly

Delete: NodeReactiveState interface, createNodeState(), getOrCreate()
/complete:
    rg 'class ReactiveNodeStore' -t ts -c | wc -l  # 0
    rg 'NodeReactiveState' -t ts -c | wc -l  # 0
    rg 'getOrCreate' apps/@km/tui/src/state/ -c | wc -l  # 0
    bun run test:fast  # pass

### Phase 4: Eliminate sync methods (@km/tui/v3-phase4)

Board.tsx writes signals directly. No more syncCursor/syncSelected/syncEdit.
Delete expandWithDescendants, expandedEditCardId, excludedSigils bridge.

Files:
- reactive.ts -- delete sync methods (~85 LOC)
- Board.tsx -- inline signal writes

Delete: syncCursor, syncSelected, syncEdit, expandWithDescendants, collectDescendants, expandedEditCardId, excludedSigils bridge
/complete:
    rg 'syncCursor|syncSelected|syncEdit' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
    rg 'expandWithDescendants|expandedEditCardId' --glob '!.beads' -t ts -c | wc -l  # 0
    bun run test:fast  # pass

## LOC Impact

Before: 532 + 475 = 1007 LOC (engine + wrapper)
After: ~80 + ~100 = ~180 LOC (computed engine + factory)
Net: ~-800 LOC deleted