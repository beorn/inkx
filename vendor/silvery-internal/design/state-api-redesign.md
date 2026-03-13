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

// ── Sip 3: Models — createModel wraps factory → typed hook ──
import { run, signal, createModel } from "silvery"

// createModel: factory function in, typed hook out.
// Returns a callable selector hook (Zustand-like) + .get() for direct access.
const useChat = createModel(() => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  return {
    exchanges,
    streaming,
    submit({ text }: { text: string }) {
      exchanges.value = [...exchanges.value, { role: "user", text }]
    },
    clear() {
      exchanges.value = []
    },
  }
})

// Direct access (tests, plugins, AI agents):
useChat.get().submit({ text: "hello" })
useChat.get().exchanges.value // [{ role: "user", text: "hello" }]

// Signal-aware selector hook — auto-unwraps signals, O(1) subscriptions:
function ChatView() {
  const count = useChat((m) => m.exchanges.length) // subscribes only to exchanges
  const streaming = useChat((m) => m.streaming) // subscribes only to streaming
  const submit = useChat((m) => m.submit) // stable method ref
  return <Text>{count} messages</Text>
}

await run(<ChatView />)

// ── Sip 4: Commands + keybindings ───────────────────────────
const app = pipe(
  createApp(<ChatView />),
  withCommands({
    submit: { name: "Send Message", action: () => useChat.get().submit({ text: "..." }) },
    clear: { name: "Clear History", action: () => useChat.get().clear() },
    help: { name: "Help", action: () => openOverlay("help") },
  }),
  withKeybindings({ enter: "submit", "ctrl+l": "clear" }),
)
await app.run()

// ── Sip 5: Providers — typed I/O capabilities ──────────────────

// Provider factories — plain functions returning typed APIs
const createPersist = (dir: string) => ({
  async write(path: string, data: unknown) {
    await Bun.write(`${dir}/${path}`, JSON.stringify(data, null, 2))
  },
  async read(path: string) {
    return JSON.parse(await Bun.file(`${dir}/${path}`).text())
  },
})

const createAI = (config: { model: string }) => ({
  async *stream(messages: Exchange[]) {
    const stream = new Anthropic().messages.stream({
      model: config.model,
      max_tokens: 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    })
    for await (const event of stream) {
      if (event.type === "content_block_delta") yield event.delta.text
    }
  },
})

// All providers in one typed object
const providers = createProviders({
  persist: createPersist("./data"),
  ai: createAI({ model: "claude-sonnet-4-20250514" }),
})

// Models with provider deps — createModel defers instantiation until bind:
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  return {
    exchanges,
    streaming,
    submit({ text }: { text: string }) {
      exchanges.value = [...exchanges.value, { role: "user", text }]
    },
    async save() {
      await rt.persist.write("chat.json", exchanges.value)
    },
    async *respond() {
      streaming.value = true
      const exchange: Exchange = { role: "assistant", text: "" }
      exchanges.value = [...exchanges.value, exchange]
      for await (const chunk of rt.ai.stream(exchanges.value)) {
        exchange.text += chunk
        yield // re-render with accumulated content
      }
      streaming.value = false
    },
  }
})

// createApp binds model factories to providers automatically:
const app = createApp(<ChatView />, { providers, models: { chat: useChat } })
await app.run()

// ── Sip 6: Behavioral plugins ───────────────────────────────
// Providers and models are plain objects (Sip 5).
// Plugins are for cross-cutting behavior — wrapping apply(), input, rendering.

const app = pipe(
  createApp(<ChatView />, { providers, models: { chat: useChat } }),
  withUndo(), // wraps state updates with history
  withTracing(), // loggily span per effect
  withRecording(), // captures updates for replay
  withKeybindings({ enter: "submit", "ctrl+l": "clear" }),
)

await app.run()

// ── Sip 7: Different targets, same app ──────────────────────
// Terminal
await run(<ChatTUI />)

// Browser xterm.js
await run(<ChatTUI />, { term: xtermBackend })

// Headless — no view, just call methods
useChat.get().submit({ text: "hello" })

// ── Sip 8: Testing — isolated instances via .create() ──────
// Unit test — .create() makes an isolated instance with mock providers
const chat = useChat.create({
  persist: { write: async () => {}, read: async () => ({}) },
  ai: {
    stream: async function* () {
      yield "Hello"
      yield " world"
    },
  },
})

chat.submit({ text: "hi" })
expect(chat.exchanges.value).toHaveLength(1)

// Test async behavior — consume the generator
const gen = chat.respond()
for await (const _ of gen) {
  /* consume chunks */
}
expect(chat.exchanges.value[1].text).toBe("Hello world")

// Selector assertions without React:
chat.submit({ text: "test" })
expect(chat.exchanges.value).toHaveLength(3)

