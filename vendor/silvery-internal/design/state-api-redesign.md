# Silvery API Redesign

_Status: finalized. Bead: km-5kh9r. Implementation: km-silvery.api-impl._

## The Problem

Six overlapping entry points (`createApp`, `createSlice`, `createEffects`, `createStore`, `tea()`, `run()`), four render variants, and state management coupled to the runtime. Users don't know which to pick or how they combine.

## The API at a Glance

Eight sips from `useState` to multi-target apps. Each step adds one thing. Nothing rewrites.

```tsx
// ── Sip 1: Just React ──────────────────────────────────────
import { run } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((key) => {
    if (key === "j") setCount((c) => c + 1)
  })
  return <Text>Count: {count}</Text>
}

await run(<Counter />)

// ── Sip 2: Shared state via signals ────────────────────────
import { run, signal } from "silvery"

const count = signal(0)

function Counter() {
  useInput((key) => {
    if (key === "j") count.value++
  })
  return <Text>Count: {count.value}</Text>
}

await run(<Counter />)

// ── Sip 3: Model with updates-as-data ──────────────────────
import { run, createModel, signal } from "silvery"

const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },
    toggle(s, { index }) {
      s.items.value[index].done ^= 1
    },
  },
})

await run(<TodoView />, { model: Todo })

// ── Sip 4: Commands + keybindings (plugin) ─────────────────
await run(
  <TodoView />,
  pipe(
    { model: Todo },
    withCommands({
      cursor_down: { name: "Move Down", update: "moveCursor", args: { delta: 1 } },
      toggle: { name: "Toggle", update: "toggle" },
      help: { name: "Help", action: () => openOverlay("help") },
    }),
    withKeybindings({ j: "cursor_down", k: "cursor_up", x: "toggle" }),
  ),
)

// Or with an opinionated plugin:
await run(<TodoView />, withVim({ model: Todo }))

// ── Sip 5: Effects-as-data (async) ──────────────────────────
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    // No effects — plain function
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },

    // The Silvery Way — await typed effects (scoped, abortable, traced)
    async save(s) {
      await fx.persist({ data: s.items.value })
    },

    // Multiple effects — await each
    async saveAndNotify(s) {
      await fx.persist({ data: s.items.value })
      await fx.toast({ message: "Saved!" })
    },

    // Sequential async — await returns typed result naturally
    async importAndSave(s, { url }) {
      const data = await fx.fetch(url) // Response — typed naturally
      s.items.value = data
      await fx.persist({ data })
    },

    // Built-in timer effects
    async startAutoSave(s) {
      s.autoSave.value = await fx.interval(30_000, "save") // Disposable handle
    },
    async stopAutoSave(s) {
      s.autoSave.value[Symbol.dispose]() // manual cleanup
    },
    async debouncedSearch(s, { query }) {
      s.query.value = query
      await fx.delay(300, "executeSearch") // fire "executeSearch" after 300ms
    },
  },
})

// ── Sip 6: Explicit runtime — full control ─────────────────
import { createRuntime, createReactView, createTerm } from "silvery"

const term = createTerm()
const view = createReactView(<TodoApp />, term)
const { run, render } = createRuntime({ term, fs })

const app = pipe({ model: Todo, view }, withVim(), withUndo())

const handle = run(app)

handle.apply({ update: "moveCursor", delta: 1 }) // push update
handle.apply("toggle") // by command name
handle.state.cursor.value // read state
handle.exit() // shutdown

// ── Testing — swap providers, same app ─────────────────────
const { run } = createRuntime({ term: { width: 80 }, fs: mockFs })
const handle = run(app)

handle.apply("cursor_down")
expect(handle.state.cursor.value).toBe(1)

// Model-only — no runtime needed
const todo = Todo.create()
todo.toggle({ index: 0 })
const effects = await collect(() => todo.save())
expect(effects).toContainEqual(fx.persist({ data: todo.state.items.value }))

// ── Different targets, same app ────────────────────────────
const app = pipe({ model: Todo }, withVim(), withUndo())

// Terminal
run({ ...app, view: createReactView(<TodoTUI />, term) })

// Browser xterm.js
run({ ...app, view: createReactView(<TodoTUI />, xterm) })

// Svelte
run({ ...app, view: createSvelteView(TodoSvelte, term) })

// Headless — no view, just ops
const handle = run(app)
for await (const op of websocket) handle.apply(op)
```

## Principles

