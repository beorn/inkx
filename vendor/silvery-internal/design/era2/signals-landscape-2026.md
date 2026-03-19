# JS Signals Landscape & Era2 Alignment

> Research as of 2026-03-19. Covers TC39 proposal, major frameworks, emerging libraries, and how era2 compares.

## TC39 Signals Proposal (Stage 1)

- **Champions**: Daniel Ehrenberg (Bloomberg), Rob Eisenberg, with input from Ryan Carniato, the Angular team, and others
- **Repo**: `tc39/proposal-signals`
- **Status**: Stage 1 since April 2024, active development, polyfill available
- **API**: `Signal.State(initialValue)` (writable), `Signal.Computed(fn)` (derived)
- **Goal**: Interop layer so frameworks can share reactive graphs — not a replacement for framework-level features
- **Key detail**: `Signal.subtle.Watcher` — low-level hook for frameworks to schedule their own effect execution (sync, microtask, animation frame)
- **Relevance to era2**: The `Readable<T>` interface (`{ value, subscribe }`) aligns with the proposal's interop goals. Era2 could adopt TC39 signals as the interop contract while using a faster implementation internally.

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

### `@solidjs/signals` — Standalone Package (NEW)

**Published**: `@solidjs/signals` 0.13.5 (beta). Zero dependencies. MIT. Works in Node/Bun — no DOM, no JSX, no components needed. This is the reactive foundation of SolidJS 2.0 Beta (released March 3, 2026).

**57 exports** including:
- **Core**: `createSignal`, `createMemo`, `createEffect`, `createReaction`, `flush`, `untrack`, `batch` (implicit)
- **Stores**: `createStore`, `createProjection`, `createOptimistic`, `createOptimisticStore`, `reconcile`, `snapshot`, `merge`, `deep`
- **Async**: `action`, `isPending`, `latest`, `refresh`, `isRefreshing`, `resolve`, `createLoadingBoundary`
- **Ownership**: `createRoot`, `createOwner`, `runWithOwner`, `getOwner`, `onCleanup`, `onSettled`
- **Context**: `createContext`, `getContext`, `setContext`

**Size**: 36.3KB minified / **14KB gzipped** (vs alien-signals 1.8KB)

**Key differences from alien-signals / Preact**:
- **Getter API** — `count()` not `count.value`. Fundamental to Solid's tracking.
- **Requires `createRoot()`** — ownership model for proper disposal
- **Microtask batching** — updates batched automatically, must call `flush()` for synchronous processing
- **Two-phase effects** — `createEffect(() => trackedValue(), (value) => { sideEffect })`
- **`createAsync` is not separate** — `createMemo` natively accepts async (Promise/AsyncIterable)

**Verdict**: The most featureful standalone signals library (stores, projections, async, optimistic — everything). But the getter API (`count()` vs `.value`) and ownership model don't align with era2's `.value` convention. The 14KB size is also 8x alien-signals. Better to take the *concepts* and implement on top of a `.value`-based engine. **However**: if era2 ever reconsiders the `.value` convention, `@solidjs/signals` would be the obvious choice — it has everything built in.

### `alien-deepsignals` — Deep Tracking for alien-signals

Adds Proxy-based deep tracking to alien-signals. ~2.7KB gzipped additional. Nested property access returns signals automatically — exactly what `createStore()` needs.

Similarly, `deepsignal/core` adds deep tracking to `@preact/signals-core` for ~1.0KB additional.

### Annual Framework Reviews

- **"Heading into 2025"**: "Pretty much all non-React frameworks run off Signals now." Svelte 5 runes = "syntactical sugar over fine-grained Signals similar to SolidJS since 2018."
- **"Heading into 2026"**: Performance-focused momentum shifted to "strategic thinking." Real evolution is async-first. Frameworks converged on "a similar language of state, derived state, and effects."

## Major Signals Libraries

### Preact Signals (`@preact/signal-core`)

- **API**: `signal(value)`, `computed(fn)`, `effect(fn)`, `batch(fn)`
- **Architecture**: Push-pull hybrid with lazy evaluation
- **Standalone**: `@preact/signal-core` works without Preact (700 bytes)
- **React integration**: `@preact/signals-react` wraps React components — but fundamentally fights React's model
- **Status**: Mature, widely used, good reference implementation

### alien-signals