// Integration test — real providers, test config
const testChat = useChat.create({
  persist: createPersist("/tmp/test"),
  ai: createAI({ model: "claude-haiku-4-5-20251001" }),
})
```

## Principles

1. **Signals are the state primitive.** Silvery's native state cell is `signal<T>()`. Fine-grained O(1) reactivity — only subscribers of the specific signal that changed are notified. This is the right granularity for large trees (1000+ nodes), sparse updates, and terminal UIs with tight render budgets. Not Zustand stores (O(n) selector fanout), not proxies (too implicit), not bare useState (no sharing).

2. **createModel wraps factories → typed hooks.** A model is a factory function returning signals + methods. `createModel()` wraps it into a Zustand-like callable hook with signal-aware selectors. The factory IS the definition; `createModel` IS the binding. No separate model interface, no Provider ceremony.

3. **Selectors auto-unwrap signals.** In components, `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`. The selector runs in a tracking scope that records signal dependencies and subscribes only to those. Signal details are hidden at the view boundary; visible everywhere else (tests, plugins, model code).

4. **Plain objects for data, plugins for behavior.** Providers and models are plain typed objects composed via factory functions and `Pick`. Behavioral plugins (`with*`) handle cross-cutting concerns (undo, tracing, keybindings) by wrapping `apply()`. Data composition is explicit; behavioral composition is layered on top.

5. **React-native.** Your hooks, your state, your components work. Silvery adds terminal capabilities, not a new programming model.

6. **Native JS composition.** Plain objects, spread, function composition, async iterables. No framework-specific interfaces where JS already has the concept.

7. **Types are inferred, not declared.** Provider types come from factory return types. Model types come from what the factory returns. `createModel` infers the hook type from the factory. Dependency types use `Pick<typeof providers, ...>`. No manual interface declarations needed.

8. **The Silvery Way is opt-in.** The shiny path (typed providers, models, commands, behavioral plugins) is always visible but never forced. Progressive disclosure: Sip 1 is just React, Sip 3 adds `createModel`.

### State access: two surfaces, same signals

The **primary** way to read state depends on context. Signals are the ground truth; selectors are read sugar:

| Context                  | Access                             | Notes                                                |
| ------------------------ | ---------------------------------- | ---------------------------------------------------- |
| **React components**     | `useChat(m => m.exchanges.length)` | Signal-aware selector — auto-unwraps, O(1) subscribe |
| **Model code / plugins** | `useChat.get().exchanges.value`    | Direct signal read — typed, reactive                 |
| **AI agents / commands** | `useChat.get().submit({ text })`   | Direct method call — typed                           |
| **External (CLI/MCP)**   | `useChat.snapshot()` → JSON        | Serialized snapshot for remote consumers             |
| **Tests**                | `chat.exchanges.value`             | Isolated instance via `.create()` — no framework     |

## Architecture

### Three layers of state

```
Layer 1: Primitive signals           signal<T>(), computed(), batch()
Layer 2: Model factories             createModel(() => { signals + methods })
Layer 3: Signal-aware selector hooks useChat(m => m.phase) — auto-unwrap, O(1) subscribe
```

Layer 1 is the state primitive — fine-grained, framework-agnostic, testable. Layer 2 wraps factories into typed namespaces with `.get()`, `.create()`, `.snapshot()`. Layer 3 provides Zustand-like ergonomics: the selector runs in a tracking scope, records which signals were read, and subscribes only to those. Components re-render only when their specific dependencies change — not on every store update.

### Two surfaces, same `apply()` pattern

Plugins wrap `apply()` via closure. App-level plugins bridge both.

```
┌─────────────────────────────────────────────────────────────────┐
│ App                                                              │
│                                                                  │
│  ┌─ State Surface ────────────────┐ ┌─ Runtime Surface ────────┐│
│  │                                │ │                          ││
│  │ state.apply(UpdateOp)          │ │ rt.apply(EffectOp) → T   ││
│  │ state.chat.submit(args)        │ │                          ││
│  │ state.waitFor(pred)            │ │ Providers:               ││
│  │                                │ │   fetch, persist, timer  ││
│  │ Plugins: withUndo              │ │                          ││
│  │          withValidation        │ │ Plugins: withTracing     ││
│  │          withHistory           │ │          withRecording   ││
│  └────────────────────────────────┘ └──────────────────────────┘│
│                                                                  │
│  App plugins (bridge both):                                      │
│    withKeybindings — input → state.apply()                       │
│    withCommands   — named intents + metadata                     │
│    withTerm       — terminal I/O (applied by run() by default)   │
│    withLogging    — wraps both apply() chains                    │
└──────────────────────────────────────────────────────────────────┘
         │
    run(app)               — creates root scope, renders view, listens for input
    run(app, async (h)=>{})— same, plus callback gets the handle for automation
    factory + direct       — no run(), no scope, just call factory with mocks (tests)
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

// Interactive — with providers + models (models bound automatically)
await run(<ChatApp />, { providers, models: { chat: useChat } })
```

`run()` and `render()` are convenience wrappers that internally wire everything together.

**Layer 2: Explicit** (power users)

```tsx
import { createProviders, signal, createModel } from "silvery"

// 1. Providers — factory functions returning typed I/O APIs
const providers = createProviders({
  persist: createPersist("./data"),
  ai: createAI({ model: "claude-sonnet-4-20250514" }),
})

// 2. Models — createModel wraps factory → typed hook
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => { ... })
const useTodos = createModel((rt: Pick<typeof providers, "persist">) => { ... })

// 3. App — bind models to providers, compose with behavioral plugins
const app = pipe(
  createApp(<ChatApp />, { providers, models: { chat: useChat, todos: useTodos } }),
  withUndo(),
  withTracing(),
  withCommands({ ... }),
  withKeybindings({ enter: "submit" }),
)

