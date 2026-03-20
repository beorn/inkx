# JS Signals Landscape & Era2 Alignment

> Research as of 2026-03-19. Era2 alignment and entity signals analysis updated 2026-03-20. Covers TC39 proposal, major frameworks, emerging libraries, and how era2 compares.

## TC39 Signals Proposal (Stage 1)

- **Champions**: Daniel Ehrenberg (Bloomberg), Rob Eisenberg, with input from Ryan Carniato, the Angular team, and others
- **Repo**: [`tc39/proposal-signals`](https://github.com/tc39/proposal-signals)
- **Status**: Stage 1 since April 2024, active development, polyfill available
- **API**: `Signal.State(initialValue)` (writable), `Signal.Computed(fn)` (derived)
- **Goal**: Interop layer so frameworks can share reactive graphs — not a replacement for framework-level features
- **Key detail**: `Signal.subtle.Watcher` — low-level hook for frameworks to schedule their own effect execution (sync, microtask, animation frame)
- **Relevance to era2**: The `Readable<T>` interface (`{ (): T, subscribe }`) aligns with the proposal's interop goals. Era2 could adopt TC39 signals as the interop contract while using a faster implementation internally.

## Ryan Carniato / SolidJS

### Blog Series on Reactivity (2024) — Essential Reading

Four-part series representing the deepest technical writing on signals in the ecosystem:

1. **"Derivations in Reactivity"** (Jan 2024) — Core distinction: derivation (pure `next = fn(deps)`) vs synchronization (effects writing to state). "What can be derived, should be derived." Effects writing to state break dependency tracking.

2. **"Scheduling Derivations in Reactivity"** — Three scheduling strategies: immediate (sync, depth-first), lazy (defer until read), scheduled (queue for ordering). Even lazy systems benefit from scheduled nodes for pure calculations before rendering.

3. **"Async Derivations in Reactivity"** (Aug 2024) — The hardest problem. Async contamination (function coloring) spreads through codebases. Proposes signals that handle async transparently: `createAsync` executes eagerly, throws unresolved values up the chain, reschedules on resolution. With "colorless async," ALL values become potentially reactive.

4. **"Mutable Derivations in Reactivity"** — Introduces **projections**: derived mutable stores that track changes and apply transformations reactively. Unlike immutable derivations that rebuild state, projections mutate in-place, preserving object identity.

Links: `dev.to/this-is-learning/derivations-in-reactivity-4fo1` (and subsequent parts)

### "Beyond Signals" (JSNation US 2025)

Carniato's thesis: **signals alone don't solve the hard problems**. The next frontier is **projections** — reactive data transformations over collections:

- **Problem**: When you `map()` a reactive array, naive signals recreate every mapped item on any array change. For 1000 items where one changes, you need O(1) updates, not O(n).
- **Projections** = reactive list primitives (map, filter, sort, slice) with fine-grained diffing
- Think of them as "reactive SQL views" — declarative transformations that maintain themselves incrementally
- **Relevance to era2**: km's VirtualList rendering tree nodes. Projections would let the model layer express "these 1000 nodes, filtered by status, sorted by date" as a reactive pipeline with O(1) updates.

### SolidJS 2.0 (Beta, March 2026)

v2.0.0-beta.0 released, skipping alpha. Key changes:

- **Signals rewritten from scratch** — new reactive graph implementation
- **Async is first-class**: Computations can return Promises or async iterables; graph suspends/resumes
- **`<Loading>` vs `isPending()`**: `<Loading>` for initial readiness fallbacks; `isPending(() => expr)` as expression for background refresh
- **Deterministic batching**: Microtask-based; reads don't update until batch flushes; explicit `flush()` for immediate sync
- **Projections**: New primitive for derived, granular, non-mutating reactive data
- **Optimistic updates**: `action(...)` + `createOptimisticStore` + generators
- **Derived state**: `createSignal(fn)` and `createStore(fn)` for derived-but-writable
- **`createEffect` split**: Separate compute and apply phases
- **`onMount` → `onSettled`**: Supports cleanup, operates after async deps resolve

### [`@solidjs/signals`](https://github.com/solidjs/signals) — Standalone Package (NEW)

**Published**: `@solidjs/signals` 0.13.5 (beta). Zero dependencies. MIT. Works in Node/Bun — no DOM, no JSX, no components needed. This is the reactive foundation of [SolidJS](https://github.com/solidjs/solid) 2.0 Beta (released March 3, 2026).

**57 exports** including:

- **Core**: `createSignal`, `createMemo`, `createEffect`, `createReaction`, `flush`, `untrack`, `batch` (implicit)
- **Stores**: `createStore`, `createProjection`, `createOptimistic`, `createOptimisticStore`, `reconcile`, `snapshot`, `merge`, `deep`
- **Async**: `action`, `isPending`, `latest`, `refresh`, `isRefreshing`, `resolve`, `createLoadingBoundary`
- **Ownership**: `createRoot`, `createOwner`, `runWithOwner`, `getOwner`, `onCleanup`, `onSettled`
- **Context**: `createContext`, `getContext`, `setContext`

**Size**: 36.3KB minified / **14KB gzipped** (vs [alien-signals](https://github.com/stackblitz/alien-signals) 1.8KB)

**Key differences from alien-signals / Preact**:

- **Getter API** — `count()` not `count.value()`. Fundamental to Solid's tracking — direct callable vs method on signal object.
- **Requires `createRoot()`** — ownership model for proper disposal
- **Microtask batching** — updates batched automatically, must call `flush()` for synchronous processing
- **Two-phase effects** — `createEffect(() => trackedValue(), (value) => { sideEffect })`
- **`createAsync` is not separate** — `createMemo` natively accepts async (Promise/AsyncIterable)

**Verdict**: The most featureful standalone signals library (stores, projections, async, optimistic — everything). Era2 now uses the same getter API (`count()` / `count(5)`) per Decision 29, so the API mismatch is gone. But the `createRoot()` ownership model, microtask batching with `flush()`, and 14KB size (8x alien-signals) make it heavier than needed. We take the _concepts_ (stores, projections, async) and build on alien-signals. If we ever need projections/optimistic updates built-in, `@solidjs/signals` is the obvious upgrade path.

### [`alien-deepsignals`](https://github.com/CCherry07/alien-deepsignals) — Deep Tracking for alien-signals

Adds Proxy-based deep tracking to alien-signals. ~2.7KB gzipped additional. Nested property access returns signals automatically — exactly what `createStore()` needs.

Similarly, [`deepsignal`](https://github.com/CCherry07/alien-deepsignals) adds deep tracking to `@preact/signals-core` for ~1.0KB additional.

### Annual Framework Reviews

- **"Heading into 2025"**: "Pretty much all non-React frameworks run off Signals now." Svelte 5 runes = "syntactical sugar over fine-grained Signals similar to SolidJS since 2018."
- **"Heading into 2026"**: Performance-focused momentum shifted to "strategic thinking." Real evolution is async-first. Frameworks converged on "a similar language of state, derived state, and effects."

## Major Signals Libraries

### [Preact Signals](https://github.com/preactjs/signals) (`@preact/signals-core`)

- **API**: `signal(value)`, `computed(fn)`, `effect(fn)`, `batch(fn)`
- **Architecture**: Push-pull hybrid with lazy evaluation
- **Standalone**: `@preact/signal-core` works without Preact (700 bytes)
- **React integration**: `@preact/signals-react` wraps React components — but fundamentally fights React's model
- **Status**: Mature, widely used, good reference implementation

### [alien-signals](https://github.com/stackblitz/alien-signals)

- **Author**: Johnson Chu (creator of Vue Language Tools / Volar)
- **Performance**: Fastest signals implementation in benchmarks (~400% faster than Preact signals)
- **Adoption**: ~3M weekly npm downloads. **Vue 3.6 ported the alien-signals algorithm** (PR vuejs/core#12349) — 13-14% memory reduction. Also used by XState.
- **API**: `signal()`, `computed()`, `effect()` — minimal. `createReactiveSystem()` factory for custom systems. Native API uses `value()` callable pattern; era2 wraps as direct callable accessors (`sig()` / `sig(5)`) per Decision 29.
- **Architecture**: Push-pull with version counting. Doubly-linked list (`Link` structure) for O(1) dependency tracking (no Array/Set/Map). Three-phase: Propagation → Dirty Checking → Shallow Propagation. No recursion — manual stack-based iteration.
- **Size**: ~1KB
- **Limitations**: No stores/deep tracking, no batching primitive (auto-batches), no React integration
- **Relevance to era2**: Best candidate for the signals engine. MIT license, fastest, proven at scale (Vue 3.6). Build stores/hooks on top.

### [Angular](https://github.com/angular/angular) Signals (Angular 17+)

- **API**: `signal(value)`, `computed(fn)`, `effect(fn)`
- **`linkedSignal()`** (Angular 19): Derived signal with reset capability — when source changes, derived recomputes, but can also be manually written to (reverts to derived on next source change)
- **`resource()`**: Async signal — wraps a promise into a signal with `.value`, `.loading`, `.error`
- **Driving change**: Moving Angular away from Zone.js monkey-patching toward fine-grained, signal-driven change detection
- **Status**: Stable, production-ready, evolving

### [Vue 3](https://github.com/vuejs/core) Reactivity (`@vue/reactivity`)

- **API**: `ref(value)`, `computed(fn)`, `watchEffect(fn)`, `reactive(obj)` (deep proxy)
- **`reactive()`**: Deep proxy tracking — any property access on a reactive object is tracked, any mutation triggers dependents. This is the store pattern Solid also has.
- **Standalone**: `@vue/reactivity` works outside Vue
- **Architecture**: Proxy-based, push with lazy pull for computed
- **Status**: Mature, battle-tested

### [Svelte 5](https://github.com/sveltejs/svelte) Runes

- **API**: `$state`, `$derived`, `$effect` — compiler directives, not runtime calls
- **Innovation**: Signals as language-level constructs. `let count = $state(0)` compiles to signal creation; `count++` compiles to signal write. Developer writes plain JavaScript.
- **No runtime library**: The compiler generates the reactive wiring
- **Status**: Stable in Svelte 5 (released late 2024)
- **Relevance to era2**: Not directly applicable (silvery uses React, not a compiler), but the insight matters — signals should be invisible where possible. Era2's `createModel` + auto-unwrapping selectors already go in this direction.

### Jotai / Zustand (How They Relate)

- **Zustand**: NOT signals. Immutable store with selectors. O(n) selector fanout — every selector runs on every update. React-first.
- **Jotai**: Atomic state (closer to signals). Each atom is independently subscribable. Bottom-up composition. But still React-specific (atoms are React state).
- **Key difference**: Signals are framework-agnostic reactive primitives. Zustand/Jotai are React state management patterns.
- **Era2 migration**: Moving from Zustand (@silvery/tea today) to signals (era2) because signal references are stable objects (incompatible with Zustand's `Object.is` change detection) and O(1) subscriptions vs O(n) selectors.

### Vue 3 Reactivity (`@vue/reactivity`)

- **Vue 3.6 adopted alien-signals algorithm** — Johnson Chu contributed directly (PR #12349)
- **Vapor Mode**: Eliminates VDOM overhead; direct granular DOM instructions; 100K components in ~100ms; bundle under 10KB
- `reactive()` deep proxy, `ref()` shallow, `computed()` lazy
- **Standalone**: `@vue/reactivity` works outside Vue. Mature, battle-tested.

### Other Notable Libraries

| Library                    | Notes                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Signia**](https://github.com/tldraw/signia) (tldraw)        | Signals with **incremental computation** for large derived collections. Logical clocks instead of dirty flags. Built for 100K+ collaborative whiteboard nodes. |
| [**Starbeam**](https://github.com/starbeamjs/starbeam) (Yehuda Katz) | "Universal reactivity" — framework-agnostic. Renderers for React, Preact, Svelte. Reactive data structures (Map, Set). Contributed to TC39 proposal.           |
| [**Legend State**](https://github.com/LegendApp/legend-state)           | ~4KB, fine-grained signals for React/React Native. Local-first sync with optimistic updates. Persistence plugins.                                              |
| **Reactively**             | Lazy/pull-based. Among fastest in benchmarks. Efficient on wide dependency graphs.                                                                             |
| [**@maverick-js/signals**](https://github.com/maverick-js/signals)   | Used by Vidstack player. Ownership/disposal tree (like Solid).                                                                                                 |
| [**Effect-TS**](https://github.com/Effect-TS/effect)              | Structured concurrency + reactive streams. Fiber-based. Heavyweight but comprehensive.                                                                         |

## Advanced Problems Being Solved

### 1. Stores / Deep Tracking

**Problem**: `signal<User>({ name: "Alice", address: { city: "NYC" } })` — changing `address.city` replaces the entire user signal, causing all subscribers to re-run even if they only read `name`.

**Solutions**:

- **Solid `createStore`**: Deep proxy that tracks access at the property level. `store.address.city` is its own subscription.
- **Vue `reactive()`**: Same approach via Proxy.
- **Legend State**: Proxy-based for React.
- **Manual signals**: Wrap each field individually. Tedious but explicit.

**Era2**: `createStore()` with deep proxy tracking via [alien-deepsignals](https://github.com/CCherry07/alien-deepsignals). Property access at any depth returns callable accessors: `user.address.city()` to read, `user.address.city("LA")` to write. Decision 27. See [02-signals.md](./02-signals.md).

### 2. Async Derivations / Resources

**Problem**: Computed values that depend on async operations (API calls, DB queries).

**Solutions**:

- **Solid `createAsync`**: Returns a signal. Value is `undefined` during load, then resolves. Integrates with Suspense.
- **Angular `resource()`**: Signal wrapping a promise. `.value`, `.loading`, `.error`.
- **SWR/TanStack Query**: Not signals, but solve the same problem with caching.

**Era2**: `createResource(async () => fetcher())` bridges async into the signal graph. Returns callable accessor for data plus `.loading()` and `.error()` sub-accessors. Scope-integrated: parent dispose aborts in-flight fetches. Decision 28. See [02-signals.md](./02-signals.md).

### 3. Scheduling & Batching

**Problem**: Multiple signal writes should produce one update, not N.

| Library        | Strategy                                                           |
| -------------- | ------------------------------------------------------------------ |
| Preact signals | Explicit `batch(fn)`                                               |
| alien-signals  | Auto-batch in microtask                                            |
| Solid          | Automatic batching in `createEffect`, explicit `batch()` available |
| Angular        | Auto-batch via `effect()` scheduling                               |
| Vue            | `nextTick()` for DOM updates, synchronous for computed             |

**Era2**: Has `batch(fn)`. Scope tree could provide effect scheduling (sync vs microtask vs frame).

### 4. Glitch-Free Propagation

**Problem**: Diamond dependency — A depends on B and C, both depend on D. When D changes, A should see consistent B and C, not a state where B updated but C hasn't yet.

**Solution**: Topological sort of dependency graph (push-pull). All modern implementations handle this. Alien-signals uses version counting to avoid unnecessary recomputation.

### 5. Memory / Disposal

**Problem**: Effects and computed values that are no longer needed must be cleaned up to avoid memory leaks.

| Approach            | Used By                                                              |
| ------------------- | -------------------------------------------------------------------- |
| **Ownership tree**  | Solid — computations created inside a reactive scope are owned by it |
| **Manual dispose**  | Preact signals — `effect()` returns a dispose function               |
| **Scope/fiber**     | Effect-TS — structured concurrency fiber tree                        |
| **`using` keyword** | TC39 explicit resource management — `using scope = createScope()`    |

**Era2**: Scope tree with `[Symbol.dispose]()` and `using` cleanup. Well-aligned with the `using` direction.

### 6. Concurrent / Transitional UI

**Problem**: Start computing new state, but keep showing old UI until it's ready (avoid flicker).

**Solutions**:

- **Solid `startTransition`**: Forks the reactive graph, runs updates in the fork, swaps when ready
- **React `useTransition`**: Similar but at the React scheduler level
- **No signals-level solution exists**: This is framework-level, above signals

**Era2**: Partially addressed via structured concurrency. The scope tree provides cancellation cascades (`scope.cancelled`), scope-aware timers (`scope.sleep()`, `scope.timeout()`), and parent-owns-children lifecycle. No `startTransition` fork-and-swap equivalent — that's framework-level (React already provides `useTransition`). A richer effects system with supervisor strategies is designed but deferred to post-v1. See [04-app.md](./04-app.md).

## Architectural Patterns

### Push vs Pull vs Push-Pull

| Model                              | How it works                                                | Trade-off                                         |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| **Push**                           | Writer notifies all subscribers immediately                 | Simple, but eagerly evaluates everything          |
| **Pull**                           | Reader asks for latest value on access                      | Lazy, but can't notify on change                  |
| **Push-pull** (industry consensus) | Push dirty notifications, pull actual values lazily on read | Best of both — only computes what's actually read |

All modern implementations use push-pull. alien-signals optimizes this with version counting.

### Effect Scheduling

| Strategy             | When effects run                               | Used by                         |
| -------------------- | ---------------------------------------------- | ------------------------------- |
| Synchronous          | Immediately on signal write                    | Manual `batch()` + sync effects |
| Microtask            | After current task, before next frame          | alien-signals, auto-batching    |
| Animation frame      | Before next paint                              | UI-specific effects             |
| Framework-controlled | Framework decides (React reconciliation, etc.) | Angular, React adapters         |

### Ownership & Disposal Trees

Solid pioneered this: reactive computations form a tree. When a parent disposes, all children dispose automatically. Era2's scope tree is this pattern generalized to structured concurrency.

## Era2 Alignment Summary

### What era2 gets right (aligned with industry)

- `signal()`, `derived()`, `batch()` — same shape as TC39, Preact, Solid, Angular
- `Readable<T>` interface — framework-agnostic, aligns with TC39 interop goals
- Scope tree with disposal — industry moving this direction (Solid ownership, `using` keyword)
- Commands as self-describing objects — **ahead of the industry** (AI-native, cross-surface)
- Plugin composition — clean, composable, well-designed

### What era2 adopted from external work

1. **alien-signals as reactive engine** — Decision 26. Fastest, smallest, MIT. `@silvery/signals` re-exports core primitives.
2. **`createStore()` deep proxy** — Decision 27. Built on alien-deepsignals. Essential for km's tree model.
3. **`createResource()` async bridge** — Decision 28. Inspired by Solid's `createAsync` and Angular's `resource()`. Scope-integrated cancellation.
4. **Callable accessor pattern** — Decision 29. `sig()` / `sig(5)` — same as Angular, SolidJS. Wraps alien-signals' `value()`.

### What era2 should still adopt

1. **Projections / reactive collections** — Build `alien-projections` (~150 lines): `createProjection(source, { key, map, filter?, sort? })` → incremental derived collection. Only re-maps changed entries. Publish as standalone package for the alien-signals ecosystem.
2. **Async resources** — Build `alien-resources` (~100 lines): `createResource(fetcher)` → signal with `.loading()`, `.error()`, AbortController cancellation. Complements alien-signals like alien-deepsignals does.
3. **Rich effects system** — Serializable effect descriptors, supervisor strategies. Designed but deferred to post-v1.

### Signal-agnosticism (2026-03-20)

**Silvery's renderer (Ag) has zero signal dependencies.** The rendering pipeline is pure imperative code (dirty flags + scheduler), not reactive subscriptions. Signals are entirely at the App layer (`@silvery/model`, `@silvery/commands`).

The App layer depends on **`Readable<T>` (`{ (): T, subscribe }`)** — not on any signal package. `@silvery/signals` is the default implementation, but Preact signals match natively, and others adapt via thin wrappers. This contract is simpler and more stable than TC39 signals (which use `.get()` not `()`). TC39 signals would need a wrapper.

**`@silvery/tea` is already nearly backend-agnostic** — it uses only `get()` and `set()` from zustand. The TEA runtime (`createStore()`) has zero zustand dependency. Refactoring tea as a plugin system (zustand/signals/valtio backends via a `StateBackend<S>` interface) is a trivial ~10-line adapter per backend.

**Recommendation**: Don't depend on TC39 signals (Stage 1, may stall). Keep `Readable<T>` as silvery's contract. Ship `@silvery/signals` (alien-signals) as default. The renderer stays signal-agnostic.

### Entity signals pattern (2026-03-20)

**The problem**: km has 1000-5000 tree nodes. With zustand, every `useStore(selector)` runs on every state change — O(n) selector evaluations. When the cursor moves, all 1000 card selectors fire even though only 2 cards changed.

**Industry approaches** (ranked by granularity):

| Pattern | Granularity | Example | Memory/entity |
|---------|-------------|---------|---------------|
| Centralized store + selectors | Whole-store (O(n)) | Zustand `useStore(s => s.nodes[id])` | ~0 |
| Store + atom bridge | Per-atom (O(1)) | jotai-zustand `createAtomicStore` ([PR #8](https://github.com/jotaijs/jotai-zustand/pull/8)) | ~200-400 bytes |
| Entity signals | Per-entity (O(1)) | `Map<id, Signal<NodeState>>` | ~100-200 bytes |
| Deep proxy | Per-property (O(1)) | alien-deepsignals, valtio, MobX | ~50-100 bytes/accessed leaf |

**Decker precedent**: decker-boardliner's `boardState.ts` projects `selectedIds` into per-item `ItemState` objects in a `Map<ItemElement, ItemState>`. The infrastructure exists but components still subscribe to global `selectedIds` (the TODO for per-item subscription was never completed). Shows the need is real even in simpler apps.

**km's path**: Entity signals via `createStore()` (alien-deepsignals). Each node's properties are independently trackable:
```typescript
const board = createStore({ nodes: { "id1": { title: "...", selected: false } } })
board.nodes.id1.selected()  // independent subscription — O(1)
```

**Caveat**: Deep proxy handles nested objects well but dynamic key additions (new nodes) trigger the parent signal. For entity add/remove, maintain a separate collection-level signal or use `Map<string, Signal<NodeState>>` explicitly.

**Projection for selection** (the decker pattern, done right):
```typescript
const selectedIds = signal<string[]>([])
effect(() => {
  const ids = new Set(selectedIds())
  for (const [id, state] of nodeStates) {
    const selected = ids.has(id)
    if (state().selected !== selected) state({ ...state(), selected })
  }
})
// O(n) scan runs once → only 2 signal writes → only 2 card re-renders
```

### What era2 has that nobody else does

- **Command unification** — one definition drives keyboard, CLI, palette, MCP, tests
- **AI-native design** — self-describing, discoverable, automatable
- **Terminal + web portability** — same model, different surface adapters
- **op() interception proxy** — transparent undo/tracing/recording without middleware
- **`Readable<T>` contract** — signal-agnostic reactivity (renderer has zero signal deps)

## `@silvery/signals` Package Design

### Current State in Silvery

- `vendor/silvery/docs/reference/signals.md` — documents the era2 signal API with alien-signals
- `apps/km-tui/src/reactive.ts` — legacy `Reactive<T>` class (hand-rolled signal with `.value` + `.subscribe()`) — to be replaced by `signal()`
- `@silvery/tea` uses Zustand — era2 replaces this with signals
- `@silvery/signals` package designed but not yet implemented

### Recommendation: Thin Layer over alien-signals

Don't build a signals engine. Use alien-signals as the core (getter/setter function-call pattern) and add silvery-specific layers:

```
@silvery/signals
├── Core (re-export alien-signals)
│   signal(), computed(), effect(), batch()
│   Read: sig()  Write: sig(newValue)
│
├── Stores (alien-deepsignals)
│   createStore<T>(initial) → deep proxy with getter/setter accessors
│
├── Resources (silvery-built, scope-integrated)
│   createResource<T>(fetcher) → res() for data, res.loading(), res.error()
│
├── React Integration (silvery-built)
│   useSignal(signal) → T  (via useSyncExternalStore)
│   useStore(store, selector) → T
│
└── Types
    Accessor<T> = () => T           (read-only)
    Signal<T> = Accessor<T> & (v: T) => void  (read-write)
```

### Why alien-signals over alternatives?

| Criteria              | alien-signals              | @preact/signals-core       | @solidjs/signals                 | @vue/reactivity                  |
| --------------------- | -------------------------- | -------------------------- | -------------------------------- | -------------------------------- |
| **Speed**             | Fastest (benchmark leader) | Good                       | Not benchmarked yet              | Good (uses alien-signals in 3.6) |
| **Size (gzip)**       | 1.8KB                      | 1.9KB                      | **14KB**                         | ~10KB                            |
| **API**               | `value()` callable         | `.value`                   | **`getter()`**                   | `.value`                         |
| **Deep stores**       | +alien-deepsignals (2.7KB) | +deepsignal/core (1.0KB)   | Built-in `createStore`           | Built-in `reactive()`            |
| **Async**             | No (build on top)          | No                         | Built-in (memo + Promise)        | No                               |
| **Projections**       | No                         | No                         | Built-in `createProjection`      | No                               |
| **Optimistic**        | No                         | No                         | Built-in `createOptimisticStore` | No                               |
| **Ownership**         | `effectScope()`            | `effect()` returns dispose | Full tree (createRoot)           | No                               |
| **React hooks**       | No (build on top)          | Yes (separate pkg)         | No                               | No                               |
| **Framework baggage** | None                       | Preact-flavored            | Solid ownership model            | Vue-flavored                     |
| **Production proven** | Vue 3.6, XState            | Preact ecosystem           | SolidJS 2.0 beta                 | Vue ecosystem                    |

**Decision**: alien-signals + alien-deepsignals (~4.5KB total) for era2. Fastest, smallest with deep tracking. Era2 wraps with callable accessors (`sig()` / `sig(5)`) per Decision 29 — same pattern as Angular and SolidJS. Build `createResource()` on scope tree. Watch `@solidjs/signals` projections for future adoption.

### Migration Path

```typescript
// Before (reactive.ts)
const cursor = new Reactive<string | null>(null)
cursor.value = "node-1"           // write via .value
const v = cursor.value            // read via .value
cursor.subscribe(() => { ... })   // manual subscribe

// After (@silvery/signals)
const cursor = signal<string | null>(null)
cursor("node-1")                  // write via function call
const v = cursor()                // read via function call
effect(() => { console.log(cursor()) })  // auto-tracking
```

The km-tui `Reactive<T>` class is a subset of what alien-signals provides. Migration: replace `new Reactive(v)` with `signal(v)`, replace `.value` reads with `()`, replace `.value =` writes with `(newValue)`, replace manual `subscribe()` with `effect()` or `computed()`.

### What To Take From Each Library

| Concept                 | Source                                     | How to Adopt                                                           |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| Core signals engine     | alien-signals                              | Re-export as `@silvery/signals`                                         |
| Deep store proxy        | alien-deepsignals                          | Use directly — adds Proxy tracking to alien-signals                    |
| Async resources         | Solid `createAsync` concept                | Build on signals + scope tree (Solid's uses memo + Promise internally) |
| Projections             | `@solidjs/signals` `createProjection`      | Study API when stable, build accessor-based equivalent                 |
| Optimistic updates      | `@solidjs/signals` `createOptimisticStore` | Future — study pattern, build on stores                                |
| Incremental computation | Signia (tldraw)                            | Consider for large tree operations                                     |
| React integration       | km's `useReactive` pattern                 | Generalize into `useSignal()` hook via `useSyncExternalStore`          |

## Key Repos & Resources

- [`tc39/proposal-signals`](https://github.com/tc39/proposal-signals) — TC39 signals proposal
- [`preactjs/signals`](https://github.com/preactjs/signals) — Preact signals (reference implementation)
- [`stackblitz/alien-signals`](https://github.com/stackblitz/alien-signals) — Fastest signals engine
- [`solidjs/solid`](https://github.com/solidjs/solid) — SolidJS (signals + stores + projections in 2.0)
- [`solidjs/signals`](https://github.com/solidjs/signals) — Standalone signals package (`@solidjs/signals`)
- [`vuejs/core`](https://github.com/vuejs/core) — Vue 3 reactivity (`@vue/reactivity` standalone)
- [`angular/angular`](https://github.com/angular/angular) — Angular signals
- [`sveltejs/svelte`](https://github.com/sveltejs/svelte) — Svelte 5 runes
- Ryan Carniato's "Beyond Signals" talk (JSNation US 2025) — projections concept
- Ryan Carniato's blog (dev.to/ryansolid, ryansolid.medium.com)
- Ryan Carniato's 4-part Reactivity series (dev.to/this-is-learning/) — derivations, scheduling, async, mutable
- [`solidjs/solid`](https://github.com/solidjs/solid) releases — v2.0.0-beta.0 (March 2026)
- [`vuejs/core`](https://github.com/vuejs/core) PR #12349 — Vue 3.6 alien-signals adoption
- [`tldraw/signia`](https://github.com/tldraw/signia) — incremental computation signals
- [`starbeamjs/starbeam`](https://github.com/starbeamjs/starbeam) — universal reactivity
- [`LegendApp/legend-state`](https://github.com/LegendApp/legend-state) — fine-grained React signals
- [`transitive-bullshit/ts-reactive-comparison`](https://github.com/transitive-bullshit/ts-reactive-comparison) — 15-library comparison
- [`milomg/js-reactivity-benchmark`](https://github.com/milomg/js-reactivity-benchmark) — performance benchmarks