1. **Runtime/App separation.** The runtime owns I/O and the event loop. The app is passive — pure state, pure update functions, pure views.
2. **React-native.** Your hooks, your state, your components work. Silvery adds terminal capabilities, not a new programming model.
3. **Native JS composition.** Plain objects, spread, function composition, async iterables. No framework-specific plugin/provider interfaces where JS already has the concept.
4. **State is optional and pluggable.** Use `useState`, `signal()`, Zustand, `createModel` — or nothing. The runtime doesn't care.
5. **The Silvery Way is opt-in.** The shiny path (updates-as-data, effects-as-data, commands) is always visible but never forced.

### State access: one primary, many projections

The **primary** way to read state is `handle.state` — a typed proxy of the model's signals. Every other access pattern is sugar over this:

| Context                  | Access                       | Notes                                                     |
| ------------------------ | ---------------------------- | --------------------------------------------------------- |
| **In-process (primary)** | `handle.state.cursor.value`  | Direct signal read — typed, reactive                      |
| **AI code mode**         | `state(s => s.cursor.value)` | Selector function — injected global, reads `handle.state` |
| **Command execute**      | `ctx.state.cursor.value`     | Same proxy via command context                            |
| **External (CLI/MCP)**   | `getState()` → JSON          | Serialized snapshot for remote consumers                  |
| **Tests**                | `handle.state.cursor.value`  | Same as in-process                                        |

`handle.state` is canonical. `state(selector)` in AI code mode is a convenience wrapper. `getState()` returns a serialized snapshot for consumers that can't hold a reference. Don't introduce new access patterns.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│ Runtime (active)                                         │
│   Drives the event loop. Executes effects. Owns I/O.    │
│   Created with providers: term, fs, http, ...            │
│                                                          │
│   events → updates → apply(state, update) → effects     │
│     ↑                                          │        │
│     └────────── more updates ──────────────────┘        │
├──────────────────────────────────────────────────────────┤
│ App (passive)                                            │
│   Pure state + update functions + view.                  │
│   Composed with plugins (plain functions).               │
│                                                          │
│   model: state + updates (pure)                          │
│   view: state → UI (pure)                                │
│   commands: named intents with metadata                  │
└──────────────────────────────────────────────────────────┘
```

Inspired by Roc's platform model: the runtime is the platform, the app is pure logic. The app never does I/O — it returns effect descriptions. The runtime decides how to execute them.

## Two Layers

### Layer 1: Convenience (most users)

```tsx
import { run, render } from "silvery"

// One-shot output — sync, returns string
render(<Table data={rows} />)
render(<Table data={rows} />, { width: 80 })

// Interactive — zero config
await run(<Counter />)

// Interactive — with model and plugins
await run(<TodoApp />, withVim({ model: Todo }))
```

`run()` and `render()` are convenience wrappers that internally create a runtime, a React view, and wire everything together.

### Layer 2: Explicit (power users)

```tsx
import { createRuntime, createReactView, createModel } from "silvery"

// 1. Term — I/O target
const term = createTerm()

// 2. View — framework + target, self-contained
const view = createReactView(<TodoApp />, term)

// 3. Model — pure state + updates
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },
    toggle(s, { index }) {
      s.items.value[index].done ^= 1
    },
  },
})

// 4. App — compose with plugins (plain functions)
const app = pipe(
  { model: Todo, view },
  withCommands({
    cursor_down: { name: "Move Down", update: "moveCursor", args: { delta: 1 } },
    toggle: { name: "Toggle Done", update: "toggle" },
  }),
  withKeybindings({ j: "cursor_down", k: "cursor_up", x: "toggle" }),
  withUndo(),
)

// 5. Runtime — I/O providers
const { run, render } = createRuntime({ term, fs })