// 4. Run
await app.run()
```

## Key Mechanisms

### The two surfaces

The core architectural idea: state and effects are separate concerns with the same interface.

**Providers** (`createProviders`): Plain frozen object holding typed I/O capabilities. Factory functions return typed APIs; the object collects them with inferred types. Models depend on providers via `Pick<typeof providers, ...>`.

**Models**: Factory functions returning signals (state) + methods (behavior). Dependencies are function parameters. Instantiated by calling the factory with providers.

**Behavioral plugins** (`with*`): Cross-cutting concerns (undo, tracing, recording, keybindings) wrap `apply()` via SlateJS-style closure composition. Data composition (wiring providers to models) uses plain function calls; behavioral composition uses plugins.

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

**Concurrent async updates**: Multiple async updates can overlap — each gets its own child scope on the runtime surface. State mutations happen eagerly via signals; the last mutation wins. Concurrency control is per-invocation, not global:

- **Default**: Updates run concurrently. Each gets its own scope. This is correct for independent operations (e.g., two different models saving simultaneously).
- **`fx.mutex(key)`**: Acquire a named mutex within an async update. Updates that need exclusive access to a resource (e.g., "only one save at a time") acquire the same mutex. Others proceed normally. Scoped — released automatically when the update's scope ends.
- **`fx.batch(updates)`**: Group multiple updates into a single atomic batch. Signal mutations from all updates are applied together, triggering one re-render instead of N. Useful for bulk operations (e.g., importing 100 items).

The concurrency model is opt-in at the call site, not global. No `withSerialUpdates()` plugin — that's too coarse. If you need serialization, use a mutex on the specific resource that requires it.

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

For the full effects system — `AsyncEffect` implementation, `fx.from()` API wrapping, serialization policies, providers, structured concurrency details, cancellation cascading, scopes-as-loggily-spans, testing patterns (`collect()`, `testScope()`, `withTestClock()`) — see [scope-tree.md](./scope-tree.md).

### Content streaming via generators

Two yield mechanisms, each matching its JS primitive:

- **`async/await`** yields **control** — effects execute, other code runs, you get the result back
- **Generators** yield **content** — progressive chunks that build up over time

Async generators (`async function*`) compose both naturally: `await` for I/O, `yield` for content:

```typescript
const useChat = createModel((rt: Pick<typeof providers, "ai">) => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  const currentContent = signal("") // dedicated signal for in-flight content

  return {
    exchanges,
    streaming,
    currentContent,

    submit({ text }: { text: string }) {
      exchanges.value = [...exchanges.value, { role: "user", text }]
    },

    // Async generator: await yields control (I/O), yield yields content (chunks)
    async *respond() {
      streaming.value = true
      currentContent.value = ""

      for await (const chunk of rt.ai.stream(exchanges.value)) {
        currentContent.value += chunk // signal write — O(1) re-render of subscribers
        yield // cooperate / checkpoint
      }

      // Commit final content to exchange list
      exchanges.value = [...exchanges.value, { role: "assistant", text: currentContent.value }]
      currentContent.value = ""
      streaming.value = false
    },
  }
})
```

**Key design choice**: Streaming content uses a dedicated `currentContent` signal rather than mutating an exchange object inline. This means:

- Each content chunk is a true signal write → O(1) subscriber notification
- No array copying during the token stream (only `currentContent` changes, not `exchanges`)
- Components showing the streaming text subscribe only to `currentContent`
- The final exchange is committed to `exchanges` once, when streaming completes

The `yield` in a content generator signals "cooperate / flush / expose intermediate progress" — not the primary render trigger. Signal writes are the primary render trigger. This is cleaner than using `yield` as a re-render mechanism.

This replaces the current `useTea` pattern of `streamPhase` / `revealFraction` / `setInterval` ticks with a model where the update function itself produces content progressively. The state machine that was 200+ lines of tick/advance/reveal logic in the AI chat demo becomes a 15-line async generator.

| Mechanism                       | JS Primitive                  | Yields                   | Natural for                          |
| ------------------------------- | ----------------------------- | ------------------------ | ------------------------------------ |
| `async/await`                   | Promise (single future value) | Control (to the runtime) | "Do this I/O, give me the result"    |
| `function*` / `async function*` | Iterator (sequence of values) | Content (to the view)    | "Stream these chunks as they arrive" |

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

`@silvery/tea` is framework-agnostic. The core is signals + factory functions. Each framework gets a thin binding that implements signal-tracked selectors using the framework's native subscription mechanism:

```tsx
// React — useSyncExternalStore + signal dependency tracking
import { createModel } from "@silvery/tea/react"
const useChat = createModel(() => { ... })
const phase = useChat(m => m.phase)  // auto-unwrapped, O(1) subscribe

// Svelte — writable store bridge
import { createModel } from "@silvery/tea/svelte"
const chat = createModel(() => { ... })
$: phase = $chat.phase  // Svelte reactive statement

// Vue — ref() bridge
import { createModel } from "@silvery/tea/vue"
const chat = createModel(() => { ... })
const phase = computed(() => chat.value.phase)
```

The React binding is the primary target. It uses `useSyncExternalStore` internally but the subscription is signal-tracked: the selector function runs in a tracking scope that records which signals were accessed, then subscribes only to those signals. When any subscribed signal changes, the selector reruns and the component re-renders only if the output changed.

This gives **Zustand ergonomics with signal performance**: `useChat(m => m.phase)` looks like a Zustand selector but subscribes to exactly one signal, not the entire store.

## Object Shapes

Every object in the system has a clear shape. Understanding these shapes is how you compose them.

### Providers (from `createProviders`)

Typed I/O capabilities. A plain frozen object whose types are inferred from the factory implementations.

```typescript
const createPersist = (dir: string) => ({
  async write(path: string, data: unknown) {
    /* ... */
  },
  async read(path: string) {
    /* ... */
  },
})

