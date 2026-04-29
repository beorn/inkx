---
id: "@km/all/reactive-tree-strategy-api"
aliases:
  - km-all.reactive-tree-strategy-api
  - km-all-reactive-tree-strategy-api
created_by: Bjørn Stabell
created_at: 2026-04-19T04:35:02Z
closed_at: 2026-04-19T04:46:55Z
close_reason: >-
  SHIPPED Phases 2a + 2b in commit 1b338629a.


  ## Phase 2a criteria (all pass, verified with grep)


  - packages/reactive-tree/src/strategy.ts ✓

  - packages/reactive-tree/src/strategies/ with sparse/walk/walkUp/singleton ✓

  - grep 'desc.type === ' in index.ts → 0 hits ✓

  - Default selection in defaults.ts::resolveDefaultStrategy ✓

  - 37/37 tests pass (33 original + 4 new strategy-override tests) ✓


  ## Phase 2b criteria (all pass)


  - DirectionBuilder.some/count/reduce all accept { strategy: Strategy } ✓

  - 4 new strategy-override tests added (explicit sparse, explicit walk,
  singleton enforcement, walkUp direction guard) — exceeds target of 3 ✓

  - README.md updated with 'Strategies' section + custom strategy example ✓

  - CLAUDE.md updated with 'Extension points' section ✓


  ## Bonus: stress benchmarks


  reactive-tree-perf.bench.ts expanded from 117 → 415 LOC covering sparse/walk
  comparison across tree sizes, deep chains (50/200/1000 depth), balanced trees,
  rebind cost, sequential throughput, singleton vs sparse, multi-strategy
  coexistence, default resolution, and traversal accounting. Verified the
  sparse-over-walk win holds at scale:


  - 100K empty read: sparse 81.5 hz vs walk 32.5 hz (2.5x)

  - 1K vs 100K empty reads: 449x scale gap favors sparse

  - 1K vs 100K cursor moves: 395x scale gap favors sparse


  ## Behavioral fix


  Signal-change dispatch moved BEFORE the signal write commits so strategies can
  veto (throw) cleanly. Prior ordering wrote the signal first, leaving state
  desynced when singleton rejected a write. Test 'singleton strategy enforces
  exactly-one-truthy invariant' pins the new ordering.


  ## Phase 3 status (deferred, per bead)


  First-class topology events replacing rebind() — left OPEN as follow-up work.
  The strategy interface already has onRebind/onSignalChange/onClear hooks;
  Phase 3 would extend to onNodeAdded/Removed/Moved streaming deltas. Waiting
  for a second consumer (or a second perf crisis) to force the API shape.
  Captured in km-all.reactive-tree-library.
---

# [x] reactive-tree: strategy as first-class function/API (composable, not string) @km/all #feature #P1 @Bjørn Stabell

blocks:: [[@km/all]]

Phases 2-3 of @km/all/reactive-tree-library. Replace internal if-else on desc.type with pluggable Strategy<T> interface. Strategies are plain factory functions (sparse, walk, walkUp, singleton) returning plain strategy objects. Aligns with principles.md: plain objects + functions, no magic strings, composable defaults over configuration.

## /complete criteria

### Phase 2a — Internal refactor (no user-visible change)
- packages/reactive-tree/src/strategy.ts with Strategy<T> interface + StrategyContext
- packages/reactive-tree/src/strategies/ with sparse, walk, walkUp, singleton
- reactive-tree/src/index.ts dispatches via strategy.read() instead of if-else on desc.type
- Default selection: dir=down + some/count → sparse; dir=up → walkUp; reduce → walk (default)
- 33/33 existing tests pass unchanged
- grep 'desc\.type === ' packages/reactive-tree/src/index.ts → 0

### Phase 2b — Expose in DSL
- DirectionBuilder.some/count/reduce accept optional Strategy parameter
- New tests: explicit sparse, explicit walk, override default (3 new)
- Docs updated

### Phase 3 (deferred — follow-up if needed)
- tree.on('nodeAdded' | 'nodeRemoved' | 'nodeMoved') — first-class topology events