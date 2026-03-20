# Signals & Models

> **Deep-dive** for [00-architecture.md](./00-architecture.md) § Reactive Data Graph. Progressive signal API, createModel, createStore, createResource. Last synced: 2026-03-19.

_Status: finalized. Extracted from [state-api-redesign.md](../archive/state-api-redesign.md) Sips 1-3._

_See also: [05-app.md](./05-app.md) (app composition), [06-scopes.md](./06-scopes.md) (structured concurrency), [01-quick-start.md](./01-quick-start.md) (complete examples)._

## The Progressive API (Sips 1-3)

Eight sips from `useState` to full apps. Each step adds one thing. Nothing rewrites. This document covers the first three sips -- the signal and model layer.

```tsx
// -- Sip 1: Just React -----------------------------------------------
import { run } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((key) => {
    if (key === "j") setCount((c) => c + 1)
  })
  return <Text>Count: {count}</Text>
}

await run(<Counter />)

// -- Sip 2: Shared state via signals ---------------------------------
import { run, signal, useSignal } from "silvery"

const count = signal(0)

function Counter() {
  const c = useSignal(count) // subscribe via useSyncExternalStore
  useInput((key) => {
    if (key === "j") count(count() + 1) // read with count(), write with count(newValue)
  })
  return <Text>Count: {c}</Text>
}

await run(<Counter />)

// -- Sip 3: Models -- createModel wraps factory -> typed hook ---------
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
      exchanges([...exchanges(), { role: "user", text }]) // read: exchanges(), write: exchanges(newValue)
    },
    clear() {
      exchanges([])
    },
  }
})

// Direct access (tests, plugins, AI agents):
useChat.get().submit({ text: "hello" })
useChat.get().exchanges() // [{ role: "user", text: "hello" }]

// Signal-tracked selector hook -- O(1) subscriptions:
function ChatView() {
  const count = useChat((m) => m.exchanges().length) // calls accessor, subscribes to exchanges
  const isStreaming = useChat((m) => m.streaming()) // calls accessor, subscribes to streaming
  const submit = useChat((m) => m.submit) // stable method ref (not a signal)
  return <Text>{count} messages</Text>
}

await run(<ChatView />)
```

```
// -- Product boundary -------------------------------------------------
// Sips 1-3 use silvery (rendering + signals). Sips 4-8 add silvertea (app framework).
// You can stop at any sip.
```

## Implementation