const createAI = (config: { model: string }) => ({
  async *stream(messages: Exchange[]) {
    /* ... */
  },
})

const providers = createProviders({
  persist: createPersist("./data"),
  ai: createAI({ model: "claude-sonnet-4-20250514" }),
  fs: await import("node:fs"),
})

// Shape: plain object, types inferred from factory return types
// typeof providers = {
//   persist: { write(path, data): Promise<void>; read(path): Promise<unknown> },
//   ai: { stream(messages): AsyncGenerator<string> },
//   fs: typeof import("node:fs"),
// }
```

`createProviders` is essentially `Object.freeze` — the value is in the type inference and the convention of collecting all I/O in one place.

### Model (via `createModel`)

`createModel()` wraps a factory function → returns a typed hook + namespace. The factory returns signals (state) + methods (behavior). Dependencies on providers are declared via `Pick`.

```typescript
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  return {
    exchanges,
    streaming,
    submit({ text }: { text: string }) {
      exchanges.value = [...exchanges.value, { role: "user", text }]
    },
    async save() {
      await rt.persist.write("chat.json", exchanges.value)
    },
    async *respond() {
      /* yields content chunks — see Content streaming */
    },
  }
})

// Shape of the returned hook:
type ModelHook<T> = {
  // Callable as selector hook in React (signal-aware, auto-unwrapping):
  <U>(selector: (model: Unwrapped<T>) => U, eq?: (a: U, b: U) => boolean): U

  // Direct access (tests, plugins, AI agents, model code):
  get(): T // raw instance with signal fields
  create(deps?: any): T // isolated instance for testing
  snapshot(): Snapshot<T> // plain JSON state (signals → values)
  subscribe(fn: () => void): () => void
}

// Testing: useChat.create(mockProviders) — isolated, no framework
// Direct: useChat.get().submit({ text }) — typed method call
// React: useChat(m => m.exchanges.length) — O(1) subscribe
```

`createModel` IS the bridge between signals (Layer 1) and Zustand-like hook ergonomics (Layer 3). The factory IS the model definition; `createModel` adds the subscription/hook machinery.

### Models collection

Model hooks are module-level singletons. For apps with multiple models, `createApp` binds all of them to providers at once:

```typescript
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => { ... })
const useTodos = createModel((rt: Pick<typeof providers, "persist">) => { ... })
const usePrefs = createModel(() => { ... })  // no providers needed

const app = createApp(<App />, {
  providers,
  models: { chat: useChat, todos: useTodos, prefs: usePrefs },
})
```

Each model hook is independently usable in any component — no `useModels()` aggregate hook needed. Components import the specific model they need.

### App (from `createApp`)

Connects providers + models + view. Behavioral plugins compose on top.

```typescript
const app = pipe(
  createApp(<ChatApp />, { providers, models: { chat: useChat } }),
  withUndo(),
  withCommands({ ... }),
  withKeybindings({ enter: "submit" }),
)

// Shape (varies by plugins applied):
{
  providers: typeof providers,
  models: { chat: typeof useChat, ... },
  view: JSX.Element,

  // From plugins:
  commands?: CommandTree,        // from withCommands
  keybindings?: KeybindingMap,   // from withKeybindings
  screen?: { text: string, lines: string[] },
}
```

### Composition summary

```
createPersist(dir)           → { write, read }         (provider factory)
createAI(config)             → { stream }              (provider factory)
createProviders({ ... })     → Providers               (frozen typed object)

createModel(factory)         → ModelHook<T>            (typed hook + namespace)
useChat.get()                → { exchanges, submit, save, ... }  (raw instance)
useChat.create(mocks)        → { exchanges, submit, save, ... }  (isolated test instance)
useChat(m => m.phase)        → Phase                   (signal-aware selector)

createApp(view, { providers, models }) → App  (binds model factories to providers)
pipe(app, ...plugins)        → Same app, enriched      (behavioral plugins)

await app.run()              → void                    (interactive lifecycle)
```

Four concepts: **Provider** (I/O factory), **Model** (state + behavior factory wrapped via `createModel`), **App** (composition), **Plugin** (behavioral wrapping). Dependencies flow one way: providers → models → app.

### Type system for dependencies

Three levels — use what fits:

```typescript
// Level 1: Pick from the concrete object (simplest, most common)
function createChat(rt: Pick<typeof providers, "persist" | "ai">) { ... }

// Level 2: Pick from an inferred type alias (decoupled from instance)
type Providers = ReturnType<typeof createProviders>
function createChat(rt: Pick<Providers, "persist" | "ai">) { ... }