// 6. Run
const handle = run(app)
```

Three concepts, all composable:

- **Runtime** — I/O providers (term, fs, http). Created once, reused.
- **App** — pure logic (model, view, commands, keybindings). Composed with plugins.
- **View** — framework + render target. Self-contained. Runtime knows nothing about React.

## Key Mechanisms

### The inner loop

The runtime processes updates in two phases — **state mutations are synchronous**, effects are delegated to the scope tree:

```typescript
while (running) {
  // 1. Drain the sync queue (state mutations)
  while (queue.length > 0) {
    const update = queue.shift()!
    const scope = model.scope.createChild(update.name)

    if (update.isAsync) {
      // Async update: state mutations happen eagerly (signals),
      // effects run within the child scope (concurrent with other updates)
      scopeContext.run(scope, () => update.fn(state, update.args))
      // → await fx.fetch() inside the update looks up scope via ALS
      // → scope.run(effect) delegates to runner with { signal }
    } else {
      // Sync update: just mutate state, no scope needed
      update.fn(state, update.args)
    }
  }

  // 2. Wait for next event (only async point in the loop itself)
  const event = await nextEvent()
  queue.push(eventToUpdate(event))
}
```

State mutations via signals are synchronous and immediate — no microtask scheduling. High throughput for burst events (key repeat, paste). Effects are lazy: they execute only when `await`ed inside the update, delegated to the scope's runner with automatic `AbortSignal` threading.

**Concurrent async updates**: Multiple async updates on the same model can overlap — they each get their own child scope. State mutations happen eagerly via signals, so order matters: the last mutation wins. If you need serialization, use `fx.dispatch` to chain updates (the dispatched update runs after the current one). This is a deliberate choice: most updates are synchronous (no overlap), and the few async ones are I/O-bound with no competing mutations. If a future use case requires strict serialization, a `withSerialUpdates()` plugin can queue async updates per model.

### Plugins

`<T>(app: T) => T & NewStuff`. No plugin interface. Just functions that enrich objects:

```typescript
function withUndo<T extends { updates: Record<string, any> }>(app: T) {
  return {
    ...app,
    updates: { ...app.updates, undo(s) { ... }, redo(s) { ... } },
    keybindings: { ...app.keybindings, "ctrl+z": "undo", "ctrl+shift+z": "redo" },
  }
}
```

### Effects pipeline

Updates that have effects are **async functions** — they `await` typed `AsyncEffect` descriptors. Each `fx.*` function returns an `AsyncEffect<T>` that is both a plain data descriptor and a thenable. When `await`ed, it looks up the current scope via `AsyncLocalStorage` and delegates to the scope's effect runner. The scope automatically records the effect, traces it as a loggily span, and passes its `AbortSignal` to the runner. State mutations happen eagerly (via signals); effects are lazy (via `await`). See [scope-tree.md](./scope-tree.md) for the full scope tree design.

```
async update → state mutation + await AsyncEffect descriptors
  → AsyncEffect.then() → ALS scope lookup → scope.run(effect)
    → runner executes with { signal } → promise resolves → update continues

// No effects — plain function
moveCursor(s, { delta }) { s.cursor.value += delta }

// With effects — async function (await returns typed result naturally)
async save(s) { await fx.persist({ data: s.items.value }) }

// Sequential — each await is scoped, abortable, traced
async importAndSave(s, { url }) {
  const data = await fx.fetch(url)    // data: Response — typed naturally!
  s.items.value = data
  await fx.persist({ data })
}
```

**Testing**: `collect()` works for fire-and-forget effects (no runners needed). When downstream code depends on effect results, use `testScope()` with mock runners — same constraint as generators:

```typescript
// Fire-and-forget: collect() with no-op runners
const effects = await collect(() => todo.save(state))
expect(effects).toEqual([fx.persist({ data: items })])

// Data-dependent: mock runners required
const scope = testScope({ fetch: () => mockData })
await scope.run(() => todo.importAndSave(state, { url: "/api" }))
expect(scope.effects).toEqual([fx.fetch("/api"), fx.persist({ data: mockData })])
```

### Built-in timer effects

The runtime provides timer effect runners out of the box. No `useRef`/`useEffect` soup:

```typescript
fx.delay(ms, update) // fire update once after delay — AsyncEffect<void>
fx.interval(ms, update) // fire update repeatedly — AsyncEffect<Disposable>
```

Timer runners register cleanup on the scope's `DisposableStack`. **Auto-cleanup**: when the scope (model or app) cancels, all its timers are cancelled via `AbortSignal`. No forgotten `clearInterval`, no leaked refs.

```typescript
// Timer returns a Disposable handle for manual cleanup
async startAutoSave(s) {
  s.autoSave.value = await fx.interval(30_000, "save")
},
async stopAutoSave(s) {
  s.autoSave.value[Symbol.dispose]()   // manual cleanup
  // or: model unmount cancels scope → interval cleaned up automatically
},
```

### Cross-model dispatch

Models compose via `fx.dispatch()`:

```typescript
async confirm(s) {
  s.open.value = false
  await fx.dispatch(Board, "addItem", { text: s.value.value })
}
```

Runtime routes dispatch effects to the target model's instance. Type-safe — TypeScript infers valid update names and arg types from the Board model.

### Structured concurrency

Effects form a **scope tree**. Every scope owns its child effects and sub-scopes. Cancellation propagates down via `AbortSignal`, errors propagate up via promise rejection. No effect can outlive its parent scope. See [scope-tree.md](./scope-tree.md) for the full design.

```
Runtime (root scope, AbortController)
├── Model: Todo (scope, AbortController)
│   ├── fx.interval(30s, "save")          ← cancelled when Todo scope aborts
│   ├── fx.subscribe(events, "onEvent")   ← cancelled when Todo scope aborts
│   └── importAndSave                     ← async update = child scope
│       ├── fx.fetch(url)                 ← runner gets signal, aborts with scope
│       └── fx.persist(data)
├── Model: Navigation (scope, AbortController)
│   └── fx.interval(100, "scrollAnim")
└── View (scope, AbortController)
    └── fx.subscribe(resize, "onResize")
