# Silvery API Redesign

_Status: finalized. Bead: km-5kh9r. Implementation: km-silvery.api-impl._

> **Deprecated (2026-03-16).** Original monolithic API design document (8 Sips). Content has been extracted into focused era2/ docs: [02-signals.md](../era2/02-signals.md) (Sips 1-3, signals, createModel), [05-app.md](../era2/05-app.md) (Sips 4-8, app composition, providers, migration), and [decisions.md](../era2/decisions.md) (decision log + design history).

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
import { run, signal, useSignal } from "silvery"

const count = signal(0)

function Counter() {
  const c = useSignal(count) // subscribe via useSyncExternalStore
  useInput((key) => {
    if (key === "j") count.value++
  })
  return <Text>Count: {c}</Text>
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

// ── Product boundary ──────────────────────────────────────────
// Sips 1-3 use silvery (rendering + signals). Sips 4-8 add silvertea (app framework).
// You can stop at any sip.

// ── Sip 4: App composition + commands ─────────────────────────
// An app has two concerns: model (state + behavior) and runtime (I/O + lifecycle).
// Commands are { fn, args? } objects. Keymaps bind keys to commands with when predicates.
const app = pipe(
  createApp(),
  withChat(), // adds app.model.chat — domain state + methods + commands
  withTerminal({
    view: <ChatView />,
    keys: keymap(when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }), {
      escape: commands.app.exit,
    }),
  }),
)
using handle = await run(app)
await handle.waitUntilExit()

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
using handle = await run(app)
await handle.waitUntilExit()

// ── Sip 6: Cross-cutting plugins ───────────────────────────────
// Plugins wrap app.apply() to intercept operations routed through op().
// op(app.model).chat.submit() → apply() pipeline → actual method call.
// Direct calls (app.model.chat.submit()) bypass the pipeline.

const app = pipe(
  createApp(),
  withPersist("./data"),
  withAI({ model: "claude-sonnet-4-20250514" }),
  withChat(),
  withUndo(), // wraps apply() — records model ops for undo
  withTracing(), // wraps apply() — logs all ops
  withRecording(), // wraps apply() — captures ops for replay
  withTerminal({
    view: <ChatView />,
    keys: keymap(when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }), {
      escape: commands.app.exit,
    }),
  }),
)

using handle = await run(app)
await handle.waitUntilExit()

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

### Two concerns, one `apply()` pipeline

An app has two concerns: **model** (all state + behavior) and **runtime** (all I/O + lifecycle). One `apply()` pipeline for interception. The `op()` proxy routes calls through it.

```
┌───────────────────────────────────────────────────────────────┐
│ App                                                           │
│                                                               │
│  ┌─ Model ────────────────────┐ ┌─ Runtime ──────────────────┐│
│  │ app.model.chat.*           │ │ app.rt.providers.*         ││
│  │ app.model.term.*           │ │ app.rt.scope               ││
│  │ app.model.palette.*        │ │ app.rt.hooks               ││
│  └────────────────────────────┘ └────────────────────────────┘│
│                                                               │
│  app.apply(op)  ← plugins wrap this (withUndo, withTracing)   │
│  invoke({ command, args })  ← resolves schema, calls fn       │
│  commands.*     ← { fn, args? } objects, nested tree          │
│                                                               │
│  op(app.model).chat.submit()  → routes through apply()        │
│  op(app.rt).providers.fs.write() → routes through apply()     │
│  app.model.chat.submit()      → direct, no interception       │
│                                                               │
│  Plugins: withChat, withTerminal, withUndo, withTracing, ...  │
└───────────────────────────────────────────────────────────────┘
         │
    run(app)               — runs onStart hooks, renders view, drives event loop
    app.model.chat.submit() — tests/agents call methods directly (no runner needed)
```

Inspired by **SlateJS** (plugins wrap `apply()` via closure), **ProseMirror** (state + commands + transactions), and **hexagonal architecture** (surfaces as adapters). See [05-app.md](../era2/05-app.md) for the full design.

### Two layers

**Layer 1: Convenience** — `run(<Counter />)` or `run(<App />, { providers, models })`. Wires everything internally.