// Level 3: Named interface (shared contract, 3+ consumers)
interface PersistAPI {
  write(path: string, data: unknown): Promise<void>
  read(path: string): Promise<unknown>
}
function createChat(rt: { persist: PersistAPI; ai: AIAPI }) { ... }
```

All three interoperate — TypeScript's structural typing means `Pick<typeof providers, "persist">` and `{ persist: PersistAPI }` are the same type as long as shapes match. Start with Level 1 everywhere. Promote to Level 2 or 3 only when needed.

## External Callers

Anything outside the model can call methods directly via `.get()`. No special API — just code.

Three natural ways to run async code alongside an app:

### 1. App plugins (definition-time)

For automation known at app creation — auto-advance, AI agent, recording:

```typescript
function withAutoAdvance(script): AppPlugin {
  return (app) => {
    // Async work in the app's scope — scoped, cancellable, traced
    app.scope.spawn("autoAdvance", async () => {
      for (const entry of script) {
        useChat.get().submit({ text: entry.content })
        await useChat.get().streaming.waitFor(v => !v)
        await fx.delay(400)
      }
    })
    return app
  }
}

// Compose at definition time — no separate "driver" concept:
const app = pipe(
  createApp(<AIChat />, { providers, models: { chat: useChat } }),
  withCommands(...),
  args.auto ? withAutoAdvance(SCRIPT) : identity,
)
await app.run()
```

### 2. `run(app, fn)` (runtime callback)

The second argument to `run()` is an async callback that receives the app handle. `run(app)` alone runs the interactive loop (render view, listen for input). Adding a callback gives you programmatic access alongside — or instead of — the interactive loop:

```typescript
// Default — interactive (keybindings, view rendering)
await run(app)

// Automation — callback drives the app
await run(app, async (handle) => {
  while (true) {
    const action = await agent.decide(handle.screen.text)
    useChat.get().submit(action.args)
    await useChat.get().streaming.waitFor((v) => !v)
  }
})

// Testing — callback runs scenario, then exits
await run(app, async (handle) => {
  useChat.get().submit({ text: "fix the bug" })
  await useChat.get().streaming.waitFor((v) => !v)
})
```

### 3. Direct calls (tests)

No framework needed — `.create()` makes an isolated instance with mock providers:

```typescript
const chat = useChat.create({
  persist: { write: async () => {}, read: async () => ({}) },
  ai: {
    stream: async function* () {
      yield "Hello"
      yield " world"
    },
  },
})