```

**Implicit scoping**: every model gets a scope with an `AbortController`. Every async update runs within a child scope of its model. Ongoing effects (intervals, subscriptions) register cleanup on their model's `DisposableStack`. The scope's `AbortSignal` is passed to runners automatically via `AsyncLocalStorage`. Users never write scoping code for the common case — it just works.

**Explicit scoping** for grouped operations:

```typescript
// All fetches run in parallel — if any fails, siblings are cancelled
async batchImport(s, { urls }) {
  const results = await fx.all(urls.map(url => fx.fetch(url)))
  await fx.persist({ data: results })
}
```

**Error handling**: runners reject promises on failure, so standard `try/catch` works. `AbortError` is thrown when a scope is cancelled:

```typescript
async importAndSave(s, { url }) {
  try {
    const data = await fx.fetch(url)
    s.items.value = data
    await fx.persist({ data })
  } catch (e) {
    if (e.name === "AbortError") return   // cancelled — nothing to do
    await fx.toast({ message: `Import failed: ${e.message}`, level: "error" })
  }
}
```

**Cleanup paths**:

1. **Auto** — scope cancels → `AbortSignal` fires → runners abort → `DisposableStack` cleans up (the default)
2. **Manual via handle** — `const timer = await fx.interval(...)` returns a `Disposable` handle
3. **Via `using`** — handles implement `Symbol.dispose` for scoped cleanup within a function

**Effect handles are disposable**:

```typescript
async startAutoSave(s) {
  s.autoSave.value = await fx.interval(30_000, "save")
  // handle is Disposable — has [Symbol.dispose]()
},
async stopAutoSave(s) {
  s.autoSave.value[Symbol.dispose]()
},
// But usually: model unmount → scope cancels → interval cleaned up automatically
```

### Scopes are spans: loggily integration

The scope tree and the observability tree are **the same tree**. Loggily provides span hierarchy, parent-child relationships, timing, `AsyncLocalStorage` context propagation, and the `Disposable` protocol. The `withTracing()` scope plugin wraps each `scope.run()` in a loggily span automatically.

```
Runtime scope tree                    Loggily span tree
──────────────────                    ──────────────────
Runtime (root scope)            →     SPAN app (root)
├── Model: Todo                 →       SPAN app:todo
│   ├── fx.interval(30s)        →         SPAN app:todo:autoSave (ongoing)
│   └── importAndSave           →         SPAN app:todo:importAndSave (246ms)
│       ├── fx.fetch(url)       →           SPAN app:todo:fetch (234ms) {url}
│       └── fx.persist(data)    →           SPAN app:todo:persist (12ms) {count: 42}
└── Model: Navigation           →       SPAN app:navigation
```

Every effect execution becomes a span with timing, attributes, and parent context — automatically. This gives you:

- **Observability for free** — every effect has duration, success/failure, custom attributes. `TRACE=1` shows the full scope tree with timing.
- **Scope tracking via `AsyncLocalStorage`** — loggily's context propagation automatically parents child effects to their enclosing scope.
- **Cancellation logged automatically** — when a scope cancels (unmount, error, manual), the span ends with cancellation metadata. Visible in traces.
- **DevTools = span viewer** — the live scope tree in DevTools is the live span tree.
- **Worker thread support** — loggily already forwards spans across worker threads.

Two concerns, two tools:

| What you're checking                                  | Tool                         | Data                                   |
| ----------------------------------------------------- | ---------------------------- | -------------------------------------- |
| **Effect logic** (what effects ran)                   | `scope.effects` (via plugin) | Effect descriptors — recorded via ALS  |
| **Execution observability** (how long, what happened) | Loggily spans (via plugin)   | Timing, attributes, errors, trace tree |

```typescript
// Effect testing: swap runners, inspect scope.effects
const scope = testRuntime.createScope("test")
await scope.run(() => todo.importAndSave(state, { url: "/api" }))
expect(scope.effects).toContainEqual(fx.fetch("/api"))
expect(scope.effects).toContainEqual(fx.persist(expect.anything()))

// Observability: loggily shows the scope tree with timing
// TRACE=1 bun run app
// → SPAN app:todo:importAndSave (246ms)
// →   SPAN app:todo:fetch (234ms) {url: "https://..."}
// →   SPAN app:todo:persist (12ms) {count: 42}