- **Author**: Johnson Chu (creator of Vue Language Tools / Volar)
- **Performance**: Fastest signals implementation in benchmarks (~400% faster than Preact signals)
- **Adoption**: ~3M weekly npm downloads. **Vue 3.6 ported the alien-signals algorithm** (PR vuejs/core#12349) — 13-14% memory reduction. Also used by XState.
- **API**: `signal()`, `computed()`, `effect()` — minimal. `createReactiveSystem()` factory for custom systems.
- **Architecture**: Push-pull with version counting. Doubly-linked list (`Link` structure) for O(1) dependency tracking (no Array/Set/Map). Three-phase: Propagation → Dirty Checking → Shallow Propagation. No recursion — manual stack-based iteration.
- **Size**: ~1KB
- **Limitations**: No stores/deep tracking, no batching primitive (auto-batches), no React integration
- **Relevance to era2**: Best candidate for the signals engine. MIT license, `.value` API, fastest, proven at scale (Vue 3.6). Build stores/hooks on top.
- **Repo**: `stackblitz/alien-signals`

### Angular Signals (Angular 17+)

- **API**: `signal(value)`, `computed(fn)`, `effect(fn)`
- **`linkedSignal()`** (Angular 19): Derived signal with reset capability — when source changes, derived recomputes, but can also be manually written to (reverts to derived on next source change)
- **`resource()`**: Async signal — wraps a promise into a signal with `.value`, `.loading`, `.error`
- **Driving change**: Moving Angular away from Zone.js monkey-patching toward fine-grained, signal-driven change detection
- **Status**: Stable, production-ready, evolving

### Vue 3 Reactivity (`@vue/reactivity`)

- **API**: `ref(value)`, `computed(fn)`, `watchEffect(fn)`, `reactive(obj)` (deep proxy)
- **`reactive()`**: Deep proxy tracking — any property access on a reactive object is tracked, any mutation triggers dependents. This is the store pattern Solid also has.
- **Standalone**: `@vue/reactivity` works outside Vue
- **Architecture**: Proxy-based, push with lazy pull for computed
- **Status**: Mature, battle-tested

### Svelte 5 Runes

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

| Library | Notes |
|---------|-------|
| **Signia** (tldraw) | Signals with **incremental computation** for large derived collections. Logical clocks instead of dirty flags. Built for 100K+ collaborative whiteboard nodes. |
| **Starbeam** (Yehuda Katz) | "Universal reactivity" — framework-agnostic. Renderers for React, Preact, Svelte. Reactive data structures (Map, Set). Contributed to TC39 proposal. |
| **Legend State** | ~4KB, fine-grained signals for React/React Native. Local-first sync with optimistic updates. Persistence plugins. |
| **Reactively** | Lazy/pull-based. Among fastest in benchmarks. Efficient on wide dependency graphs. |
| **@maverick-js/signals** | Used by Vidstack player. Ownership/disposal tree (like Solid). |
| **Effect-TS** | Structured concurrency + reactive streams. Fiber-based. Heavyweight but comprehensive. |

## Advanced Problems Being Solved

### 1. Stores / Deep Tracking

**Problem**: `signal<User>({ name: "Alice", address: { city: "NYC" } })` — changing `address.city` replaces the entire user signal, causing all subscribers to re-run even if they only read `name`.

**Solutions**:
- **Solid `createStore`**: Deep proxy that tracks access at the property level. `store.address.city` is its own subscription.
- **Vue `reactive()`**: Same approach via Proxy.
- **Legend State**: Proxy-based for React.
- **Manual signals**: Wrap each field individually. Tedious but explicit.

**Era2 gap**: No store primitive yet. `signal<T>` is flat. For km's tree model (nodes with children, properties, metadata), a store/proxy approach would be much more ergonomic.

### 2. Async Derivations / Resources

**Problem**: Computed values that depend on async operations (API calls, DB queries).

**Solutions**:
- **Solid `createAsync`**: Returns a signal. Value is `undefined` during load, then resolves. Integrates with Suspense.
- **Angular `resource()`**: Signal wrapping a promise. `.value`, `.loading`, `.error`.
- **SWR/TanStack Query**: Not signals, but solve the same problem with caching.

**Era2 status**: Providers are async, signals are sync. No bridge primitive yet. `createAsync`-style resource signals would help.

### 3. Scheduling & Batching

**Problem**: Multiple signal writes should produce one update, not N.

| Library | Strategy |
|---------|----------|
| Preact signals | Explicit `batch(fn)` |
| alien-signals | Auto-batch in microtask |
| Solid | Automatic batching in `createEffect`, explicit `batch()` available |
| Angular | Auto-batch via `effect()` scheduling |
| Vue | `nextTick()` for DOM updates, synchronous for computed |

**Era2**: Has `batch(fn)`. Scope tree could provide effect scheduling (sync vs microtask vs frame).

### 4. Glitch-Free Propagation

**Problem**: Diamond dependency — A depends on B and C, both depend on D. When D changes, A should see consistent B and C, not a state where B updated but C hasn't yet.

**Solution**: Topological sort of dependency graph (push-pull). All modern implementations handle this. Alien-signals uses version counting to avoid unnecessary recomputation.

### 5. Memory / Disposal

**Problem**: Effects and computed values that are no longer needed must be cleaned up to avoid memory leaks.

| Approach | Used By |
|----------|---------|
| **Ownership tree** | Solid — computations created inside a reactive scope are owned by it |
| **Manual dispose** | Preact signals — `effect()` returns a dispose function |
| **Scope/fiber** | Effect-TS — structured concurrency fiber tree |
| **`using` keyword** | TC39 explicit resource management — `using scope = createScope()` |

**Era2**: Scope tree with `[Symbol.dispose]()` and `using` cleanup. Well-aligned with the `using` direction.

### 6. Concurrent / Transitional UI

**Problem**: Start computing new state, but keep showing old UI until it's ready (avoid flicker).

**Solutions**:
- **Solid `startTransition`**: Forks the reactive graph, runs updates in the fork, swaps when ready
- **React `useTransition`**: Similar but at the React scheduler level
- **No signals-level solution exists**: This is framework-level, above signals

**Era2**: Not addressed. Could be relevant for km's board transitions (zoom in/out, detail pane).

## Architectural Patterns

### Push vs Pull vs Push-Pull

| Model | How it works | Trade-off |
|-------|-------------|-----------|
| **Push** | Writer notifies all subscribers immediately | Simple, but eagerly evaluates everything |
| **Pull** | Reader asks for latest value on access | Lazy, but can't notify on change |
| **Push-pull** (industry consensus) | Push dirty notifications, pull actual values lazily on read | Best of both — only computes what's actually read |

All modern implementations use push-pull. alien-signals optimizes this with version counting.

### Effect Scheduling

| Strategy | When effects run | Used by |
|----------|-----------------|---------|
| Synchronous | Immediately on signal write | Manual `batch()` + sync effects |
| Microtask | After current task, before next frame | alien-signals, auto-batching |
| Animation frame | Before next paint | UI-specific effects |
| Framework-controlled | Framework decides (React reconciliation, etc.) | Angular, React adapters |

### Ownership & Disposal Trees

Solid pioneered this: reactive computations form a tree. When a parent disposes, all children dispose automatically. Era2's scope tree is this pattern generalized to structured concurrency.

## Era2 Alignment Summary

### What era2 gets right (aligned with industry)

- `signal()`, `derived()`, `batch()` — same shape as TC39, Preact, Solid, Angular
- `Readable<T>` interface — framework-agnostic, aligns with TC39 interop goals
- Scope tree with disposal — industry moving this direction (Solid ownership, `using` keyword)
- Commands as self-describing objects — **ahead of the industry** (AI-native, cross-surface)
- Plugin composition — clean, composable, well-designed

### What era2 should adopt from external work

1. **alien-signals as implementation** — Don't build a signals engine. Use the fastest one. MIT, minimal, aligns with `Readable<T>`.
2. **`createStore()` deep proxy** — Essential for km's tree model. Adopt Solid's store pattern.
3. **`createAsync` / resource signals** — Bridge async providers to signals. Solid 2.0 has the best design here.
4. **Projections / reactive collections** — For VirtualList-level reactive lists. Watch Solid 2.0's `createProjection`.
5. **TC39 `Signal.subtle.Watcher`** — For flexible effect scheduling in the scope tree.

### What era2 has that nobody else does

- **Command unification** — one definition drives keyboard, CLI, palette, MCP, tests
- **AI-native design** — self-describing, discoverable, automatable
- **Terminal + web portability** — same model, different surface adapters
- **op() interception proxy** — transparent undo/tracing/recording without middleware

## `@silvery/signals` Package Design

### Current State in Silvery

- `vendor/silvery/docs/reference/signals.md` — references `@preact/signals-core` as the implementation
- `apps/km-tui/src/reactive.ts` — homemade `Reactive<T>` class (basically a hand-rolled signal with `.value` + `.subscribe()`)
- `@silvery/tea` uses Zustand — era2 replaces this with signals
- No `@silvery/signals` package exists yet

### Recommendation: Thin Layer over alien-signals

Don't build a signals engine. Use alien-signals as the core (getter/setter function-call pattern) and add silvery-specific layers:

```
@silvery/signal
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

| Criteria | alien-signals | @preact/signals-core | @solidjs/signals | @vue/reactivity |
|----------|--------------|---------------------|-----------------|-----------------|
| **Speed** | Fastest (benchmark leader) | Good | Not benchmarked yet | Good (uses alien-signals in 3.6) |
| **Size (gzip)** | 1.8KB | 1.9KB | **14KB** | ~10KB |
| **API** | `.value` | `.value` | **`getter()`** | `.value` |
| **Deep stores** | +alien-deepsignals (2.7KB) | +deepsignal/core (1.0KB) | Built-in `createStore` | Built-in `reactive()` |
| **Async** | No (build on top) | No | Built-in (memo + Promise) | No |
| **Projections** | No | No | Built-in `createProjection` | No |
| **Optimistic** | No | No | Built-in `createOptimisticStore` | No |
| **Ownership** | `effectScope()` | `effect()` returns dispose | Full tree (createRoot) | No |
| **React hooks** | No (build on top) | Yes (separate pkg) | No | No |
| **Framework baggage** | None | Preact-flavored | Solid ownership model | Vue-flavored |
| **Production proven** | Vue 3.6, XState | Preact ecosystem | SolidJS 2.0 beta | Vue ecosystem |

**Decision**: alien-signals + alien-deepsignals (~4.5KB total) for era2. Fastest, smallest with deep tracking, `.value` API matches era2 convention. Build `createResource()` on scope tree. Watch `@solidjs/signals` projections for future adoption.

**If we ever reconsider the `.value` convention**: `@solidjs/signals` would be the obvious all-in-one choice — 14KB gets signals + stores + async + projections + optimistic + ownership. But the getter API is a fundamental mismatch with era2's design.

### Migration Path

```typescript
// Before (reactive.ts)
const cursor = new Reactive<string | null>(null)
cursor.value = "node-1"           // write via .value
const v = cursor.value            // read via .value
cursor.subscribe(() => { ... })   // manual subscribe

// After (@silvery/signal)
const cursor = signal<string | null>(null)
cursor("node-1")                  // write via function call
const v = cursor()                // read via function call
effect(() => { console.log(cursor()) })  // auto-tracking
```

The km-tui `Reactive<T>` class is a subset of what alien-signals provides. Migration: replace `new Reactive(v)` with `signal(v)`, replace `.value` reads with `()`, replace `.value =` writes with `(newValue)`, replace manual `subscribe()` with `effect()` or `computed()`.

### What To Take From Each Library

| Concept | Source | How to Adopt |
|---------|--------|-------------|
| Core signals engine | alien-signals | Re-export as `@silvery/signal` |
| Deep store proxy | alien-deepsignals | Use directly — adds Proxy tracking to alien-signals |
| Async resources | Solid `createAsync` concept | Build on signals + scope tree (Solid's uses memo + Promise internally) |
| Projections | `@solidjs/signals` `createProjection` | Study API when stable, build `.value`-based equivalent |
| Optimistic updates | `@solidjs/signals` `createOptimisticStore` | Future — study pattern, build on stores |
| Incremental computation | Signia (tldraw) | Consider for large tree operations |
| React integration | km's `useReactive` pattern | Generalize into `useSignal()` hook via `useSyncExternalStore` |

## Key Repos & Resources

- `tc39/proposal-signals` — TC39 signals proposal
- `preactjs/signals` — Preact signals (reference implementation)
- `stackblitz/alien-signals` — Fastest signals engine
- `solidjs/solid` — SolidJS (signals + stores + projections in 2.0)
- `vuejs/core` — Vue 3 reactivity (`@vue/reactivity` standalone)
- `angular/angular` — Angular signals
- `sveltejs/svelte` — Svelte 5 runes
- Ryan Carniato's "Beyond Signals" talk (JSNation US 2025) — projections concept
- Ryan Carniato's blog (dev.to/ryansolid, ryansolid.medium.com)
- Ryan Carniato's 4-part Reactivity series (dev.to/this-is-learning/) — derivations, scheduling, async, mutable
- `solidjs/solid` releases — v2.0.0-beta.0 (March 2026)
- `vuejs/core` PR #12349 — Vue 3.6 alien-signals adoption
- `tldraw/signia` — incremental computation signals
- `starbeamjs/starbeam` — universal reactivity
- `LegendApp/legend-state` — fine-grained React signals
- `transitive-bullshit/ts-reactive-comparison` — 15-library comparison
- `milomg/js-reactivity-benchmark` — performance benchmarks