chat.submit({ text: "fix the bug" })
const gen = chat.respond()
for await (const _ of gen) {
  /* consume */
}
expect(chat.exchanges.value).toHaveLength(2)
expect(chat.exchanges.value[1].text).toBe("Hello world")
```

Three patterns, no special abstractions. Plugins compose at definition time; `run()` callbacks drive at runtime; tests create isolated instances directly.

## How Silvery Compares

|               | Terminal          | State                                  | Events                 | Rendering                    |
| ------------- | ----------------- | -------------------------------------- | ---------------------- | ---------------------------- |
| **Ink**       | Hidden            | React hooks only                       | `useInput` hooks       | React (coupled to state)     |
| **Bubbletea** | Hidden            | Enforced TEA                           | Message dispatch       | Pure strings                 |
| **Ratatui**   | Explicit          | BYO                                    | Manual event loop      | Immediate mode               |
| **Textual**   | Hidden            | Reactive (auto)                        | Message queue          | Widget tree + CSS            |
| **Silvery**   | Explicit (`Term`) | Signals + createModel (BYO also works) | Commands + keybindings | React (decoupled from state) |

**Provenance — taking the best parts from each:**

| Source              | What we take                                              | What we leave behind                                                       |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Elm**             | State/effect separation, updates-as-data, effects-as-data | Compiler enforcement, custom language, no plugin system                    |
| **Bubbletea**       | Pure state machines, message-driven updates               | Enforced TEA (we make it opt-in), Go's type system                         |
| **Ratatui**         | Explicit terminal, state decoupled from rendering         | No React, immediate mode, manual event loop                                |
| **Ink**             | React components, `run()` simplicity, hooks ecosystem     | Monolithic runtime, no state management, no plugins                        |
| **Roc**             | Pure app / I/O runtime separation (platform model)        | Compiler-enforced purity, custom language                                  |
| **SlateJS**         | Plugins wrap `apply()` via closure composition            | Editor-specific; we generalize to two surfaces                             |
| **Redux-Saga**      | Effects-as-data, structured async flows, testability      | Generator-based effects (we use async/await), global sagas, action strings |
| **Jotai / Zustand** | Fine-grained reactive signals, minimal API                | No effect system, no structured concurrency, no commands                   |
| **Effect-TS**       | Structured concurrency, scoped resources, DI via context  | Heavy type machinery, monadic composition, steep learning curve            |
| **XState**          | Actor model inspiration, explicit state machines          | Statechart complexity, guards, event-driven (not function calls)           |

Not reinventing any one wheel — combining the proven parts into a coherent package, tailored to terminal apps with AI agent integration.

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

4. **Function calls are data.** `state.chat.submit({text: "hello"})` creates an `UpdateOp` and feeds it to `state.apply()`. The declarative form (`state.apply({...})`) and the function-calling form are interchangeable. Domain objects are proxies that construct ops.

5. **Naming: "updates"** — keep for model ops (matches TEA's Msg/Update). "Effects" for I/O. "Commands" for user intents. Clear three-level vocabulary.

6. **No driver abstraction.** External callers use three natural patterns: (a) app plugins for automation known at definition time (`withAutoAdvance(script)`), (b) `run(app, fn)` for runtime automation (AI agents, demos, testing), (c) direct calls for tests. All three use the same `state.apply()` / `state.waitFor()` interface. `run()` creates the root scope, applies `withTerm()` by default, and optionally accepts an async callback that receives the handle.

7. **Plugin composition into sub-objects via spread.** `withUndo()` merges into `updates`, `keybindings`, etc. TypeScript intersection types accumulate at each step. Last-write-wins for collisions (standard JS). Dev mode warns on duplicate command names.

8. **`createModel()` wraps factories into typed hooks.** A model is a plain factory function returning signals + methods. `createModel()` wraps it into a Zustand-like callable hook with signal-aware selectors, `.get()` for direct access, `.create()` for isolated test instances. The factory IS the definition; `createModel` IS the binding layer. Dependencies are function parameters typed with `Pick<typeof providers, ...>`. Testing uses `.create(mockProviders)` — no framework coupling.

9. **Signal auto-unwrapping at the selector boundary.** ~~Auto-signaling deferred (P4).~~ Resolved: selectors auto-unwrap signals via a read-only tracking proxy. `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`. This is a good use of proxies at the **ergonomic boundary** — even though we reject proxies as the state primitive (too implicit). Two mental models: raw `.value` in model code/tests/plugins; unwrapped values in selectors/hooks. Docs frame it as: "signals are the ground truth, selectors are read sugar."

10. **Signals, not Zustand, as the state primitive.** (Decided 2026-03-13, validated by GPT 5.4 Pro deep research.) Zustand's selector model is O(n) — every subscriber reruns its selector on every store update. With 1000+ subscribed components (km board), this causes selector fanout. Signals are O(1) — only subscribers of the specific signal that changed are notified. Additionally, signal references are stable objects, so `Object.is` (Zustand's change detection) never sees changes — they're fundamentally incompatible reactivity models. Use Zustand as **API inspiration** (module-level hook, no Provider, great inference), not as implementation substrate.

11. **React bridge as separate entry point.** `@silvery/tea/react`, `/svelte`, `/vue`. Keeps core framework-agnostic.

12. **Function-calling style over discriminated unions.** Named methods on the model, not switch-case dispatch. Methods map to domain objects, command registry, AI code mode globals, and REPL tab completion. Cross-model dispatch uses `fx.dispatch(Model, "method", args)`.

13. **Async effects with `AsyncEffect<T>`.** Updates with effects are async functions that `await` typed `AsyncEffect` descriptors. When `await`ed, the descriptor looks up the current scope via `AsyncLocalStorage` and delegates to the runtime surface. See [scope-tree.md](./scope-tree.md) for the full design.

14. **Built-in timer effects.** `fx.delay(ms)`, `fx.interval(ms, update)` provided by the runtime surface. Timer providers register cleanup on the scope's `DisposableStack` and respect `AbortSignal`. Eliminates `useRef`/`useEffect` complexity.

15. **Auto-cleanup via AbortSignal.** Every scope owns an `AbortController`. Cancellation propagates down; errors propagate up. No effect outlives its parent. See [scope-tree.md](./scope-tree.md) for the scope tree design.

16. **Homebrew params, no schema library.** Command params use plain `{ type, description }` descriptors. TypeScript types handle compile-time safety. Runtime schema generation (MCP, CLI, palette) is a trivial transform.

17. **Structured concurrency via scope tree.** Effects form a scope tree owned by the runtime surface. See [scope-tree.md](./scope-tree.md) for implementation: scope primitives, `AsyncEffect`, `fx.from()`, serialization policies, providers, cancellation cascading, scopes-as-spans, testing patterns.

18. **`@silvery/tea` independence.** Keep as `@silvery/tea` for now. Evaluate standalone after Silvery 1.0. See km-silvery.tea-standalone.

19. **`run()` owns lifecycle.** `run()` creates the root scope, applies `withTerm()` by default (terminal I/O is just another plugin), starts the app, and returns an awaitable handle. Optional second argument: an async callback that receives the handle for programmatic control. `run(app)` for interactive; `run(app, fn)` for automation/testing.

20. **Async/await for updates, generators for content.** Two yield mechanisms matching JS primitives. `async` updates yield control — effects execute, signals mutate, you get the result back. Generator updates (`async function*`) yield content — progressive chunks the runtime batches into renders. No mixing: if an update does I/O but doesn't stream, use `async`. If it streams, use `async function*`. This replaces `useTea`'s `streamPhase` / timer-tick pattern.

21. **Providers are plain objects, composed via `createProviders()`.** Provider factories are plain functions: `createPersist(dir) => { write, read }`. All providers are collected into one typed object via `createProviders({ persist, ai, fs })`. This object is the single source of truth for I/O types. Models depend on it via `Pick<typeof providers, "key">`. No `createRuntime` needed for the basic case — the runtime surface wraps providers only when behavioral plugins (tracing, recording) are needed.

22. **Per-invocation concurrency, not global serialization.** Async updates run concurrently by default (each in its own scope). Concurrency control is opt-in at the call site: `fx.mutex(key)` for exclusive access to a resource, `fx.batch(updates)` for atomic multi-update batches. No global `withSerialUpdates()` plugin — too coarse-grained. The right granularity is the resource, not the entire update pipeline.

23. **`Pick<typeof providers, ...>` for dependency declaration.** Dependencies are declared via TypeScript's `Pick` utility type on the providers object. No custom type helpers, no generic constraints, no `ReturnType` on generic functions (which is unreliable — erases to constraint type). Three escalation levels: `Pick<typeof providers, "key">` (concrete, most common) → `Pick<Providers, "key">` (decoupled type alias) → named interfaces (shared contracts). All interoperate via structural typing.

24. **Composition is plain objects, not pipelines.** Providers are composed as plain typed objects (`createProviders({...})`). Models are wrapped via `createModel(factory)` and bound to providers via `createApp()`. Behavioral plugins (`with*`) still exist for cross-cutting concerns (undo, tracing, keybindings) that wrap `apply()` or input handling.

25. **No string keys in provider/model registration.** Provider names come from object property names (JS shorthand: `{ persist, ai, fs }`), not from explicit string arguments. This avoids the key↔type synchronization problem and lets TypeScript infer everything from the object literal.

### Plugin safety (km-silvery.plugin-safety)

Plugins can collide — same command name, both modify `updates`, etc. Guidelines:

- **Last-write-wins** for spread composition (standard JS behavior). Document this.
- **Dev mode warning** when two plugins contribute the same command name or update handler.
- **Scoping convention**: plugin commands use `plugin.command` namespace (e.g., `vim.normal`, `undo.undo`).
- **Order matters**: document that plugins compose left-to-right in `pipe()`. Later plugins override earlier ones.
- **Branded types**: `_surface` field makes most misapplications visible at compile time.

## What Changes

| Current                                              | New                                                                  | Why                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `render()` / `renderSync()` / `renderStatic()`       | `render(el, config?)` — one function, returns string                 | 4 → 1                                 |
| `run(element)` + `createApp(config).run(element)`    | `run(app)` or `run(el, config?)`                                     | 2 → 1                                 |
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel(() => { signals + methods })` → typed hook              | 2 → one wrapper                       |
| `useApp(selector)`                                   | `useChat(m => m.phase)` — per-model typed selector hook              | O(1) subscribe, no Provider           |
| `tea()`, `createStore()`                             | Removed                                                              | Internal, no longer needed            |
| Providers (DI with scoped contract)                  | `createProviders({...})` — plain frozen object                       | Types inferred, deps via `Pick`       |
| Runtime = monolith (event loop + I/O + effects)      | Providers (I/O) + behavioral plugins (tracing, recording)            | Data composition + behavioral plugins |
| Plugins add fields via spread only                   | Plugins wrap `apply()` (SlateJS-style) + add fields                  | Behavioral composition, not just data |
| Handle = the control surface                         | StateSurface IS the control surface, external code calls it directly | No separate Handle shape              |

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