// Production: structured JSON traces
// TRACE_FORMAT=json bun run app
// → {"name":"app:todo:fetch","duration":234,"url":"https://...","traceId":"abc"}
```

No separate tracing infrastructure. No effect-specific logging. The scope system IS the tracing system. Loggily already has the tree, the timing, the `Disposable` protocol, the worker support, and `AsyncLocalStorage` context propagation. Silvery adds the semantics: cancellation propagation, error propagation, resource cleanup.

### Framework bindings

`@silvery/tea` is framework-agnostic. Thin bindings (~5-10 lines each):

```tsx
import { useModel } from "@silvery/tea/react" // useSyncExternalStore
import { useModel } from "@silvery/tea/svelte" // writable store bridge
import { useModel } from "@silvery/tea/vue" // ref() bridge
```

## How Silvery Compares

|               | Terminal          | State                                 | Events                 | Rendering                    |
| ------------- | ----------------- | ------------------------------------- | ---------------------- | ---------------------------- |
| **Ink**       | Hidden            | React hooks only                      | `useInput` hooks       | React (coupled to state)     |
| **Bubbletea** | Hidden            | Enforced TEA                          | Message dispatch       | Pure strings                 |
| **Ratatui**   | Explicit          | BYO                                   | Manual event loop      | Immediate mode               |
| **Textual**   | Hidden            | Reactive (auto)                       | Message queue          | Widget tree + CSS            |
| **Silvery**   | Explicit (`Term`) | BYO (signals, tea, Zustand, useState) | Commands + keybindings | React (decoupled from state) |

**From Bubbletea**: updates-as-data, effects-as-data, pure state machines — but opt-in, not enforced.
**From Ratatui**: explicit terminal, state decoupled from rendering — but with React's DX.
**From Ink**: React components, `run()` simplicity, hooks — but with a path out of the mess.
**From Roc**: pure app / I/O runtime separation — but in JS, not enforced by compiler.

The pitch: **Day 1, it's React for terminals. Day 30, when the pain hits, the Silvery Way is one sip away.**

## What Changes

| Current                                              | New                                                       | Why                             |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| `render()` / `renderSync()` / `renderStatic()`       | `render(el, config?)` — one function, returns string      | 4 → 1                           |
| `run(element)` + `createApp(config).run(element)`    | `run(el, config?)` or `createRuntime(providers).run(app)` | 2 → 1 (convenience) or explicit |
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel({ state, updates })`                         | 2 → 1                           |
| `useApp(selector)`                                   | `useModel(model, selector)`                               | Framework-agnostic              |
| `tea()`, `createStore()`                             | Removed                                                   | Internal, no longer needed      |
| Providers (DI with scoped contract)                  | Runtime providers (term, fs) + app plugins (functions)    | Clear separation                |
| keybindings in `createApp`                           | Plugin or config field on app                             | Composable                      |

## Decisions

1. **App shape** — Plain object is canonical. No `createApp()` wrapper needed — TypeScript infers types from spread and pipe. Optional `createApp()` for validation/defaults can come later if needed.

2. **Plugin composition** — Into sub-objects via spread. `withUndo()` merges into `updates`, `keybindings`, etc. TypeScript intersection types accumulate at each step.