**`@silvery/signal` re-exports [alien-signals](https://github.com/stackblitz/alien-signals)** as the reactive engine — the fastest signals implementation (1.8KB gzip, push-pull, version counting, proven by Vue 3.6 adoption). Silvery adds layers on top:

| Layer                          | API                                             | Purpose                                                               |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------- |
| **Core** (alien-signals)       | `signal()`, `computed()`, `effect()`, `batch()` | Reactive primitives — `sig()` to read, `sig(newValue)` to write       |
| **Stores** (alien-deepsignals) | `createStore(initial)`                          | Deep proxy — nested property access returns signal accessors (~2.7KB) |
| **Resources** (silvery)        | `createResource(fetcher)`                       | Async bridge — `res()` for data, `res.loading()`, `res.error()`       |
| **React** (silvery)            | `useSignal(s)`, model selectors                 | `useSyncExternalStore` integration                                    |

### Why getter/setter functions, not `.value`?

Era2 uses the **function-call pattern** (`count()` to read, `count(5)` to write) — same as alien-signals, Angular, and SolidJS. Not `.value` (Vue, Preact). Decision 29.

|                           | `count()` getter                                                                    | `count.value` property                                                  |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Visual clarity**        | Obviously dynamic (it's a function call)                                            | Looks like a plain property read                                        |
| **Capability separation** | Read-only accessor is just `() => T` — can't accidentally write                     | `.value` always exposes both get and set                                |
| **Destructuring**         | `const { count } = model` — count is a function, stays reactive                     | `const { count } = model` — works, but `const { value } = count` breaks |
| **TypeScript**            | `() => T` — indistinguishable from other functions (slightly worse for "find refs") | `Signal<T>` carries type (slightly better for "find refs")              |
| **Industry momentum**     | Angular, SolidJS, alien-signals, S.js, Knockout                                     | Vue, Preact, Qwik                                                       |
| **TC39 proposal**         | `.get()/.set()` methods — designed for frameworks to wrap either way                | —                                                                       |
| **No magic**              | Selectors call accessors explicitly: `m.exchanges().length`                         | Requires auto-unwrapping: `m.exchanges.length` magically reads signal   |

The function-call pattern eliminates the auto-unwrapping complexity (old P3/P5). Selectors are just functions that call accessors — no tracking scope magic needed beyond what alien-signals provides natively. Decision 29 supersedes Decision 9 (signal auto-unwrapping at the selector boundary) — explicit accessor calls replace implicit unwrapping.

**Why alien-signals?** Fastest (~400% over Preact), smallest (1.8KB gzip), zero framework baggage, battle-tested (Vue 3.6, XState, ~3M weekly npm downloads). Deep store tracking via alien-deepsignals (+2.7KB). See [signals-landscape-2026.md](./signals-landscape-2026.md) and decision 26.

**Alternative considered**: `@solidjs/signals` 0.13.5 (Solid 2.0 beta) has everything built-in: stores, projections, async, optimistic, ownership in 14KB. Same getter() pattern. But it requires `createRoot()` ownership and microtask batching with `flush()` — more complex than alien-signals for our needs. Could revisit if we need projections/optimistic updates.

**`batch()`** groups multiple signal writes into one notification. alien-signals auto-batches in microtasks; explicit `batch()` available for synchronous grouping.

## Principles

**P1: Signals are the state primitive.** `signal<T>(initial)` returns a callable accessor — `sig()` reads, `sig(newValue)` writes. Fine-grained O(1) reactivity — only subscribers of the specific signal that changed are notified. Not Zustand stores (O(n) selector fanout), not proxies (too implicit), not bare useState (no sharing).

**P2: createModel wraps factories into typed hooks.** A model is a factory function returning signal accessors + methods. `createModel()` wraps it into a callable hook. The factory IS the definition; `createModel` IS the binding. No separate model interface, no Provider ceremony.

**P3: Selectors call accessors explicitly.** In components, `useChat(m => m.phase())` calls the accessor, which tracks the dependency. No auto-unwrapping magic — the function call IS the subscription point. Same API everywhere: tests, plugins, model code, React components.

**P4: Types are inferred, not declared.** Provider types come from factory return types. Model types come from what the factory returns. `createModel` infers the hook type from the factory. Dependency types use `Pick<typeof providers, ...>`. No manual interface declarations needed.

## Three Layers of State

```
Layer 1: Primitive signals           signal<T>(), computed(), batch()
Layer 2: Model factories             createModel(() => { signal accessors + methods })
Layer 3: Selector hooks              useChat(m => m.phase()) -- tracked, O(1) subscribe
```

Layer 1 is the state primitive — fine-grained, framework-agnostic, testable. Layer 2 wraps factories into typed namespaces with `.get()`, `.create()`, `.snapshot()`. Layer 3 provides Zustand-like ergonomics: the selector calls accessors, which track dependencies. Components re-render only when their specific dependencies change — not on every store update.

## State Access

Same API everywhere — `accessor()` to read, `accessor(newValue)` to write. No context-dependent syntax:

| Context                  | Access                               | Notes                                                   |
| ------------------------ | ------------------------------------ | ------------------------------------------------------- |
| **React components**     | `useChat(m => m.exchanges().length)` | Selector calls accessor — tracked, O(1) subscribe       |
| **Model code / plugins** | `useChat.get().exchanges()`          | Direct accessor call — typed, reactive                  |
| **AI agents / commands** | `useChat.get().submit({ text })`     | Direct method call — typed                              |
| **External (CLI/MCP)**   | `useChat.snapshot()` → JSON          | Serialized snapshot for remote consumers                |
| **Tests**                | `chat.exchanges()`                   | Isolated instance via `.create()` — no framework needed |

## Object Shapes

### Model (via `createModel`)

`createModel()` wraps a factory function -> returns a typed hook + namespace. The factory returns signals (state) + methods (behavior). Dependencies on providers are declared via `Pick`.

```typescript
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  return {
    exchanges,
    streaming,
    submit({ text }: { text: string }) {
      exchanges([...exchanges(), { role: "user", text }])
    },
    async save() {
      await rt.persist.write("chat.json", exchanges())
    },
    async *respond() {
      /* yields content chunks -- see Content streaming */
    },
  }
})

// Shape of the returned hook:
type ModelHook<T> = {
  // Callable as selector hook in React (signal-aware, explicit accessor calls):
  <U>(selector: (model: T) => U, eq?: (a: U, b: U) => boolean): U

  // Direct access (tests, plugins, AI agents, model code):
  get(): T // raw instance with signal fields
  create(deps?: any): T // isolated instance for testing
  snapshot(): Snapshot<T> // plain JSON state (signals -> values)
  subscribe(fn: () => void): () => void
}

// Testing: useChat.create(mockProviders) -- isolated, no framework
// Direct: useChat.get().submit({ text }) -- typed method call
// React: useChat(m => m.exchanges().length) -- O(1) subscribe
```

`createModel` IS the bridge between signals (Layer 1) and Zustand-like hook ergonomics (Layer 3). The factory IS the model definition; `createModel` adds the subscription/hook machinery.

**Instance scoping**: `createModel(factory)` returns a model hook -- a module-level singleton that acts as a factory. The hook itself is a singleton; the instances it creates are scoped. `hook.create({ ...deps })` creates an isolated instance bound to the provided dependencies. When used with `createApp`, instances are bound to the app's scope -- multiple app instances create multiple model instances. `.get()` returns the instance in the current scope context.

### Models Collection

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

Each model hook is independently usable in any component -- no `useModels()` aggregate hook needed. Components import the specific model they need.

### Type System for Dependencies

Three levels -- use what fits:

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

All three interoperate -- TypeScript's structural typing means `Pick<typeof providers, "persist">` and `{ persist: PersistAPI }` are the same type as long as shapes match. Start with Level 1 everywhere. Promote to Level 2 or 3 only when needed.

**Rule of thumb**: Use `Pick<>` for app-internal code, named capability interfaces for shared plugins/packages.

## Stores — Deep Reactive State

Signals are flat cells — `signal<User>({ name: "Alice", address: { city: "NYC" } })` replaces the entire value on any mutation, causing all subscribers to re-run even if they only read `name`.

`createStore()` returns a deep proxy where property access at any depth returns signal accessors:

```typescript
import { createStore } from "@silvery/signal"

const user = createStore({
  name: "Alice",
  address: { city: "NYC", zip: "10001" },
  tags: ["admin"],
})

// Deep access returns accessors — O(1) subscriptions per property
user.name() // "Alice" — read via getter
user.name("Bob") // write — only name subscribers re-run
user.address.city() // "NYC" — deep read, tracked independently
user.address.city("SF") // deep write — only address.city subscribers re-run

// Array operations
user.tags([...user.tags(), "editor"])
```

**Implementation**: Built on alien-deepsignals — adds Proxy-based deep tracking to alien-signals (~2.7KB additional). Property access at any depth returns callable accessors (same `()` read / `(newValue)` write pattern as flat signals). Stores compose uniformly with `computed()`, `effect()`, and model selectors.

**When to use**: Nested objects where different consumers read different properties (km's tree nodes: title, status, children, metadata). When all consumers read the same top-level value, a flat `signal()` is simpler.

## Resources — Async Signals

Bridges async operations (provider calls, DB queries) to the synchronous signal graph:

```typescript
import { createResource } from "@silvery/signal"

const profile = createResource(async () => {
  const data = await rt.api.fetchProfile(userId())
  return data
})

// In components:
profile() // T | undefined (data when loaded)
profile.loading() // boolean
profile.error() // Error | undefined

// Refetches when userId changes (dependency tracked via userId() call inside fetcher)
```

**Design**: Inspired by Solid's `createAsync` and Angular's `resource()`. The fetcher runs in a tracking scope — accessor calls inside it (like `userId()`) become dependencies. When dependencies change, the resource refetches. Loading/error are themselves accessors for fine-grained subscription. Built on the scope tree (06-scopes) for cancellation — if the scope disposes, in-flight fetches are aborted.

## Projections — Reactive Collections (Future)

Reactive transformations over collections that update O(1) when one item changes. Inspired by Ryan Carniato's "Beyond Signals" (Solid 2.0). Example:

```typescript
// Future API — not yet designed
const activeTasks = createProjection(() => allTasks(), {
  filter: (t) => !t.done,
  sort: (a, b) => a.priority - b.priority,
})
// When one task's done status changes → O(1) update to the projection
```

Watch Solid 2.0 (currently beta) for the production-ready API, then adopt. Relevant for km's VirtualList rendering of filtered/sorted node trees.

## Framework Bindings

`@silvery/model` is framework-agnostic. The core is signals + factory functions. Each framework gets a thin binding that implements signal-tracked selectors using the framework's native subscription mechanism:

```tsx
// React -- useSyncExternalStore + signal dependency tracking
import { createModel } from "@silvery/model/react"
const useChat = createModel(() => { ... })
const phase = useChat(m => m.phase())  // explicit accessor call, O(1) subscribe

// Svelte -- writable store bridge
import { createModel } from "@silvery/model/svelte"
const chat = createModel(() => { ... })
$: phase = $chat.phase()  // Svelte reactive statement, explicit accessor

// Vue -- ref() bridge
import { createModel } from "@silvery/model/vue"
const chat = createModel(() => { ... })
const phase = computed(() => chat.phase())  // explicit accessor call
```

The React binding is the primary target. It uses `useSyncExternalStore` internally. The selector function runs in a tracking scope — every `accessor()` call inside the selector is tracked. When any tracked signal changes, the selector reruns and the component re-renders only if the output changed.

This gives **Zustand ergonomics with signal performance**: `useChat(m => m.phase())` looks like a Zustand selector but subscribes to exactly one signal, not the entire store.

## Testing

`.create()` makes an isolated instance with mock providers -- no framework needed:

```typescript
// Unit test -- .create() makes an isolated instance with mock providers
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
expect(chat.exchanges()).toHaveLength(1)

// Test async behavior -- consume the generator
const gen = chat.respond()
for await (const _ of gen) {
  /* consume chunks */
}
expect(chat.exchanges()[1].text).toBe("Hello world")

// Selector assertions without React:
chat.submit({ text: "test" })
expect(chat.exchanges()).toHaveLength(3)

// Integration test -- real providers, test config
const testChat = useChat.create({
  persist: createPersist("/tmp/test"),
  ai: createAI({ model: "claude-haiku-4-5-20251001" }),
})
```

Models are testable without a running app, without React, without providers infrastructure. The `.create(mockDeps)` pattern gives complete isolation: each test gets its own signal instances, its own state, and its own mock I/O.