- `useTea` uses discriminated unions (`switch (msg.type)`), not named methods. Code using `useTea` migrates to model factory functions for the direct-call style.
- `useTea` puts state init inside the component call (`useTea(init, update)`). Factory functions define models at module level — state lives outside React for portability.
- The `createTimerRunners()` plumbing inside `useTea` becomes a timer provider on the runtime surface. The `fx` constructors and types stay.

**Migration table:**

| `useTea` pattern                             | Factory function equivalent                   |
| -------------------------------------------- | --------------------------------------------- |
| `type Msg = { type: "start" } \| ...`        | Named methods on the model factory            |
| `function update(s, msg) { switch... }`      | `start() {}, tick() {}` (methods on object)   |
| `const [state, send] = useTea(init, update)` | `const useChat = createModel(() => { ... })`  |
| `send({ type: "start" })`                    | `useChat.get().submit()` (direct method call) |
| `[state, [fx.delay(...)]]` return            | `async start(s) { await fx.delay(...) }`      |
| `streamPhase` / `revealFraction` / timers    | `async *respond(s) { yield }` (generator)     |
| `collect([state, effects])` on return value  | `await collect(() => state.chat.respond())`   |

The `fx.*` constructors, `collect()`, and timer effect types survive unchanged. `createTimerRunners` becomes a timer provider. Only the wiring layer changes.

### The three eras

```
Era 1 (current): tea() + createSlice + createStore + useApp
  → works, but 6 overlapping APIs, state coupled to runtime

Era 1.5 (stop-gap): useTea + fx.* + collect
  → cleaner effects, but discriminated unions, state inside React

Era 2 (this spec): createModel + signals + createProviders + Pick + behavioral plugins
  → signals as primitive, createModel for Zustand-like hooks, typed deps via Pick, behavioral plugins
```

## Implementation

See km-silvery.api-impl (depends on this design doc being finalized).

Phased: Core (signal primitives, `createModel`, `createProviders`) → Bindings (signal-tracked selector hook for React) → Composition (`createApp`, `pipe`, `with*` plugins) → Migration (deprecated `useTea`, `useApp`, `createSlice`).

## Design History

Timestamped record of key decisions and their reasoning. Read this before proposing changes — many alternatives were explored and rejected for specific reasons.

### 2026-03-11: Initial design finalized

The original design established the "Eight Sips" progressive API, two-surface architecture (State + Runtime), SlateJS-style plugin composition, and the principle that models are plain factory functions. Key insight: separate data composition (providers → models via `Pick`) from behavioral composition (`with*` plugins wrapping `apply()`).

