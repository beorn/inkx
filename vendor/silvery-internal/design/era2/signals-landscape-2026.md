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

### SolidJS 2.0

- Major rewrite in progress (2024-2026)
- Rethinks `createEffect` (the most misused API in Solid 1.x) — replaced by more targeted primitives
- Introduces `createAsync` for async/server patterns (signal that updates when async operation completes, with loading/error states)
- `@solidjs/signals` extracted as standalone reactive core (usable outside Solid)

### "Beyond Signals" (JSNation 2024)

Carniato's thesis: **signals alone don't solve the hard problems**. The next frontier is **projections** — reactive data transformations over collections:

- **Problem**: When you `map()` a reactive array, naive signals recreate every mapped item on any array change. For a list of 1000 items where one changes, you need O(1) updates, not O(n).
- **Projections** = reactive list primitives (map, filter, sort, slice) that do fine-grained diffing internally
- Think of them as "reactive SQL views" — declarative transformations that maintain themselves incrementally
- Solid 2.0 will have `createProjection` as a first-class primitive
- **Relevance to era2**: km's VirtualList rendering tree nodes. Currently uses React reconciliation. Projections would let the model layer express "these 1000 nodes, filtered by status, sorted by date" as a reactive pipeline that updates O(1) when one node changes.

### Fine-Grained Reactivity as Frontier

Carniato argues the industry is converging on signals as the base primitive, but diverging on what goes *above* them:
- **Stores** (deep reactive objects) — Solid's `createStore`, Vue's `reactive()`
- **Projections** (reactive collections) — Solid 2.0
- **Resources** (async signals) — Solid's `createAsync`, Angular's `resource()`
- **Transitions** (concurrent UI) — Solid's `startTransition`, React's `useTransition`

## Major Signals Libraries

### Preact Signals (`@preact/signal-core`)

- **API**: `signal(value)`, `computed(fn)`, `effect(fn)`, `batch(fn)`
- **Architecture**: Push-pull hybrid with lazy evaluation
- **Standalone**: `@preact/signal-core` works without Preact (700 bytes)
- **React integration**: `@preact/signals-react` wraps React components — but fundamentally fights React's model
- **Status**: Mature, widely used, good reference implementation

### alien-signals

- **Author**: Johnson Chu (creator of Vue Language Tools / Volar)
- **Claim**: Fastest signals implementation (~400% faster than Preact signals on benchmarks)
- **API**: `signal()`, `computed()`, `effect()` — minimal, no batching primitive (auto-batches in microtask)
- **Architecture**: Push-pull with version counting (no dirty bit propagation). Novel approach to dependency tracking using linked lists instead of Sets.
- **Size**: ~1KB
- **Status**: Newer (2024), gaining traction in Vue ecosystem tooling
- **Relevance to era2**: Strong candidate for era2's signals implementation. MIT license, minimal API surface matches `Readable<T>`, fastest available.

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

### Other Notable Libraries

| Library | Notes |
|---------|-------|
| **@maverick-js/signals** | Used by Vidstack player. Ownership/disposal tree (like Solid). |
| **usignal** | Micro signals library (<500 bytes). |
| **reactively** | Academic approach — optimal lazy evaluation with topological ordering. |
| **Effect-TS** | Not signals per se, but structured concurrency + reactive streams. Fiber-based. Heavyweight. |
| **Legend State** | Proxy-based reactive state for React. Deep observation like Vue's `reactive()`. |

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

## Key Repos & Resources

- `tc39/proposal-signals` — TC39 signals proposal
- `preactjs/signals` — Preact signals (reference implementation)
- `stackblitz/alien-signals` — Fastest signals engine
- `solidjs/solid` — SolidJS (signals + stores + projections in 2.0)
- `vuejs/core` — Vue 3 reactivity (`@vue/reactivity` standalone)
- `angular/angular` — Angular signals
- `sveltejs/svelte` — Svelte 5 runes
- Ryan Carniato's "Beyond Signals" talk (JSNation 2024) — projections concept
- Ryan Carniato's blog (dev.to/ryansolid, ryansolid.medium.com)
