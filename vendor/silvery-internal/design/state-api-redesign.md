# Silvery API Redesign

_Status: finalized. Bead: km-5kh9r. Implementation: km-silvery.api-impl._

## The Problem

Six overlapping entry points (`createApp`, `createSlice`, `createEffects`, `createStore`, `tea()`, `run()`), four render variants, and state management coupled to the runtime. Users don't know which to pick or how they combine.

## The API at a Glance

Eight sips from `useState` to full apps. Each step adds one thing. Nothing rewrites.

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

// ── Sip 3: State surface — updates-as-data ─────────────────
import { run, createModel, createState, signal } from "silvery"

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

const state = createState({ todo: Todo })

// Two equivalent ways to call:
state.todo.toggle({ index: 0 }) // function call
state.apply({ model: "todo", name: "toggle", args: { index: 0 } }) // data

await run(<TodoView />, { state })

// ── Sip 4: Commands + keybindings ───────────────────────────
await run(
  <TodoView />,
  pipe(
    { state },
    withCommands({
      cursor_down: { name: "Move Down", update: "todo.moveCursor", args: { delta: 1 } },
      cursor_up: { name: "Move Up", update: "todo.moveCursor", args: { delta: -1 } },
      toggle: { name: "Toggle", update: "todo.toggle" },
      help: { name: "Help", action: () => openOverlay("help") },
    }),
    withKeybindings({ j: "cursor_down", k: "cursor_up", x: "toggle" }),
  ),
)

// ── Sip 5: Effects via runtime surface ──────────────────────
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },

    // Async updates await typed effects — scoped, abortable, traced
    async save(s) {
      await fx.persist({ data: s.items.value })
    },

    async importAndSave(s, { url }) {
      const data = await fx.fetch(url) // typed: Response
      s.items.value = data
      await fx.persist({ data })
    },

    async startAutoSave(s) {
      s.autoSave.value = await fx.interval(30_000, "save") // Disposable
    },
  },
})

const state = createState({ todo: Todo })
const rt = createRuntime({ fs: nodeFs.promises, timer: timerImpl })

await run(<TodoView />, { state, rt })

// ── Sip 6: Plugin composition ───────────────────────────────

// State plugins wrap state.apply()
const state = pipe(
  createState({ todo: Todo }),
  withUndo(), // pushes history on every apply
  withValidation(rules), // validates before apply
)

// Runtime plugins wrap rt.apply()
const rt = pipe(
  createRuntime({ fs, timer }),
  withTracing(), // loggily span per effect
  withRecording(), // captures effect descriptors
)

// App plugins bridge both surfaces
const app = pipe(
  { state, rt, view: <TodoApp /> },
  withKeybindings({ x: "toggle" }), // maps input → state.apply()
  withLogging(), // wraps both apply() chains
)

await run(app)

// ── Sip 7: Different targets, same app ──────────────────────
// Terminal
await run({ state, rt, view: <TodoTUI /> })

// Browser xterm.js
await run({ state, rt, view: <TodoTUI /> }, { term: xtermBackend })

// Headless — no view, just the surfaces
state.todo.toggle({ index: 0 })
await state.waitFor((s) => s.todo.items.value[0].done)

// ── Sip 8: Testing — same surfaces, mock runners ───────────
// State-only (no runtime needed)
const state = createState({ todo: Todo })
state.todo.moveCursor({ delta: 1 })
expect(state.todo.cursor.value).toBe(1)

// With effects — swap runners
const rt = testRuntime({ fetch: () => mockData, persist: spy() })
const state = createState({ todo: Todo })