Validated by O3 deep research comparing with Bubbletea, XState, Effect-TS, and Zustand. Finding: "Silvery is ahead of the curve in making terminal UIs AI-friendly."

### 2026-03-12: Model shape decisions

Discussed and decided several model API details:

- **Flat shape with `state:` as only reserved key.** Everything else is callable. Rejected: nested `updates:` (respond isn't an update), two-arg form (less cohesive).
- **Providers, not runners.** The DI objects are called "providers" — they provide capabilities.
- **`fx.mutex`/`fx.batch` over `withSerialUpdates`.** Per-invocation concurrency, not global serialization.
- **Async/await for effects, not generators.** Natural typing, platform-native cancellation via AbortSignal.

Also added driver-on-handle pattern, `handle.waitFor()`, `handle.events`, `handle.signal` to state-api-redesign.md. Added `fx.from()` wrapping and serialization/execution policies to scope-tree.md.

### 2026-03-12: Two-surface architecture rewrite

Major rewrite replacing the original Runtime/App split with StateSurface/RuntimeSurface/AppSurface model. Both surfaces use `apply()` + SlateJS-style `with*` plugin composition. Branded types (`_surface: "state" | "runtime" | "app"`) prevent accidental cross-surface plugin application. ~933 → ~680 lines (removed duplication with scope-tree.md).

### 2026-03-12: Prototype (aichat-v2)

Built prototype at `vendor/silvery-internal/prototype/aichat-v2/` to validate the design against the real AI chat demo. Key files: `signal.ts` (minimal signal impl), `model.ts` (factory with async generator), `view.tsx` (React components), `model.test.ts` (13 pure model tests). The prototype reduced the 327-line TEA state machine to ~140 lines and eliminated 12 of 14 message types.

### 2026-03-13: Signals vs Zustand decision ★

**The pivotal decision.** User observation: "models context wrapping should be provided by silvery, not manually by the end-user" and "models more like Zustand in terms of how they're set up."

This triggered a deep investigation into whether Zustand could be the state primitive:

**The incompatibility**: Signal references are stable objects. Zustand's change detection uses `Object.is` comparison on selector outputs. If a selector returns a signal reference, `Object.is` always returns `true` (same reference) — Zustand never sees the change. The two reactivity models are fundamentally incompatible.

**The O(n) problem**: With Zustand, every subscriber reruns its selector on every store update. With 1000+ subscribed components (km's board view), cursor movement causes ~1000 selector evaluations. Most return "unchanged" but are still evaluated. Signals are O(1): only subscribers of the specific signal that changed are notified.

**Session history research** (via `/recall`) confirmed this was a known tension from prior sessions:

- Explored `useReactivity(selector)` hook — ran selectors inside `useEffect` with signal tracking
- Explored dual system: Zustand for coarse state, signals for fine-grained
- Found that the two systems always ended up duplicating concepts

**GPT 5.4 Pro deep research** (89s, $0.13, 22K tokens) reviewed the full design docs, prototype code, and five design options:

- **Option A (raw signals)**: Correct core but insufficient ergonomic API
- **Option B (Zustand stores)**: Rejected — selector fanout, signal incompatibility
- **Option C (signals with Zustand-like API)**: **Selected** — but as custom signal-aware facade, not actual Zustand wrapping
- **Option D (Valtio proxies)**: Rejected — too implicit for explicit/testable/plugin architecture
- **Option E (hybrid)**: Refinement of C — signals core, selectors for ergonomics, internal context where needed

**The resolution**: `createModel()` — wraps a factory function into a callable typed hook. The hook's selector runs in a signal tracking scope, records dependencies, subscribes only to those. Auto-unwraps signal values at the selector boundary via read-only proxy. Gives Zustand ergonomics (`useChat(m => m.phase)`) with signal performance (O(1) invalidation).

**Three layers decided**:

1. **Primitive**: `signal<T>()`, `computed()`, `batch()` — framework-agnostic state cells
2. **Model**: `createModel(factory)` — wraps factory → typed namespace with `.get()`, `.create()`, `.snapshot()`
3. **Hook**: `useChat(selector)` — signal-aware, auto-unwrapping, O(1) subscription tracking

**Tradeoffs accepted**:

- Implementation complexity: signal-tracked selector hook needs dependency tracking, subscription diffing, auto-unwrapping facade
- Two mental models: raw `.value` in model code/tests/plugins; unwrapped values in selectors/hooks
- No free devtools: build custom tooling around model mutation events + command log (better fit than Zustand middleware for AI/plugin architecture)
- Internal context OK: "no manual Provider" ≠ "no internal context" — Silvery manages context under `run()`/`createApp()`

**Ecosystem validation**: Signals are the dominant fine-grained reactivity answer (Solid, Preact, Angular, Vue ref/computed). Provider-optional stores are standard (Zustand, Jotai, Nanostores). The direction aligns with where UI/runtime architecture is heading.

**Sources**: `/tmp/llm-e4e70c9a-1773379005619-dr3c.txt` (GPT 5.4 Pro, 974 lines), `/tmp/llm-e4e70c9a-1773376763929-4zm3.txt` (O3, 266 lines).

---

_See also: [scope-tree.md](./scope-tree.md) (effects, scoping, concurrency, observability), [command-centric.md](./command-centric.md) (command registry, auto-derived surfaces), [ai-mode.md](./ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](./app-explosion.md) (the vision)._
