# Era 2 Design Decisions

_Status: living document. Extracted from state-api-redesign.md § Decisions + Design History._

Decisions are numbered for cross-reference. New decisions append; old ones are never renumbered.

## Decisions

1. **Two concerns, one `apply()`.** Model (state + behavior) and Runtime (I/O + lifecycle). One `app.apply()` pipeline; plugins wrap it. See [05-app.md](./05-app.md).

2. **SlateJS-style plugin composition.** Plugins wrap `app.apply()` via closure. One type: `(app: App) => App`.

3. **`op()` proxy for opt-in interception.** `op(app.model).chat.submit()` routes through `app.apply()`; direct calls bypass it.

4. **Commands are `{ fn, args? }` objects.** `fn` is the behavior (reads/writes signals directly), `args` is an optional schema with `.parse()`. No registry, no string IDs — commands are referenced directly.

5. **Surfaces are plugins.** A surface plugin contributes to both `app.model` (view state) and `app.rt` (I/O).

6. **No driver abstraction.** Three patterns: app plugins (definition-time), `run(app, fn)` (runtime), direct calls (tests).

   > Note: The `run(app, fn)` pattern evolved into `app.run()` as a method on the app object. See [00-architecture.md](./00-architecture.md) Part 0 — renderer provides `run()`, adapter wraps it.

7. **Plugin composition via spread.** TypeScript intersection types accumulate. Last-write-wins; dev mode warns on collisions.

8. **`createModel()` wraps factories into typed hooks.** Factory returns signals + methods; `createModel` adds `.get()`, `.create()`, selector hook. Dependencies via `Pick<typeof providers, ...>`.

   > Note: The `.get()` API is outdated. Per Decision 29, signals use callable accessors (`count()` to read, `count(5)` to write). Selectors call accessors explicitly: `useModel(todoModel, m => m.cursor())`. See [00-architecture.md](./00-architecture.md) Models section.

9. **Signal auto-unwrapping at the selector boundary.** `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`. Raw `.value` everywhere else.

   > ⚠️ **Superseded by Decision 29** — callable accessors (`count()` to read) eliminate the need for auto-unwrapping. Selectors call accessors explicitly: `m.exchanges().length`. No `.value`, no magic unwrap.

10. **Signals, not Zustand, as the state primitive.** Zustand is O(n) selector fanout; signals are O(1). Signal references are stable objects, incompatible with Zustand's `Object.is` change detection.

11. **React bridge as separate entry point.** `@silvery/tea/react`, `/svelte`, `/vue`.

12. **Function-calling style over discriminated unions.** Named methods, not switch-case dispatch.

13. **Async effects (future).** V1: direct provider calls + scope methods.

14. **Built-in timer effects.** `scope.timeout(ms, fn)` for one-shot, `scope.sleep(ms)` in async loops for intervals.

15. **Auto-cleanup via AbortSignal.** Cancellation propagates down; errors up. No effect outlives its parent.

16. **`.parse()` interface for args, not Zod-specific.** Framework depends only on `.parse()`.

17. **Structured concurrency via scope tree.** See [06-scopes.md](./06-scopes.md).

18. **`@silvery/tea` independence.** Keep as `@silvery/tea` for now; evaluate standalone after Silvery 1.0.

19. **`run()` owns lifecycle.** Creates root scope, applies `withTerminal()` by default, returns awaitable handle.

    > Note: Refined by [00-architecture.md](./00-architecture.md). `run()` is not a standalone function — renderer provides `app.run()`, adapter wraps it, and `withScope` wraps `run()` for root scope disposal. No default `withTerminal()`; rendering is opt-in via `withTerm()`.

20. **Async/await for updates, generators for content.** `async` yields control; `async function*` yields content.

21. **Providers are plain objects via `createProviders()`.** Single source of truth for I/O types.

22. **Per-invocation concurrency, not global serialization.** `fx.mutex(key)` for exclusive access; `fx.batch(updates)` for atomic batches.

23. **`Pick<typeof providers, ...>` for dependency declaration.** Three levels: concrete Pick → type alias Pick → named interfaces.