await state.todo.importAndSave({ url: "/api" })
expect(state.todo.items.value).toEqual(mockData)
expect(rt.effects).toContainEqual(fx.persist({ data: mockData }))
```

## Principles

1. **Two surfaces, one pattern.** State has `apply()` for updates. Runtime has `apply()` for effects. Both composable with `with*` plugins. Same mental model, same composition, two concerns separated.

2. **React-native.** Your hooks, your state, your components work. Silvery adds terminal capabilities, not a new programming model.

3. **Native JS composition.** Plain objects, spread, function composition, async iterables. No framework-specific interfaces where JS already has the concept.

4. **State is optional and pluggable.** Use `useState`, `signal()`, Zustand, `createModel` — or nothing. The runtime doesn't care.

5. **Function calls are data.** `state.todo.toggle({index: 0})` is sugar for `state.apply({...})`. Switch between direct calling and declarative data freely. Both are the same thing under the hood.

6. **The Silvery Way is opt-in.** The shiny path (updates-as-data, effects-as-data, commands) is always visible but never forced.

### State access: one primary, many projections

The **primary** way to read state is `state.todo.cursor.value` — direct signal access. Every other pattern is sugar:

| Context                  | Access                        | Notes                                                 |
| ------------------------ | ----------------------------- | ----------------------------------------------------- |
| **In-process (primary)** | `state.todo.cursor.value`     | Direct signal read — typed, reactive                  |
| **AI code mode**         | `todo.cursor.value`           | Domain object globals — same signals                  |
| **Command execute**      | `ctx.state.todo.cursor.value` | Same signals via command context                      |
| **External (CLI/MCP)**   | `getState()` → JSON           | Serialized snapshot for remote consumers              |
| **Tests / Drivers**      | `state.todo.cursor.value`     | Same signals — plus `waitFor()` for async observation |

## Architecture

Two surfaces, same `apply()` pattern. Plugins wrap `apply()` via closure. App-level plugins bridge both.

```
┌─────────────────────────────────────────────────────────────────┐
│ App                                                              │
│                                                                  │
│  ┌─ State Surface ────────────────┐ ┌─ Runtime Surface ────────┐│
│  │                                │ │                          ││
│  │ state.apply(UpdateOp)          │ │ rt.apply(EffectOp) → T   ││
│  │ state.todo.toggle(args)        │ │                          ││
│  │ state.waitFor(pred)            │ │ Effect runners:          ││
│  │                                │ │   fetch, persist, timer  ││
│  │ Plugins: withUndo              │ │                          ││
│  │          withValidation        │ │ Plugins: withTracing     ││
│  │          withHistory           │ │          withRecording   ││
│  └────────────────────────────────┘ └──────────────────────────┘│
│                                                                  │
│  App plugins (bridge both):                                      │
│    withKeybindings — input → state.apply()                       │
│    withCommands   — named intents + metadata                     │
│    withLogging    — wraps both apply() chains                    │
└──────────────────────────────────────────────────────────────────┘
         │
    Drivers (scoped external callers):
      state.drive(async () => { ... })
      Same interface as testing: apply, waitFor, events
      Child scope → ALS signal propagation → auto-cleanup
```

Inspired by **Roc's platform model** (app is pure logic, runtime handles I/O) but split into two typed surfaces. And by **SlateJS** (plugins wrap `apply()` via closure, composing behavior without inheritance).

### Two layers

**Layer 1: Convenience** (most users)

```tsx
import { run, render } from "silvery"

// One-shot output
render(<Table data={rows} />)

// Interactive — zero config
await run(<Counter />)

// Interactive — with state + plugins
await run(<TodoApp />, pipe({ state, rt }, withKeybindings({ j: "down" })))
```

`run()` and `render()` are convenience wrappers that internally create surfaces and wire them together.

**Layer 2: Explicit** (power users)

```tsx
import { createState, createRuntime, createModel } from "silvery"

// 1. Models — pure definitions
const Todo = createModel({ state: () => ({ ... }), updates: { ... } })

// 2. State surface — instantiate models, compose with plugins
const state = pipe(createState({ todo: Todo }), withUndo())

// 3. Runtime surface — provide effect runners, compose with plugins
const rt = pipe(createRuntime({ fs, timer }), withTracing())

// 4. App — compose both surfaces + view + app-level plugins
const app = pipe(
  { state, rt, view: <TodoApp /> },
  withCommands({ ... }),
  withKeybindings({ j: "cursor_down" }),
)