**Layer 2: Explicit** — `pipe(createApp(), withChat(), withUndo(), withTerminal(...))` for full control over providers, models, plugins, and surfaces.

See [05-app.md](../era2/05-app.md) for the full plugin/composition design.

## Key Mechanisms

### The two surfaces

The core architectural idea: state and effects are separate concerns with the same interface.

**Providers** (`createProviders`): Plain frozen object holding typed I/O capabilities. Factory functions return typed APIs; the object collects them with inferred types. Models depend on providers via `Pick<typeof providers, ...>`.

**Models**: Factory functions returning signals (state) + methods (behavior). Dependencies are function parameters. Instantiated by calling the factory with providers.

**Behavioral plugins** (`with*`): Cross-cutting concerns (undo, tracing, recording, keybindings) wrap `apply()` via SlateJS-style closure composition. Data composition (wiring providers to models) uses plain function calls; behavioral composition uses plugins.

### Plugin composition

Plugins are `(app: App) => App`. They wrap `app.apply()` by capturing the old method and installing a new one (SlateJS pattern):

```typescript
function withUndo(): Plugin {
  return (app) => {
    const { apply } = app
    app.apply = (o) => {
      if (o.target === "model") pushHistory(o)
      return apply(o)
    }
    return app
  }
}

function withTracing(): Plugin {
  return (app) => {
    const { apply } = app
    app.apply = (o) => {
      const start = performance.now()
      try {
        return apply(o)
      } finally {
        log.debug?.(o.path.join("."), performance.now() - start)
      }
    }
    return app
  }
}
```

One plugin type, one `apply()` pipeline. Plugins filter by `o.target` ("model" vs "runtime") if they need to distinguish.

The `op()` proxy creates ops from method calls. Direct calls bypass `apply()`:

```typescript
// Through apply() — intercepted by plugins
op(app.model).chat.submit({ text }) // → app.apply({ target: "model", path: ["chat","submit"], ... })
op(app.rt).providers.fs.write(path) // → app.apply({ target: "runtime", path: ["providers","fs","write"], ... })

// Direct — no interception
app.model.chat.submit({ text })
app.rt.providers.fs.write(path)
```

See [05-app.md](../era2/05-app.md) for `op()` implementation, surface plugins, command tree, and composition examples.

### The inner loop

Sync queue drains state mutations; async updates each get a child scope on the runtime. State mutations happen eagerly via signals (last write wins); effects are delegated to the runtime via the scope tree.

**Concurrency** is per-invocation, not global: updates run concurrently by default. _Future: `fx.mutex(key)` for exclusive resource access, `fx.batch(updates)` for atomic multi-update batches._

### Effects and structured concurrency

State mutations happen eagerly via signals; side effects use direct provider calls or scope methods. _Future: typed effect descriptors (`AsyncEffect<T>`) that are `await`-able data, delegated to the runtime via `AsyncLocalStorage` — see [06-scopes.md](../era2/06-scopes.md)._

```typescript
// No effects — plain function
moveCursor(s, { delta }) { s.cursor.value += delta }

// With side effects — v1: direct provider calls, scope for lifecycle
async save(s) { await rt.persist.write("data.json", s.items.value) }

// Sequential — async/await, cancellable via scope
async importAndSave(s, { url }) {
  const data = await fetch(url, { signal: scope.signal })
  s.items.value = data
  await rt.persist.write("data.json", data)
}
```

The runtime surface owns the scope tree. Effects form a hierarchy: runtime scope → model scope → update scope. Cancellation flows down via `AbortSignal`, errors propagate up via promise rejection. No effect outlives its parent scope.