3. **Naming: "updates"** — Keep "updates" for model ops (matches TEA's Msg/Update). Document the distinction from React setState clearly in guides. "Effects" for I/O. "Commands" for user intents.

4. **Provider interface** — Just an object with capabilities (term, fs, http). No formal getState/subscribe contract. Effect routing via discriminated union on `effect.target`. Providers are the runtime's I/O surface, nothing more.

5. **`model` vs `models`** — Keep separate. `model` for the common case (one state machine), `models` map for composition. Internally unified handling.

6. **Auto-signaling** — Deferred (P4). Explore Valtio-style proxy wrapping later. For now, explicit `signal()` is clearer and more predictable. See km-silvery.auto-signals.

7. **React bridge** — `@silvery/tea/react` as separate entry point. Keeps the core framework-agnostic. Same pattern for `/svelte`, `/vue`.

8. **Migration** — Deprecated wrappers for `createSlice`, `createApp`, `useApp` for one release cycle. Clear deprecation warnings pointing to new APIs.

9. **`@silvery/tea` independence** — Keep as `@silvery/tea` for now. Evaluate standalone (`silvertea`) after Silvery 1.0 establishes credibility. See km-silvery.tea-standalone.

10. **Unification** — Confirmed: don't over-unify. Models, providers, and plugins serve different roles. Unified philosophy (message-passing, pure/impure boundary) but distinct types.

11. **Function-calling style over discriminated unions.** Updates are named methods (`updates: { toggle(s, args) {} }`) not discriminated union dispatch (`dispatch({ type: "toggle" })`). Named methods map directly to domain objects (`app.task.toggle_done()`), command registry, AI code mode globals, and REPL tab completion. Discriminated unions offer exhaustiveness checking but lose the function-calling surface that command-centric design requires. The public API is function calls; internally the runtime may use discriminated messages for logging/replay. Cross-model dispatch uses `fx.dispatch(Model, "update", args)` — no `.ops` namespace on models.

12. **Async effects with `AsyncEffect<T>`.** Updates with effects are async functions — `await` typed `AsyncEffect` descriptors. Each `fx.*` function returns an `AsyncEffect<T>` that is both a plain data descriptor and a thenable. When `await`ed, it looks up the current scope via `AsyncLocalStorage`, the scope records the effect, and delegates to the appropriate runner. Natural TypeScript typing (`await fx.fetch(url)` returns `Response` — no adapter tricks). Scope captures effects via ALS — testable by swapping runners and inspecting `scope.effects`. See [scope-tree.md](./scope-tree.md).

13. **Built-in timer effects.** `fx.delay(ms, update)`, `fx.interval(ms, update)` are provided by the runtime as effect runners. Timer runners register cleanup on the scope's `DisposableStack` and respect the scope's `AbortSignal`. `fx.interval()` returns a `Disposable` handle for manual cleanup. Timer management is the #1 source of `useRef`/`useEffect` complexity in React; making it effects-as-data eliminates that entire category of bugs.

14. **Auto-cleanup via AbortSignal.** Every scope owns an `AbortController`. When a scope cancels (model unmount, parent cancel, manual), its `AbortSignal` fires, aborting all pending effects and child scopes automatically. Runners receive the signal and pass it to platform APIs (`fetch(url, { signal })`). No manual cleanup, no forgotten `clearInterval`. The scope tree owns the lifecycle.

15. **Homebrew params, no schema library.** Command params use plain `{ type, description }` descriptors — JSON Schema-shaped, no dependency. TypeScript types on function signatures handle compile-time safety. Runtime schema (for MCP tools, CLI `--help`, palette prompts) is a trivial transform from these descriptors. The 58% of commands with zero params need nothing. Zod/Effect Schema can be added later if the homebrew approach gets unwieldy, but for a TUI framework it likely won't.

16. **No `.ops` on models.** Cross-model dispatch uses `fx.dispatch(Model, "update", args)` — same pattern as `fx.delay()` and `fx.interval()`. The Model definition has no callable methods (it has no state to mutate). Only instances and handles have callable methods. This keeps the distinction honest: definitions describe, instances execute.

17. **Structured concurrency via scope tree.** Effects form a scope tree. Every model gets a scope with an `AbortController`. Every async update runs within a child scope. Ongoing effects register cleanup on their scope's `DisposableStack`. Cancellation propagates down via `AbortSignal` (parent cancel → all children cancel), errors propagate up via promise rejection. No effect can outlive its parent scope. `fx.all()` for parallel operations with structured cancellation (sibling fails → others cancelled). Standard `try/catch` for error handling.

18. **Scopes are loggily spans (via `withTracing()` plugin).** The `withTracing()` scope plugin wraps each `scope.run()` in a loggily span. The scope tree and observability tree become the same tree. Every effect execution becomes a child span with timing, parent-child relationships, and `AsyncLocalStorage` context propagation. `TRACE=1` shows the live scope tree. Effect _logic_ testing inspects `scope.effects` (via `withRecording()` plugin). Effect _observability_ testing uses loggily spans.

19. **Scope plugins via `with*` composition.** The base scope is minimal: `AbortController` + children + ALS context. Everything else — tracing, recording, retry, rate limiting — is composable via `with*` wrappers on `scope.run()`. Same SlateJS-style plugin pattern used throughout Silvery: `pipe(createRuntime({...}), withTracing(), withRecording())`. One composition model everywhere: models, runtime, scopes.

### Plugin safety (km-silvery.plugin-safety)

Plugins can collide — same command name, both modify `updates`, etc. Guidelines:

- **Last-write-wins** for spread composition (standard JS behavior). Document this.
- **Dev mode warning** when two plugins contribute the same command name or update handler.
- **Scoping convention**: plugin commands use `plugin.command` namespace (e.g., `vim.normal`, `undo.undo`).
- **Order matters**: document that plugins compose left-to-right in `pipe()`. Later plugins override earlier ones.
- **TypeScript enforces**: intersection types make most conflicts visible at compile time.

## Strategic Positioning (validated by deep research, 2026-03-11)

**Narrative**: "Day 1, it's React for terminals. Day 30, the Silvery Way is one sip away."

**Three winning angles**:

1. **AI-native terminal apps** — No competitor has command introspection + state query + screenshot APIs for agent control. Category-defining. (km-silvery.ai-demo, km-silvery.ai-apis)
2. **Performance + stability** — Per-node dirty rendering, no WASM memory leaks. Claude Code's 120GB Yoga leak is the cautionary tale. (km-silvery.benchmarks)
3. **Gradual adoption** — Sip progression means zero commitment up front, full power when needed. Ink devs can migrate with an import change. (km-silvery.ink-migration)

**First 1000 users**: JS/TS devs who outgrew Ink, AI coding agent builders, internal dev tool teams, Node.js library maintainers wanting polished CLIs.

**Killer features to build** (no competitor has these):

- HMR for TUIs — the "Vite moment" (km-silvery.hmr)
- AI-first APIs — screen model queries, command surfaces (km-silvery.ai-apis)
- Visual regression testing — buffer → image diffing (km-silvery.visual-regression)

**Ecosystem strategy**: @silvery/tea as standalone state library is a Trojan horse, but don't divert core resources. Stay focused on "best terminal UI framework" identity. (km-silvery.tea-standalone)

## Current State & Migration Path

### What exists today (pre-redesign)

**`@silvery/tea` (existing, to be replaced):**

- `tea()` — middleware that wraps a reducer with effect collection
- `createSlice(init, handlers)` — defines state + update handlers
- `createEffects(...)` — defines effect handlers separately
- `createStore()` — wires slices + effects into a store
- `collect()` — test helper that normalizes `state | [state, effects]` → `[state, effects[]]`
- `useApp(selector)` — React hook to read store state

**`useTea` hook (landed 2026-03-11, stop-gap):**

A parallel implementation built before `createModel` exists. Lives in `@silvery/ui/hooks/useTea.ts`. Uses discriminated union / `useReducer` pattern:

```typescript
type Msg = { type: "start" } | { type: "tick" } | { type: "stop" }
function update(state: State, msg: Msg): TeaResult<State, Effect> {
  switch (msg.type) { ... }
}
const [state, send] = useTea(init, update)
```

**What's valuable and permanent from `useTea`:**

- `packages/tea/src/effects.ts` — `fx.delay()`, `fx.interval()`, `fx.cancel()` constructors + `createTimerRunners()` with auto-cleanup. This is the `fx` infrastructure the spec calls for.
- `collect()` — evolves from normalizing `state | [state, effects]` to running async updates within a recording scope. Same name, simpler semantics.
- `tests/features/tea-effects.test.tsx` — pure `collect()` tests + integration tests. The pure tests work with any approach.

**What will need porting:**

- `useTea` uses discriminated unions (`switch (msg.type)`), not named functions (`updates: { start(s) {} }`). Code using `useTea` will migrate to `createModel` + `useModel` for the function-calling style that command-centric design requires.
- `useTea` puts state init inside the component call (`useTea(init, update)`). `createModel` defines the model at module level — state lives outside React so it's portable to Svelte, headless, etc.
- The `createTimerRunners()` plumbing inside `useTea` will move into the runtime. The `fx` constructors and types stay.

**Migration table:**

| `useTea` pattern                             | `createModel` equivalent                           |
| -------------------------------------------- | -------------------------------------------------- |
| `type Msg = { type: "start" } \| ...`        | Named update functions (no Msg union needed)       |
| `function update(s, msg) { switch... }`      | `updates: { start(s) {}, tick(s) {} }`             |
| `const [state, send] = useTea(init, update)` | `const state = useModel(Todo)` + commands dispatch |
| `send({ type: "start" })`                    | `app.todo.start()` (domain object)                 |
| `[state, [fx.delay(...)]]` return            | `async start(s) { await fx.delay(...) }`           |
| `collect([state, effects])` on return value  | `await collect(() => instance.start())`            |

The `fx.*` constructors, `collect()`, timer effect types, and `createTimerRunners` survive unchanged. Only the wiring layer changes.

### The three eras

```
Era 1 (current): tea() + createSlice + createStore + useApp
  → works, but 6 overlapping APIs, state coupled to runtime

Era 1.5 (stop-gap): useTea + fx.* + collect
  → cleaner effects, but discriminated unions, state inside React

Era 2 (this spec): createModel + useModel + createRuntime + plugins
  → named functions, async/await for effects, model outside React, command-centric, portable
```

Era 1 → Era 2 is the full migration. Era 1.5 code (`useTea`) is a smaller migration since it already uses `fx.*` and `collect()`.

## Object Shapes

Every object in the system has a clear shape. Understanding these shapes is how you compose them.

### Model (from `createModel`)

The model definition. Module-level, framework-agnostic, reusable.

```typescript
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }: { delta: number }) { s.cursor.value += delta },
    toggle(s, { index }: { index: number }) { s.items.value[index].done ^= 1 },
    async save(s) { await fx.persist({ data: s.items.value }) },
  },
})

// Shape of Todo:
{
  state: () => State,                              // factory — fresh state per instance
  updates: { [name]: (state, args?) => void | Promise<void> },
  create(opts?): ModelInstance,                     // instantiate for testing or headless use
}
```

### ModelInstance (from `Model.create()`)

A live instance with mutable state and callable updates. Used in tests and headless scenarios.

```typescript
const todo = Todo.create()

// Shape:
{
  state: State,                      // live reactive state (signals)
  moveCursor({ delta }): void,       // plain updates — execute immediately
  toggle({ index }): void,
  save(): Promise<void>,             // async updates — runs within current scope
}
```

Testing: `collect()` works for fire-and-forget effects; use `testScope()` with mock runners when downstream code depends on effect results:

```typescript
const todo = Todo.create()
todo.moveCursor({ delta: 1 }) // plain — just call

// Fire-and-forget — collect() with no-op runners is enough
const effects = await collect(() => todo.save())
expect(effects).toContainEqual(fx.persist({ data: todo.state.items.value }))

// Data-dependent — mock runners required (same constraint as generators)
const scope = testScope({ fetch: () => mockData })
await scope.run(() => todo.importAndSave({ url: "/api" }))
expect(todo.state.items.value).toEqual(mockData)
```

### App (plain object, enriched by plugins)

The app is just an object. Plugins add fields via spread.

```typescript
const app = pipe(
  { model: Todo, view },             // bare minimum
  withCommands({ ... }),              // adds: commands, commandTree
  withKeybindings({ j: "down" }),     // adds: keybindings
  withUndo(),                         // adds: updates.undo, updates.redo, keybindings
)

// Shape (varies by plugins applied):
{
  model: Model,                      // state machine definition
  view: View,                        // framework binding (optional for headless)
  commands?: CommandTree,             // from withCommands
  keybindings?: KeybindingMap,        // from withKeybindings
  // ... any fields plugins add
}
```

### View (from `createReactView`)

Framework binding + render target. Self-contained — the runtime doesn't know about React.

```typescript
const view = createReactView(<TodoApp />, term)

// Shape:
{
  framework: "react",               // discriminant for multi-framework support
  mount(stateProxy, dispatch): void, // runtime calls this to start rendering
  unmount(): void,                   // cleanup
  getElementTree(): ElementNode,     // virtual DOM introspection (for AI, DevTools)
}
```

### Runtime (from `createRuntime`)

I/O providers and the event loop. Created once.

```typescript
const runtime = createRuntime({ term, fs })

// Shape:
{
  run(app): Handle,                  // start an app, get back a control handle
  render(element, config?): string,  // one-shot render (no event loop)
  providers: { term, fs, ... },      // I/O capabilities
}
```

### Handle (from `runtime.run(app)`)

The live control surface. Domain objects appear here as callable methods.

```typescript
const handle = runtime.run(app)

// Shape:
{
  state: State,                      // live reactive state
  apply(update): void,               // push an update manually
  exit(): void,                      // shutdown

  // Domain object proxy — mirrors model updates as callable methods:
  moveCursor({ delta }): void,
  toggle({ index }): void,
  save(): void,

  // If commands are registered, they also appear:
  commands: {
    cursor_down(): void,
    toggle(): void,
  },

  // Screen access (for AI, testing):
  screen: {
    text: string,                    // full screen text
    lines: string[],                 // by line
  },
}
```

### Composition: How They Fit Together

```
createModel(def)           → Model        (module-level, reusable)
  Model.create()           → ModelInstance (standalone: tests, headless)

createReactView(el, term)  → View         (framework + target)
createRuntime(providers)   → Runtime      (I/O + event loop)

pipe({ model, view }, plugins...)  → App  (pure logic + metadata)
runtime.run(app)           → Handle       (live control surface)

fx.dispatch(Model, "update", args) → DispatchEffect  (cross-model)
fx.delay(ms, "update")             → TimerEffect      (timers)
await collect(() => instance.save()) → Effect[]          (testing)
```

Five concepts: **Model** (behavior), **View** (rendering), **Runtime** (I/O), **App** (composition), **Handle** (control). Each serves one role. Nothing couples to anything else — swap any piece independently.

## Implementation

See km-silvery.api-impl (depends on this design doc being finalized).

Phased: Core (createModel, createRuntime, plugins) → Views (createReactView) → Ecosystem (framework bindings) → Migration (deprecated wrappers, including `useTea`).