// 5. Run
await run(app)
```

## Key Mechanisms

### The two surfaces

The core architectural idea: state and effects are separate concerns with the same interface.

**State surface** (`createState`): Instantiates models, provides `apply()` for updates. Signal-based reactivity — mutations are synchronous and immediate. High throughput for burst events (key repeat, paste).

**Runtime surface** (`createRuntime`): Provides effect runners, exposes `apply()` for effects. Each `fx.*` call creates an `AsyncEffect<T>` descriptor; `rt.apply()` executes it with the scope's `AbortSignal`.

Both surfaces have `apply()`. Both are composable with `with*` plugins. Both use the same SlateJS-style closure wrapping. The only difference: state `apply()` is synchronous (mutates signals), runtime `apply()` is async (executes I/O).

### Plugin composition

Plugins wrap `apply()` by capturing the old method and installing a new one:

```typescript
function withUndo(): StatePlugin {
  return (state) => {
    const { apply } = state
    state.apply = (op) => {
      pushHistory(op)
      apply(op)
    }
    return state
  }
}

function withTracing(): RuntimePlugin {
  return (rt) => {
    const { apply } = rt
    rt.apply = async (op) => {
      const span = loggily.startSpan(`${op.provider}:${op.method}`)
      try {
        return await apply(op)
      } finally {
        span.end()
      }
    }
    return rt
  }
}

function withKeybindings(map: Record<string, string>): AppPlugin {
  return (app) => {
    // Bridge: input events → state.apply() via command lookup
    app.rt.onInput((key) => {
      const cmd = map[key]
      if (cmd) app.state.apply(app.commands.resolve(cmd))
    })
    return app
  }
}
```

Three plugin levels:

| Level   | What it wraps   | Examples                                   |
| ------- | --------------- | ------------------------------------------ |
| State   | `state.apply()` | withUndo, withValidation, withHistory      |
| Runtime | `rt.apply()`    | withTracing, withRecording, withRetry      |
| App     | Both + wiring   | withKeybindings, withCommands, withLogging |

**Branded types** prevent accidental cross-surface plugin application:

```typescript
interface StateSurface {
  readonly _surface: "state"
  apply(op: UpdateOp): void
}
interface RuntimeSurface {
  readonly _surface: "runtime"
  apply<T>(op: EffectOp<T>): Promise<T>
}
interface AppSurface {
  readonly _surface: "app"
  state: StateSurface
  rt: RuntimeSurface
}

type StatePlugin = (s: StateSurface) => StateSurface
type RuntimePlugin = (rt: RuntimeSurface) => RuntimeSurface
type AppPlugin = (app: AppSurface) => AppSurface
```

### The inner loop

The state surface processes updates in a sync queue. Effects are delegated to the runtime surface via the scope tree:

```typescript
while (running) {
  // 1. Drain the sync queue (state mutations)
  while (queue.length > 0) {
    const update = queue.shift()!

    if (update.isAsync) {
      // Async: state mutations happen eagerly (signals),
      // effects execute within a child scope on the runtime surface
      const scope = rt.createChild(update.name)
      scopeContext.run(scope, () => update.fn(state, update.args))
    } else {
      // Sync: just mutate state
      update.fn(state, update.args)
    }
  }

  // 2. Wait for next event
  const event = await nextEvent()
  queue.push(eventToUpdate(event))
}
```

**Concurrent async updates**: Multiple async updates can overlap — each gets its own child scope on the runtime surface. State mutations happen eagerly via signals; the last mutation wins. For strict serialization, a `withSerialUpdates()` state plugin can queue async updates.

### Effects and structured concurrency

Effects are typed descriptors (`AsyncEffect<T>`) that are both plain data and `await`-able. When `await`ed inside a model update, they look up the current scope via `AsyncLocalStorage` and delegate to the runtime surface. State mutations happen eagerly (via signals); effects are lazy (via `await`).

```typescript
// No effects — plain function
moveCursor(s, { delta }) { s.cursor.value += delta }

// With effects — async function, await typed effects
async save(s) { await fx.persist({ data: s.items.value }) }