For structured concurrency details, cancellation cascading, scope lifecycle, and testing patterns — see [06-scopes.md](../era2/06-scopes.md). _For the full aspirational effects system (`AsyncEffect`, `fx.from()`, serialization policies, providers) — see [06-scopes.md § Providers vs Effect Providers](../era2/06-scopes.md#providers-vs-effect-providers-future)._

**Two levels of effects** (v1) plus one aspirational:

- **Level 0: Direct provider call** (`rt.persist.write(...)`) — simplest, no scope participation
- **Level 1: Scope methods** (`scope.timeout()`, `scope.sleep()`) — cancellable, lifecycle-aware
- _Level 2 (future): Effect descriptors (`fx.persist(...)`) — testable, recordable, replayable_

Start at Level 0; promote when you need the capabilities of higher levels.

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

Timer effects use scope methods — cancellable and lifecycle-aware:

```typescript
scope.timeout(ms, fn)        // one-shot timer, auto-cancelled on scope disposal
scope.sleep(ms)              // awaitable pause (use in async loops for intervals)

async startAutoSave(s) {
  // Interval via async loop — scope cancellation breaks the sleep
  ;(async () => {
    while (!scope.cancelled) {
      await scope.sleep(30_000)
      if (!scope.cancelled) await s.save()
    }
  })()
},

// One-shot delay
async delayedAction(s) {
  scope.timeout(500, () => s.flash.value = false)
},
```

### Cross-model dispatch

_Future_: Models compose via `fx.dispatch(Model, "method", args)` — the runtime routes to the target model's instance, type-safe (TypeScript infers valid method names and arg types). V1: models call each other directly via `useOtherModel.get().method()`.

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

**Instance scoping**: `createModel(factory)` returns a model hook — a module-level singleton that acts as a factory. The hook itself is a singleton; the instances it creates are scoped. `hook.create({ ...deps })` creates an isolated instance bound to the provided dependencies. When used with `createApp`, instances are bound to the app's scope — multiple app instances create multiple model instances. `.get()` returns the instance in the current scope context.

### Models collection

Model hooks are module-level singletons (the factories). Model instances are scoped per-app or per-test. For apps with multiple models, `createApp` binds all of them to providers at once:

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
  withTerminal({
    view: <ChatView />,
    keys: keymap(
      when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }),
      { escape: commands.app.exit },
    ),
  }),
)