24. **Composition is plain objects, not pipelines.** Providers as typed objects; models via `createModel`; behavioral plugins for cross-cutting concerns only.

25. **No string keys in registration.** Provider/model names come from JS object property names, not string arguments.

26. **alien-signals as the reactive engine.** The `@silvery/signal` package re-exports alien-signals (fastest implementation, ~1KB, `.value` API, proven by Vue 3.6 adoption). Silvery adds layers on top: `createStore()` (deep proxy — Solid/Vue concept), `createResource()` (async bridge — Solid concept), `useSignal()` (React hook). Not Preact signals (slower, larger), not SolidJS (getter API mismatch, ownership complexity), not custom (unnecessary). See [signals-landscape-2026.md](./signals-landscape-2026.md).

    > Note: The choice of alien-signals stands, but the `.value` API description is outdated. Per Decision 29, the API uses callable accessors (`count()` / `count(5)`), which is alien-signals' native getter/setter pattern.

27. **`createStore()` for deep reactive state.** Signals are flat cells. For nested objects (km's tree model: nodes with children, properties, metadata), `createStore(initial)` returns a deep proxy where each property access returns/creates a signal. Inspired by Solid's `createStore` and Vue's `reactive()`, but using `.value` signals instead of getters. Lives in `@silvery/signal`.

    > Note: The "using `.value` signals instead of getters" description is outdated. Per Decision 29, the API uses callable accessors. Deep store properties are accessed as `items()[i].done()` (read) and mutated in place via the store proxy.

28. **`createResource()` for async signals.** Bridges async providers to sync signals. `createResource(fetcher)` returns a signal with `.value` (data), `.loading` (boolean signal), `.error` (signal). Built on signals + scope tree. Inspired by Solid's `createAsync` and Angular's `resource()`. Lives in `@silvery/signal`.

    > Note: The `.value` (data) description is outdated. Per Decision 29, `createResource()` returns a callable accessor: `profile()` to read data, `profile.loading()` for loading state. See [00-architecture.md](./00-architecture.md) headless test examples.

29. **Getter/setter function-call pattern, not `.value`.** Signals use `count()` to read and `count(5)` to write — same as alien-signals, Angular, and SolidJS. Not `.value` (Vue, Preact). Visual clarity (function call is obviously dynamic), capability separation (read-only accessor is just `() => T`), and no auto-unwrapping magic needed. Selectors call accessors explicitly: `m.exchanges().length`. Eliminates old P3/P5 auto-unwrap complexity. See [signals-landscape-2026.md](./signals-landscape-2026.md).

## Design History

- **2026-03-11**: Initial design finalized. Eight Sips, two-surface architecture, SlateJS plugins. Validated by O3 deep research.
- **2026-03-12**: Model shape decisions. Flat shape, providers not runners, async/await over generators for effects.
- **2026-03-12**: Two-surface rewrite. Replaced Runtime/App split with model + runtime.
- **2026-03-12**: Prototype (aichat-v2). Reduced 327-line TEA to ~140 lines, eliminated 12 of 14 message types.
- **2026-03-12**: App composition v2. Simplified four concerns → two. Introduced `op()` proxy.
- **2026-03-13**: Signals vs Zustand. O(n) fanout and `Object.is` incompatible with stable signal refs. Resolution: `createModel()` with Zustand-like API but O(1) perf.
- **2026-03-13**: Plugin composition. Generic accumulation via intersection types, not builder pattern.
- **2026-03-13**: `op()` ergonomics finalized. Method calls only, one op per call, cached proxy instances.
- **2026-03-16**: Era 2 implementation plan. Pre-phase validation, 7-phase rollout.
- **2026-03-19**: Signals implementation decision. alien-signals as reactive engine (decision 26). createStore for deep tracking (decision 27). createResource for async (decision 28). Based on comprehensive landscape research.
- **2026-03-19**: Getter/setter function-call pattern (decision 29). Switched from `.value` to `count()` / `count(5)`. Aligns with alien-signals native API, Angular, SolidJS. Eliminates auto-unwrap complexity.

---

_See also: [state-api-redesign.md](../archive/state-api-redesign.md) (original full design), [05-app.md](./05-app.md) (plugin design journey)._