// Sequential — each await is scoped, abortable, traced
async importAndSave(s, { url }) {
  const data = await fx.fetch(url)    // data: Response — typed naturally
  s.items.value = data
  await fx.persist({ data })
}
```

The runtime surface owns the scope tree. Effects form a hierarchy: runtime scope → model scope → update scope. Cancellation flows down via `AbortSignal`, errors propagate up via promise rejection. No effect outlives its parent scope.

For the full effects system — `AsyncEffect` implementation, `fx.from()` API wrapping, serialization policies, effect runners, structured concurrency details, cancellation cascading, scopes-as-loggily-spans, testing patterns (`collect()`, `testScope()`, `withTestClock()`) — see [scope-tree.md](./scope-tree.md).

### Built-in timer effects

Timer effects are provided by the runtime as pre-wrapped APIs:

```typescript
fx.delay(ms)                 // AsyncEffect<void> — awaitable pause
fx.interval(ms, update)      // AsyncEffect<Disposable> — repeating, auto-cleanup

async startAutoSave(s) {
  s.autoSave.value = await fx.interval(30_000, "save")
},
async stopAutoSave(s) {
  s.autoSave.value[Symbol.dispose]()
  // or: model unmount → scope cancels → interval cleaned up automatically
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

The runtime surface routes dispatch effects to the target model's instance. Type-safe — TypeScript infers valid update names and arg types from the model definition.

### Framework bindings

`@silvery/tea` is framework-agnostic. Thin bindings (~5-10 lines each):

```tsx
import { useModel } from "@silvery/tea/react" // useSyncExternalStore
import { useModel } from "@silvery/tea/svelte" // writable store bridge
import { useModel } from "@silvery/tea/vue" // ref() bridge
```

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

// Shape:
{
  state: () => State,                              // factory — fresh state per instance
  updates: { [name]: (state, args?) => void | Promise<void> },
  create(opts?): ModelInstance,                     // standalone instance for testing
}
```

### ModelInstance (from `Model.create()`)

A standalone instance for testing and headless use — without a state surface.

```typescript
const todo = Todo.create()

// Shape:
{
  state: State,                      // live reactive state (signals)
  moveCursor({ delta }): void,       // callable updates
  toggle({ index }): void,
  save(): Promise<void>,             // async updates run in a default scope
}
```

### StateSurface (from `createState`)

Holds model instances, processes updates via `apply()`. The primary state interface.

```typescript
const state = pipe(
  createState({ todo: Todo, prefs: Prefs }),
  withUndo(),
)

// Shape:
{
  readonly _surface: "state",

  // The single entry point for all state changes
  apply(op: UpdateOp): void,

  // Domain proxies — sugar for apply()
  todo: {
    moveCursor({ delta }): void,
    toggle({ index }): void,
    save(): Promise<void>,
    // Signal access:
    cursor: Signal<number>,
    items: Signal<Item[]>,
  },
  prefs: { ... },

  // Reactive observation
  waitFor(pred: (s) => boolean): Promise<void>,
  events: AsyncIterable<UpdateEvent>,
  signal: AbortSignal,

  // Drivers — scoped external callers
  drive(fn: () => Promise<void>): Disposable,
}
```

`waitFor(predicate)` subscribes to relevant signals and resolves when the predicate becomes true. Rejects with `AbortError` if the app exits. This is what makes external driving ergonomic — no polling, just "wake me when this is true."

`events` is an `AsyncIterable` of everything that happens:

```typescript
type UpdateEvent =
  | { type: "update"; model: string; name: string; args: unknown }
  | { type: "stateChange"; model: string; signal: string; prev: unknown; next: unknown }
  | { type: "effect"; effect: AsyncEffect }
  | { type: "exit"; reason: string }
```

### RuntimeSurface (from `createRuntime`)

Executes effects via `apply()`, provides I/O capabilities.

```typescript
const rt = pipe(
  createRuntime({ fs: nodeFs.promises, timer: timerImpl }),
  withTracing(),
  withRecording(),
)

// Shape:
{
  readonly _surface: "runtime",

  // The single entry point for all effect execution
  apply<T>(op: EffectOp<T>): Promise<T>,

  // Scope tree management
  createChild(name: string): Scope,

  // Plugin state
  effects?: EffectOp[],     // from withRecording()
}
```

### AppSurface

Connects state + runtime + view + app-level metadata.

```typescript
const app = pipe(
  { state, rt, view: <TodoApp /> },
  withCommands({ ... }),
  withKeybindings({ j: "cursor_down" }),
)

// Shape (varies by plugins applied):
{
  readonly _surface: "app",
  state: StateSurface,
  rt: RuntimeSurface,
  view?: JSX.Element,

  // From plugins:
  commands?: CommandTree,        // from withCommands
  keybindings?: KeybindingMap,   // from withKeybindings

  // Screen access (for AI, testing):
  screen?: { text: string, lines: string[] },
}
```

### Composition summary

```
createModel(def)             → Model         (module-level, reusable)
  Model.create()             → ModelInstance  (standalone: tests, headless)

createState({ models })      → StateSurface  (live state + apply)
createRuntime({ providers }) → RuntimeSurface (effects + apply)

pipe(surface, ...plugins)    → Same surface, enriched

{ state, rt, view }          → AppSurface    (connects everything)
pipe(app, ...appPlugins)     → Same app, enriched

await run(app)               → void          (interactive lifecycle)
```

Five concepts: **Model** (behavior), **StateSurface** (state + updates), **RuntimeSurface** (effects + I/O), **AppSurface** (composition), **Plugin** (`apply()` wrapping). Each serves one role. Nothing couples to anything else.

## External Callers

Anything outside the model can call `state.apply()` and `state.waitFor()`. No special API — just code.

Three natural ways to run async code alongside an app:

### 1. App plugins (definition-time)

For automation known at app creation — auto-advance, AI agent, recording:

```typescript
function withAutoAdvance(script): AppPlugin {
  return (app) => {
    // Async work in the app's scope — scoped, cancellable, traced
    app.scope.spawn("autoAdvance", async () => {
      for (const entry of script) {
        app.state.chat.submit({ text: entry.content })
        await app.state.waitFor((s) => s.chat.streamPhase.value === "done")
        await fx.delay(400)
      }
    })
    return app
  }
}

// Compose at definition time — no separate "driver" concept:
const app = pipe(
  { state, rt, view: <AIChat /> },
  withCommands(...),
  args.auto ? withAutoAdvance(SCRIPT) : identity,
)
await run(app)
```

### 2. `run(app, runner)` (runtime)

A **runner** is an optional async function passed to `run()`. `run(app)` uses the default runner (interactive: render view, listen for input). `run(app, runner)` uses a custom runner instead — or both:

```typescript
// Default — interactive (keybindings, view rendering)
await run(app)

// Custom runner — replaces default
await run(app, async (handle) => {
  while (true) {
    const action = await agent.decide(handle.screen.text)
    handle.state.apply(action.update)
    await handle.state.waitFor((s) => s.chat.streamPhase.value === "done")
  }
})

// Runner as override — good for testing, automation, CI screenshots
await run(app, async (handle) => {
  handle.state.chat.submit({ text: "fix the bug" })
  await handle.state.waitFor((s) => s.chat.streamPhase.value === "done")
})
```

### 3. Direct calls (tests)

No scoping needed — just call methods:

```typescript
const state = createState({ chat: Chat })
state.chat.submit({ text: "fix the bug" })
await state.waitFor((s) => s.chat.streamPhase.value === "done")
expect(state.chat.exchanges.value).toHaveLength(2)

// Recording / replay via events:
const log = []
for await (const event of state.events) {
  log.push(event)
}
for (const event of log) {
  if (event.type === "update") state.apply(event)
}
```

No "driver" abstraction. Plugins compose at definition time; runners override at `run()` time; tests call directly. All three use the same `state.apply()` / `state.waitFor()` interface.

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
**From SlateJS**: plugins wrap `apply()` via closure — but generalized to two surfaces, not just editor operations.

The pitch: **Day 1, it's React for terminals. Day 30, when the pain hits, the Silvery Way is one sip away.**

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

## Decisions

1. **Two surfaces, same pattern.** State and runtime are separate surfaces with the same `apply()` interface. Both composable with `with*` plugins. This replaces the prior "Runtime (active) / App (passive)" split with a more symmetric design where both sides use the same composition model.

2. **SlateJS-style plugin composition.** Plugins wrap `apply()` by capturing the old method and installing a new one via closure. No plugin interface, no middleware chain — just functions that capture and wrap. Three levels: StatePlugin, RuntimePlugin, AppPlugin.

3. **Branded types for plugin safety.** `_surface: "state" | "runtime" | "app"` prevents structural type matches from allowing a StatePlugin to be applied to a RuntimeSurface. Compile-time safety without ceremony.

4. **Function calls are data.** `state.todo.toggle({index: 0})` creates an `UpdateOp` and feeds it to `state.apply()`. The declarative form (`state.apply({...})`) and the function-calling form are interchangeable. Domain objects are proxies that construct ops.

5. **Naming: "updates"** — keep for model ops (matches TEA's Msg/Update). "Effects" for I/O. "Commands" for user intents. Clear three-level vocabulary.

6. **Drivers are scoped external callers.** `state.drive(fn)` creates a child scope of the app root and runs `fn` within it. Automatic `AbortSignal` propagation via `AsyncLocalStorage` — no manual signal threading. Same `state.apply()` / `state.waitFor()` interface as testing. Returns a `Disposable` handle. Plugins compose at definition time, drivers compose at runtime.

7. **Plugin composition into sub-objects via spread.** `withUndo()` merges into `updates`, `keybindings`, etc. TypeScript intersection types accumulate at each step. Last-write-wins for collisions (standard JS). Dev mode warns on duplicate command names.

8. **`model` as separate from state surface.** `createModel` defines behavior (state factory + update functions). `createState` instantiates models into a live surface with `apply()`. Model is reusable definition; state surface is live instance.

9. **Auto-signaling deferred (P4).** Explore Valtio-style proxy wrapping later. For now, explicit `signal()` is clearer and more predictable. See km-silvery.auto-signals.

10. **React bridge as separate entry point.** `@silvery/tea/react`, `/svelte`, `/vue`. Keeps core framework-agnostic.

11. **Function-calling style over discriminated unions.** Updates are named methods, not switch-case dispatch. Named methods map to domain objects, command registry, AI code mode globals, and REPL tab completion. Cross-model dispatch uses `fx.dispatch(Model, "update", args)`.

12. **Async effects with `AsyncEffect<T>`.** Updates with effects are async functions that `await` typed `AsyncEffect` descriptors. When `await`ed, the descriptor looks up the current scope via `AsyncLocalStorage` and delegates to the runtime surface. See [scope-tree.md](./scope-tree.md) for the full design.

13. **Built-in timer effects.** `fx.delay(ms)`, `fx.interval(ms, update)` provided by the runtime surface. Timer runners register cleanup on the scope's `DisposableStack` and respect `AbortSignal`. Eliminates `useRef`/`useEffect` complexity.

14. **Auto-cleanup via AbortSignal.** Every scope owns an `AbortController`. Cancellation propagates down; errors propagate up. No effect outlives its parent. See [scope-tree.md](./scope-tree.md) for the scope tree design.

15. **Homebrew params, no schema library.** Command params use plain `{ type, description }` descriptors. TypeScript types handle compile-time safety. Runtime schema generation (MCP, CLI, palette) is a trivial transform.

16. **Structured concurrency via scope tree.** Effects form a scope tree owned by the runtime surface. See [scope-tree.md](./scope-tree.md) for implementation: scope primitives, `AsyncEffect`, `fx.from()`, serialization policies, cancellation cascading, scopes-as-spans, testing patterns.

17. **`@silvery/tea` independence.** Keep as `@silvery/tea` for now. Evaluate standalone after Silvery 1.0. See km-silvery.tea-standalone.

### Plugin safety (km-silvery.plugin-safety)

Plugins can collide — same command name, both modify `updates`, etc. Guidelines:

- **Last-write-wins** for spread composition (standard JS behavior). Document this.
- **Dev mode warning** when two plugins contribute the same command name or update handler.
- **Scoping convention**: plugin commands use `plugin.command` namespace (e.g., `vim.normal`, `undo.undo`).
- **Order matters**: document that plugins compose left-to-right in `pipe()`. Later plugins override earlier ones.
- **Branded types**: `_surface` field makes most misapplications visible at compile time.

## What Changes

| Current                                              | New                                                           | Why                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `render()` / `renderSync()` / `renderStatic()`       | `render(el, config?)` — one function, returns string          | 4 → 1                                 |
| `run(element)` + `createApp(config).run(element)`    | `run(app)` or `run(el, config?)`                              | 2 → 1                                 |
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel({ state, updates })`                             | 2 → 1                                 |
| `useApp(selector)`                                   | `useModel(model, selector)`                                   | Framework-agnostic                    |
| `tea()`, `createStore()`                             | Removed                                                       | Internal, no longer needed            |
| Providers (DI with scoped contract)                  | Two surfaces: `createState()` + `createRuntime()`             | Clear separation, same `apply()`      |
| Runtime = monolith (event loop + I/O + effects)      | Runtime surface = effects only, state surface = updates only  | Each surface does one thing           |
| Plugins add fields via spread only                   | Plugins wrap `apply()` (SlateJS-style) + add fields           | Behavioral composition, not just data |
| Handle = the control surface                         | StateSurface IS the control surface, drivers call it directly | No separate Handle shape              |

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

Uses discriminated union / `useReducer` pattern:

```typescript
type Msg = { type: "start" } | { type: "tick" } | { type: "stop" }
function update(state: State, msg: Msg): TeaResult<State, Effect> {
  switch (msg.type) { ... }
}
const [state, send] = useTea(init, update)
```

**What's valuable and permanent from `useTea`:**

- `packages/tea/src/effects.ts` — `fx.delay()`, `fx.interval()`, `fx.cancel()` constructors + `createTimerRunners()` with auto-cleanup. This is the `fx` infrastructure the redesign builds on.
- `collect()` — evolves from normalizing `state | [state, effects]` to running async updates within a recording scope.
- `tests/features/tea-effects.test.tsx` — pure `collect()` tests + integration tests. The pure tests work with any approach.

**What will need porting:**

- `useTea` uses discriminated unions (`switch (msg.type)`), not named functions (`updates: { start(s) {} }`). Code using `useTea` migrates to `createModel` + `createState` for the function-calling style.
- `useTea` puts state init inside the component call (`useTea(init, update)`). `createModel` defines the model at module level — state lives outside React for portability.
- The `createTimerRunners()` plumbing inside `useTea` moves into the runtime surface. The `fx` constructors and types stay.

**Migration table:**

| `useTea` pattern                             | `createModel` + `createState` equivalent     |
| -------------------------------------------- | -------------------------------------------- |
| `type Msg = { type: "start" } \| ...`        | Named update functions (no Msg union needed) |
| `function update(s, msg) { switch... }`      | `updates: { start(s) {}, tick(s) {} }`       |
| `const [state, send] = useTea(init, update)` | `const state = createState({ todo: Todo })`  |
| `send({ type: "start" })`                    | `state.todo.start()` (domain object)         |
| `[state, [fx.delay(...)]]` return            | `async start(s) { await fx.delay(...) }`     |
| `collect([state, effects])` on return value  | `await collect(() => state.todo.start())`    |

The `fx.*` constructors, `collect()`, timer effect types, and `createTimerRunners` survive unchanged. Only the wiring layer changes.

### The three eras

```
Era 1 (current): tea() + createSlice + createStore + useApp
  → works, but 6 overlapping APIs, state coupled to runtime

Era 1.5 (stop-gap): useTea + fx.* + collect
  → cleaner effects, but discriminated unions, state inside React

Era 2 (this spec): createModel + createState + createRuntime + plugins
  → two surfaces, named functions, async/await effects, SlateJS plugins, portable
```

## Implementation

See km-silvery.api-impl (depends on this design doc being finalized).

Phased: Core (createModel, createState, createRuntime, plugins) → Views (React bindings) → Ecosystem (framework bindings) → Migration (deprecated wrappers, including `useTea`).

---

_See also: [scope-tree.md](./scope-tree.md) (effects, scoping, concurrency, observability), [command-centric.md](./command-centric.md) (command registry, auto-derived surfaces), [ai-mode.md](./ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](./app-explosion.md) (the vision)._