// Shape (varies by plugins applied):
{
  providers: typeof providers,
  models: { chat: typeof useChat, ... },
  view: JSX.Element,

  // From plugins:
  commands: Record<string, Command>, // { fn, args? } objects, nested tree
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

await run(app)               → void                    (interactive lifecycle)
```

Four concepts: **Provider** (I/O factory on `app.rt`), **Model** (state + behavior on `app.model`), **App** (composition root with `apply()`), **Plugin** (`(app) => app`). The `op()` proxy makes method calls interceptable; `commands` makes them discoverable.

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

**Rule of thumb**: Use `Pick<>` for app-internal code, named capability interfaces for shared plugins/packages.

## External Callers

Anything outside the model can call methods directly via `.get()`. No special API — just code.

Three natural ways to run async code alongside an app:

### 1. App plugins (definition-time)

For automation known at app creation — auto-advance, AI agent, recording:

```typescript
function withAutoAdvance(script): AppPlugin {
  return (app) => {
    const scope = app.rt.scope
    // Async work in the app's scope — scoped, cancellable, traced
    ;(async () => {
      for (const entry of script) {
        if (scope.cancelled) break
        useChat.get().submit({ text: entry.content })
        await useChat.get().streaming.waitFor(v => !v)
        await scope.sleep(400)
      }
    })()
    return app
  }
}

// Compose at definition time — no separate "driver" concept:
const app = pipe(
  createApp(<AIChat />, { providers, models: { chat: useChat } }),
  args.auto ? withAutoAdvance(SCRIPT) : identity,
)
using handle = await run(app)
await handle.waitUntilExit()
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

## Decisions

1. **Two concerns, one `apply()`.** Model (state + behavior) and Runtime (I/O + lifecycle). One `app.apply()` pipeline; plugins wrap it. See [05-app.md](../era2/05-app.md).
2. **SlateJS-style plugin composition.** Plugins wrap `app.apply()` via closure. One type: `(app: App) => App`.
3. **`op()` proxy for opt-in interception.** `op(app.model).chat.submit()` routes through `app.apply()`; direct calls bypass it.
4. **Commands are `{ fn, args? }` objects.** `fn` is the behavior (reads/writes signals directly), `args` is an optional schema with `.parse()`. No registry, no string IDs — commands are referenced directly. See [03-commands.md](../era2/03-commands.md) and [04-input.md](../era2/04-input.md).
5. **Surfaces are plugins.** A surface plugin contributes to both `app.model` (view state) and `app.rt` (I/O).
6. **No driver abstraction.** Three patterns: app plugins (definition-time), `run(app, fn)` (runtime), direct calls (tests).
7. **Plugin composition via spread.** TypeScript intersection types accumulate. Last-write-wins; dev mode warns on collisions.
8. **`createModel()` wraps factories into typed hooks.** Factory returns signals + methods; `createModel` adds `.get()`, `.create()`, selector hook. Dependencies via `Pick<typeof providers, ...>`.
9. **Signal auto-unwrapping at the selector boundary.** `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`. Raw `.value` everywhere else.
10. **Signals, not Zustand, as the state primitive.** Zustand is O(n) selector fanout; signals are O(1). Signal references are stable objects, incompatible with Zustand's `Object.is` change detection. Use Zustand as API inspiration, not substrate.
11. **React bridge as separate entry point.** `@silvery/tea/react`, `/svelte`, `/vue`.
12. **Function-calling style over discriminated unions.** Named methods, not switch-case dispatch.
13. **Async effects (future).** _Aspirational: `AsyncEffect<T>` typed effect descriptors, `await`-able and scoped via `AsyncLocalStorage`._ V1: direct provider calls + scope methods. See [06-scopes.md](../era2/06-scopes.md).
14. **Built-in timer effects.** `scope.timeout(ms, fn)` for one-shot, `scope.sleep(ms)` in async loops for intervals — cancellable via scope lifecycle.
15. **Auto-cleanup via AbortSignal.** Cancellation propagates down; errors up. No effect outlives its parent.
16. **`.parse()` interface for args, not Zod-specific.** Framework depends only on `.parse()` — any schema library works. Zod is the ergonomic choice (signal defaults via `z.number().default(() => cursor.value)`), not a dependency.
17. **Structured concurrency via scope tree.** See [06-scopes.md](../era2/06-scopes.md).
18. **`@silvery/tea` independence.** Keep as `@silvery/tea` for now; evaluate standalone after Silvery 1.0.

19. **`run()` owns lifecycle.** Creates root scope, applies `withTerminal()` by default, returns awaitable handle. `run(app, fn)` for automation/testing.
20. **Async/await for updates, generators for content.** `async` yields control (effects/I/O); `async function*` yields content (streaming chunks). Replaces `useTea`'s `streamPhase`/timer-tick pattern.
21. **Providers are plain objects via `createProviders()`.** Single source of truth for I/O types. Models depend via `Pick<typeof providers, "key">`.
22. **Per-invocation concurrency, not global serialization.** `fx.mutex(key)` for exclusive access; `fx.batch(updates)` for atomic batches. No global `withSerialUpdates()`.
23. **`Pick<typeof providers, ...>` for dependency declaration.** Three levels: concrete Pick → type alias Pick → named interfaces. All interoperate via structural typing.
24. **Composition is plain objects, not pipelines.** Providers as typed objects; models via `createModel`; behavioral plugins for cross-cutting concerns only.
25. **No string keys in registration.** Provider/model names come from JS object property names, not string arguments.

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
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel(() => { signals + methods })` → typed hook       | 2 → one wrapper                       |
| `useApp(selector)`                                   | `useChat(m => m.phase)` — per-model typed selector hook       | O(1) subscribe, no Provider           |
| `tea()`, `createStore()`                             | Removed                                                       | Internal, no longer needed            |
| Providers (DI with scoped contract)                  | `createProviders({...})` — plain frozen object                | Types inferred, deps via `Pick`       |
| Runtime = monolith (event loop + I/O + effects)      | Providers (I/O) + behavioral plugins (tracing, recording)     | Data composition + behavioral plugins |
| Plugins add fields via spread only                   | Plugins wrap `apply()` (SlateJS-style) + add fields           | Behavioral composition, not just data |
| Handle = the control surface                         | Model IS the control surface, external code calls it directly | No separate Handle shape              |

## Current State & Migration Path

### Migration from `useTea`

| `useTea` pattern                             | Factory function equivalent                   |
| -------------------------------------------- | --------------------------------------------- |
| `type Msg = { type: "start" } \| ...`        | Named methods on the model factory            |
| `function update(s, msg) { switch... }`      | `start() {}, tick() {}` (methods on object)   |
| `const [state, send] = useTea(init, update)` | `const useChat = createModel(() => { ... })`  |
| `send({ type: "start" })`                    | `useChat.get().submit()` (direct method call) |
| `[state, [fx.delay(...)]]` return            | `async start(s) { await scope.sleep(...) }`   |
| `streamPhase` / `revealFraction` / timers    | `async *respond(s) { yield }` (generator)     |
| `collect([state, effects])` on return value  | `await collect(() => state.chat.respond())`   |

The `collect()` helper survives unchanged. Timer effects migrate from `fx.delay`/`fx.interval` to scope methods (`scope.sleep`, `scope.timeout`). Only the wiring layer changes.

### The three eras

```
Era 1 (current): tea() + createSlice + createStore + useApp — 6 overlapping APIs, state coupled to runtime
Era 1.5 (stop-gap): useTea + fx.* + collect — cleaner effects, but discriminated unions, state inside React
Era 2 (this spec): createModel + signals + createProviders + Pick + behavioral plugins
```

## Implementation

See km-silvery.api-impl (depends on this design doc being finalized).

Phased: Core (signal primitives, `createModel`, `createProviders`) → Bindings (signal-tracked selector hook for React) → Composition (`createApp`, `pipe`, `with*` plugins) → Migration (deprecated `useTea`, `useApp`, `createSlice`).

## Design History

Read before proposing changes — many alternatives were explored and rejected.

- **2026-03-11: Initial design finalized.** Eight Sips progression, two-surface architecture, SlateJS-style plugins, models as factory functions. Validated by O3 deep research.
- **2026-03-12: Model shape decisions.** Flat shape (`state:` only reserved key), providers not runners, `fx.mutex`/`fx.batch` over global serialization, async/await over generators for effects.
- **2026-03-12: Two-surface architecture rewrite.** Replaced Runtime/App split with model + runtime. Branded types prevent cross-surface plugin misapplication.
- **2026-03-12: Prototype (aichat-v2).** Validated design against real AI chat demo. Reduced 327-line TEA state machine to ~140 lines, eliminated 12 of 14 message types. See `vendor/silvery-internal/prototype/aichat-v2/`.
- **2026-03-12: App composition v2.** Simplified from four concerns to two (model, runtime). Introduced `op()` proxy for opt-in interception. See [05-app.md](../era2/05-app.md).
- **2026-03-13: Signals vs Zustand decision.** Zustand's O(n) selector fanout and `Object.is` change detection are fundamentally incompatible with stable signal references. Resolution: `createModel()` wraps factories into signal-aware typed hooks with Zustand-like ergonomics but O(1) performance. Prior sessions confirmed dual-system approaches always duplicated concepts. GPT 5.4 Pro review validated this as Option C (signals with Zustand-like API).
- **2026-03-13: Plugin composition decision.** Generic accumulation via intersection types, not a builder pattern. Each plugin is `(app) => App & { ... }`; `pipe()` chains them with inferred types. Builders require a central class; accumulation lets any package define plugins independently. See [05-app.md](../era2/05-app.md) for details.
- **2026-03-13: `op()` ergonomics finalized.** Method calls only (not signal writes), one op per call, cached proxy instances, strict/loose enforcement modes. See [05-app.md](../era2/05-app.md) for the full contract.

---

_See also: [architecture-overview.md](./architecture-overview.md) (entry point connecting all design docs), [06-scopes.md](../era2/06-scopes.md) (effects, scoping, concurrency, observability), [03-commands.md](../era2/03-commands.md) (command tree, auto-derived surfaces), [05-app.md](../era2/05-app.md) (plugin composition, `op()` ergonomics), [04-input.md](../era2/04-input.md) (keymaps, sources, dispatch), [ai-mode.md](../era3/ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](../era3/app-explosion.md) (the vision)._
