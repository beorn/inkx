# App Architecture & Scopes

> **Deep-dive** for [00-architecture.md](./00-architecture.md) § Part 2 (Tea) and Async Scope Tree. Plugin composition, domain plugins, op() proxy, structured concurrency. Last synced: 2026-03-19.

_Status: v1 (2026-03-19). Merged from 05-app.md (plugin composition) and 06-scopes.md (structured concurrency). See also: [01-rendering-input.md](./01-rendering-input.md) (rendering, input pipeline), [02-signals.md](./02-signals.md) (signals, models), [03-commands.md](./03-commands.md) (command tree, availability)._

---

## Tea on Top of `create()`

The app kernel is `create()` -- see [00-architecture.md](./00-architecture.md) § Part 0:

```typescript
const app = create() // -> { dispatch, apply, run }
```

Three wrappable methods, zero state. Everything else -- models, commands, keymaps, scopes, rendering -- is added by plugins. `withApp()` and domain plugins build the app architecture on top of that kernel. The `{ model, rt, commands }` shape you see in a full app is what `withApp()` + domain plugins produce, not a competing kernel shape.

The progression:

| Level | What you add | What you get |
|---|---|---|
| **Foundation** | `create()` | `{ dispatch, apply, run }` -- zero state |
| **+ Scope** | `withScope()` | `app.scope`, `op.scope` (lazy), `app.quit()` |
| **+ Tea** | `withApp()` | `app.models`, `app.commands`, `app.keymap()`, `app.command()` |
| **+ Domains** | `withTodo()`, `withEditor()`, ... | Populated models, commands, keybindings |
| **+ Rendering** | `withAg()`, `withTerm()`, `withReact()` | Node tree, terminal I/O, React reconciler |

Each layer only calls down. Tea doesn't know about rendering. Domains don't know about each other (unless explicitly ordered). The kernel doesn't know about anything.

---

## Plugin Composition Philosophy

### `withApp()` -- The App Infrastructure Plugin

`withApp()` installs the registries (models, commands, keymap) and the apply-chain logic for command execution and key resolution. It does not add domain state -- that's what domain plugins do.

See [00-architecture.md](./00-architecture.md) § Part 2 for the full `withApp()` implementation. The key points:

- **`app.models`** -- registry for domain state (populated by domain plugins)
- **`app.commands`** -- discoverable command tree (populated by domain plugins)
- **`app.keymap()`** -- registers keybindings (called by domain plugins)
- **`app.registerCommand()`** -- maps command object refs to string paths (for serialization)
- **`app.command()`** -- typed dispatch convenience (returns `op.pending`)

Without `withApp()`, `create()` apps can still use `dispatch()` and `apply()` directly -- Tea is opt-in infrastructure for the command/model/keymap pattern.

### How Plugins Compose

Plugins compose on `create()` via `pipe()`. Each plugin wraps one or more of the three methods (`dispatch`, `apply`, `run`) to add behavior. There are no special categories -- a plugin does whatever it needs. Common patterns:

| Pattern | What it does | Examples |
|---|---|---|
| **Domain** | Adds model + commands + keybindings | `withTodo()`, `withEditor()`, `withChat()` |
| **Infrastructure** | Wraps `dispatch` or `apply` | `withScope()`, `withLogging()`, `withHistory()` |
| **Renderer** | Provides `run()` | `withTerm()` |
| **Adapter** | Bridges framework to ag tree | `withReact()`, `withSvelte()` (future) |
| **Cross-cutting** | Wraps `apply()` for observation | `withTracing()`, `withRecording()` |

Last plugin in `pipe` wraps `apply()` outermost -- it intercepts first.

---

## Domain Plugin Pattern

Each domain plugin is self-contained: model + commands + keybindings in one plugin. Closure access, no `this`. `app.keymap?.()` for headless compatibility.

```typescript
function withMyDomain() {
  return (app) => {
    // 1. Create model instance
    const model = myModel.create()
    app.models.myDomain = model

    // 2. Register commands
    app.commands.myDomain = {
      doThing: {
        title: "Do Thing",
        fn() {
          model.doThing()
        },
      },
    }
    for (const [name, cmd] of Object.entries(app.commands.myDomain)) {
      app.registerCommand?.(["myDomain", name], cmd)
    }

    // 3. Register keybindings (conditional -- absent in headless)
    app.keymap?.({
      d: app.commands.myDomain.doThing,
    })

    return app
  }
}
```

### Cross-domain keybindings with `when()`

`when()` returns per-binding descriptors carrying a live signal. Object spread produces descriptors, not eagerly computed values:

```typescript
function withEditor() {
  return (app) => {
    const editor = editorModel.create()
    app.models.editor = editor

    // ...commands...

    app.keymap?.({
      i: app.commands.editor.enter_edit,
      ...when(editor.isEditing, {
        Escape: app.commands.editor.exit_edit,
        Enter: { command: app.commands.todo.add, prompt: "text" },
      }),
    })

    return app
  }
}
```

`app.keymap()` inspects each value -- if it has a `when` property, the binding is conditional. The signal is called at input time -- lazy evaluation, not reactive subscription. Domain plugins that reference other domains' commands must come after them in the pipe.

### Full composition example

```typescript
const app = pipe(
  create(),
  withScope(),
  withAg(),
  withApp(),                    // models + commands + keymap registries
  withTodo(),                   // domain
  withEditor(),                 // domain
  (app) => {                    // inline domain
    app.commands.app = { quit: { title: "Quit", fn() { app.quit?.() } } }
    app.registerCommand?.(["app", "quit"], app.commands.app.quit)
    app.keymap?.({ q: app.commands.app.quit })
    return app
  },
  withTerm({ mouse: true }),
  withReact({ view: <App /> }),
)
await app.run()
```

### Headless testing

```typescript
// Model unit test -- signals use function-call syntax
const todo = todoModel.create()
todo.add("test")
todo.add("another")
todo.moveDown()
expect(todo.cursor()).toBe(1)
expect(todo.items()[0].done()).toBe(false) // deep store -- read nested
todo.toggleDone()
expect(todo.items()[1].done()).toBe(true)

// App test -- full pipeline without rendering
const app = pipe(create(), withApp(), withTodo())
await app.command(app.commands.todo.add, { text: "test" })
```

`withTodo()` calls `app.keymap?.()` -- conditional. Headless works because no renderer emits input ops, so bindings are never evaluated.

---

## `op()` Proxy -- Interception Bridge

`op()` bridges the operation spectrum: you write **op-as-object** code (method calls with closures), but `op()` captures it as **op-as-data** (serializable `{ target, path, args }` descriptors) and routes it through `apply()`. The ergonomic cost of going from op-as-object to op-as-data is near zero -- same methods, same types, same autocomplete.

```typescript
// Direct -- not intercepted, fast, impure
app.models.chat.submit({ text: "hello" })

// Through apply() -- intercepted by plugins (undo, tracing, recording)
op(app.models).chat.submit({ text: "hello" })
```

### Semantic contract

- `op()` intercepts **method calls only** -- not property reads, not signal writes
- The **method call is the operation boundary** -- plugins see one op per method call, regardless of how many signals it writes internally
- Plugins can observe, wrap, or cancel execution via `app.apply()`
- Apps can run in **loose mode** (direct calls allowed) or **strict mode** (state-changing methods must go through `op()` or `dispatch()`)
- `op()` does NOT intercept signal reads -- components read signals directly via the function-call accessor (`cursor()`, not `.value`)

> **Note**: The implementation below is illustrative pseudocode. A production implementation must handle nested path accumulation, receiver binding, proxy identity caching, async generator methods, and symbol properties.

```typescript
function op<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const val = Reflect.get(obj, prop, receiver)
      if (typeof val === "function") {
        return (...args: any[]) =>
          app.apply({
            target: "model",
            path: [prop], // e.g., ["chat", "submit"]
            args,
            run: () => val.apply(obj, args),
          })
      }
      // Nested access -- return another proxy to capture the full path
      if (typeof val === "object" && val !== null) return op(val)
      return val
    },
  })
}
```

Plugins wrap `app.apply()` to intercept:

```typescript
// Undo -- only cares about model ops
function withHistory() {
  return (app) => {
    const { apply } = app
    app.apply = (o) => {
      if (o.target === "model") pushUndo(o)
      return apply(o)
    }
    return app
  }
}

// Tracing -- sees everything
function withTracing() {
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

### `commandProxy()` -- Dispatch Convenience

All command surfaces go through `dispatch()` -- observable, interceptable, scoped:

```typescript
// Proxy convenience -- captures as op, routes through dispatch
commandProxy(app).todo.add({ text: "Buy milk" })

// app.command() -- typed convenience over dispatch, returns op.pending
await app.command(app.commands.todo.add, { text: "x" })

// String path -- for serialization/replay
await app.command("todo.add", { text: "x" })

// Raw dispatch -- lowest level
app.dispatch({ type: "command", path: ["todo", "add"], args: { text: "x" } })

// Escape hatch -- bypasses dispatch, scopes, logging, validation, replay:
app.commands.todo.move_down.fn() // direct -- tests only
```

`app.command()` resolves the command ref to a path, calls `dispatch()`, and returns `op.pending`. `commandProxy()` is syntactic sugar that does the same via a Proxy.

### When to use `op()`

The caller decides per-call:

- **State mutations that need interception** (undo, recording, collaboration): use `op(app.models)`
- **Fire-and-forget, performance-critical, or internal bookkeeping**: call directly

For some apps, `op()` may be required for all state mutations (e.g., rich text editors where undo must see everything). For others, it's opt-in (e.g., a chat app where only submit/compact matter). The framework doesn't prescribe -- the app's conventions do.

### Enforcement modes

- **Loose mode** (default): Direct calls and `op()` calls coexist. The app's conventions decide which to use.
- **Strict mode**: State-changing model methods must go through `op()` or `dispatch()`. Direct calls in strict mode throw in dev (warn in prod). Useful for rich text editors where undo must see every mutation.

---

## Async Scope Tree

A **tree of scopes where ownership, lifecycle, and communication follow the tree edges.** Parent owns children. Cancellation flows down. Errors and results flow up. Nothing outlives its parent.

This pattern appears in every major system -- but each implements it for only one concern:

| System | Name | Scope = | Down = | Up = |
|---|---|---|---|---|
| **Kotlin** | CoroutineScope | Coroutine scope | Cancellation | Exception |
| **Swift** | Structured concurrency | TaskGroup | Cancellation | Thrown error |
| **Trio (Python)** | Nursery | Nursery block | Cancellation | Exception |
| **React** | Component tree | Component | Unmount | Error boundary |
| **C# / TS** | `using` / Disposable | Block scope | `Dispose()` | -- |
| **Silvery** | Scope tree | Scope | Cancellation + cleanup | Error + spans |

The insight: effects, concurrency, observability, and lifecycle aren't separate trees. They're projections of the same tree.

### `createScope()` -- The Primitive

A scope is a single object that unifies five concerns:

```
Scope
|-- cancelled: boolean       <- cancellation (explicit checking)
|-- signal: AbortSignal      <- native integration
|-- sleep(ms)                <- scoped timer (resolves on dispose)
|-- timeout(ms, fn)          <- scoped timer (cleared on dispose)
|-- onDispose(fn)            <- cleanup registration
|-- [Symbol.dispose]()       <- lifecycle (sets cancelled, runs cleanups)
|-- child(name?)             <- tree structure
    `-- (linked: parent dispose -> child dispose)
```

#### Canonical interface

```typescript
interface Scope extends Disposable {
  readonly cancelled: boolean
  readonly signal: AbortSignal
  child(name?: string): Scope
  sleep(ms: number): Promise<void>
  timeout(ms: number, fn: () => void): () => void
  onDispose(fn: () => void): void
  [Symbol.dispose](): void
}
```

#### Implementation

```typescript
function createScope(name?: string, parent?: Scope): Scope {
  let cancelled = false
  const disposables: (() => void)[] = []
  const ac = new AbortController()

  // Parent cancellation cascades to children
  if (parent) {
    parent.onDispose(() => scope[Symbol.dispose]())
  }

  const scope: Scope = {
    get cancelled() {
      return cancelled
    },

    get signal() {
      return ac.signal
    },

    child(childName?: string) {
      return createScope(childName, scope)
    },

    async sleep(ms: number) {
      return new Promise<void>((resolve) => {
        if (cancelled) return resolve()
        const id = setTimeout(resolve, ms)
        scope.onDispose(() => {
          clearTimeout(id)
          resolve() // resolve (don't reject) on dispose -- callers check `cancelled`
        })
      })
    },

    timeout(ms: number, fn: () => void): () => void {
      const id = setTimeout(fn, ms)
      const cancel = () => clearTimeout(id)
      scope.onDispose(cancel)
      return cancel
    },

    onDispose(fn: () => void) {
      disposables.push(fn)
    },

    [Symbol.dispose]() {
      cancelled = true
      ac.abort()
      for (const fn of disposables) fn()
      disposables.length = 0
    },
  }

  return scope
}
```

### When Scopes Are Created

- **App startup**: `withScope()` creates the root scope (`app.scope`)
- **Command dispatch**: `withScope()` lazily creates a child scope on `op.scope` first access
- **`op()` intercepted async methods**: run in a child scope
- **Direct method calls**: run in the caller's scope (or root if none)
- **Explicit**: `using child = app.scope.child("my-work")`

### Named Scopes

Scopes carry optional names for debugging and observability:

```
app (root)
|-- op:command:todo.add
|-- op:command:file.save
|   |-- op:command:file.validate
|-- batch
|   |-- op:command:todo.add
|   |-- op:command:todo.add
```

`withScope()` auto-generates names from op type and command path. Callers can provide their own:

```typescript
const batch = app.scope.child("batch")
```

---

## Scope Ownership: Auto-Created vs Caller-Provided

The framework tracks which scopes it created vs which the caller provided. This determines who is responsible for disposal.

**Auto-created scopes** (via `withScope()`'s lazy `op.scope` getter): tracked internally via `WeakSet`, disposed automatically after command completion.

**Caller-provided scopes** (set on the op before dispatch): NOT disposed by the framework -- the caller controls the lifetime.

```typescript
// Auto-created -- framework disposes after command completes
app.dispatch({ type: "command", path: ["todo", "add"], args: { text: "test" } })
// op.scope created lazily, disposed by withApp() after fn() settles

// Caller-provided -- caller controls lifetime
const batch = app.scope.child("batch")
const op1 = { type: "command", path: ["todo", "add"], scope: batch }
const op2 = { type: "command", path: ["todo", "add"], scope: batch }
app.dispatch(op1)
app.dispatch(op2)
batch[Symbol.dispose]() // caller controls lifetime
```

No public `_callerScope` flag -- ownership is detected automatically by checking whether the scope existed on the op before `withScope()` installed its lazy getter.

### Root scope lifecycle

`withScope()` wraps `run()` to dispose the root scope on exit:

```typescript
// Simplified from 00-architecture.md withScope() implementation
app.run = async () => {
  try {
    await prevRun?.()
  } finally {
    scope.dispose() // root scope -- cascades to all children
  }
}
```

---

## Timer APIs

### `sleep(ms)` -- Scoped Delay

Resolves after `ms` milliseconds, or resolves immediately if the scope is already cancelled. On dispose, pending sleeps resolve (not reject) -- callers check `scope.cancelled`:

```typescript
async importAndSave(scope: Scope, { url }) {
  const response = await fetch(url)
  const data = await response.json()
  if (scope.cancelled) return   // check after each await
  items(data)
  await scope.sleep(100)        // resolves early if scope disposed
  if (scope.cancelled) return
  await db.save(data)
}
```

### `timeout(ms, fn)` -- Scoped Timer

Calls `fn` after `ms` milliseconds. Returns a cancel function. Cleared automatically on scope dispose:

```typescript
// Periodic auto-save
function startAutoSave(scope: Scope) {
  const tick = () => {
    if (scope.cancelled) return
    db.save(items())
    scope.timeout(30_000, tick)  // schedule next tick
  }
  scope.timeout(30_000, tick)
  // Model unmount disposes the scope -> pending timeout cleaned up automatically
}
```

### `onDispose(fn)` -- Cleanup Registration

Registers a callback to run when the scope is disposed. Used for resource cleanup:

```typescript
const subscription = events.subscribe(handler)
scope.onDispose(() => subscription.unsubscribe())
```

### Cancellation Cascade

```
Model unmounts
  -> model scope[Symbol.dispose]()
    -> scope.cancelled = true
    -> onDispose callbacks fire
      -> child scope "importAndSave" disposed
        -> child scope.cancelled = true
        -> pending sleep/timeout cleared
        -> next `if (scope.cancelled) return` exits the function
      -> child scope "autoSave" disposed
        -> pending timeout cleared (clearTimeout)
```

Nothing outlives its parent. Every pending timer clears. Every span closes. Cancellation is checked explicitly via `scope.cancelled`.

---

## Testing with Scopes

### Direct scope creation

Tests create scopes directly and pass them to the code under test:

```typescript
// Level 1: Simple scope -- verify behavior within scope lifetime
test("save persists items", async () => {
  using scope = createScope()
  const db = mockDb()
  await todo.save(scope, state, db)
  expect(db.saved).toEqual([items])
})

// Level 2: Cancellation behavior
test("cancellation stops import", async () => {
  using scope = createScope()
  const promise = todo.importAndSave(scope, state, { url: "/slow" })
  scope[Symbol.dispose]() // cancel mid-flight
  await promise
  expect(scope.cancelled).toBe(true)
  expect(state.items()).toEqual([]) // no mutation after cancel
})
```

### `withTestClock()` -- Deterministic Timer Tests

`scope.sleep()` and `scope.timeout()` are time-dependent. The `withTestClock()` plugin replaces them with a controllable clock:

```typescript
test("debounced search waits 300ms then fires", async () => {
  const clock = createTestClock()
  using scope = pipe(createScope(), withTestClock(clock))
  const fetched: string[] = []

  search.debounced(scope, state, { query: "foo", onFetch: (url) => fetched.push(url) })

  // No time has passed -- search hasn't fired yet
  expect(fetched).toHaveLength(0)

  // Advance 300ms -- debounce fires
  await clock.advance(300)
  expect(fetched).toContain("/search?q=foo")
})

test("periodic save fires repeatedly", async () => {
  const clock = createTestClock()
  using scope = pipe(createScope(), withTestClock(clock))
  const db = mockDb()

  todo.startAutoSave(scope, state, db)

  await clock.advance(30_000) // first tick
  expect(db.saved).toHaveLength(1)

  await clock.advance(30_000) // second tick
  expect(db.saved).toHaveLength(2)
})
```

`withTestClock()` intercepts `scope.sleep()` and `scope.timeout()`. `clock.advance(ms)` resolves pending timers synchronously. No real `setTimeout` calls, no flaky timing. Disposing the scope clears all pending timers.

---

## The Unified Scope Tree

Every node in the scope tree has:

- **Identity**: a namespace path (`app:todo:importAndSave:fetch`)
- **Lifetime**: starts when created, ends when scope exits
- **Ownership**: parent created it, parent cleans it up
- **Context**: inherits parent's trace ID, props, state
- **Cancellation**: parent dispose cascades to children, checked via `scope.cancelled`

```
Runtime (root scope)
|-- Model: Todo
|   |-- importAndSave                      <- child scope (async update)
|   |   |-- fetch(url)                     <- async call (scoped via signal)
|   |   |-- log.info("fetched", { n })     <- log (scoped to span via ALS)
|   |   `-- persist(data)                  <- async call (scoped via signal)
|   |-- scope.timeout(30_000, save)        <- timer (scoped to model)
|   `-- log.debug("model initialized")     <- log (scoped to model's span)
|-- Model: Navigation
|   `-- scope.sleep(100) loop              <- timer loop (scoped to model)
`-- View
    `-- subscribe(resize, onResize)
```

### Scope plugins (`with*` composition)

The base scope is minimal: `cancelled`, `sleep()`, `timeout()`, `onDispose()`, `[Symbol.dispose]()`. Everything else is composable via `with*` wrappers -- the same plugin pattern used throughout Silvery.

**v1 plugins**: `withTestClock()` (controllable time for `sleep`/`timeout` tests).

**Future plugins**: `withTracing()`, `withRetry()`, `withRateLimit()`, `withSupervision()`, `withDevtools()`.

```typescript
// v1 -- test clock for deterministic timer tests
const clock = createTestClock()
const scope = pipe(createScope(), withTestClock(clock))

// Future -- composing multiple plugins
const scope = pipe(
  createScope(),
  withTracing(), // loggily span per scope operation
  withTestClock(), // controllable time
)
```

---

## Future: Effects System

> **Everything in this section is post-v1.** v1 uses `scope.sleep()`, `scope.timeout()`, and direct async calls within a scope's lifetime. The effect descriptor system below is the planned extension for tracked, serializable, provider-backed effects.

### `AsyncEffect` -- Effect Descriptors

Each `fx.*` function returns an `AsyncEffect<T>` -- a plain data descriptor that is also `await`-able. When `await`ed, it looks up the current scope via `AsyncLocalStorage` and delegates to the scope's provider.

```typescript
class AsyncEffect<T> {
  constructor(
    readonly type: string,
    readonly args: Record<string, unknown>,
  ) {}

  then<R>(resolve: (value: T) => R | PromiseLike<R>, reject?: (error: unknown) => R | PromiseLike<R>): Promise<R> {
    const scope = currentScope() // ALS lookup
    return scope.provider(this).then(resolve, reject)
  }
}

const fx = {
  fetch: (url: string): AsyncEffect<Response> => new AsyncEffect("fetch", { url }),
  persist: (data: unknown): AsyncEffect<void> => new AsyncEffect("persist", { data }),
  all: <T>(effects: AsyncEffect<T>[]): AsyncEffect<T[]> => new AsyncEffect("all", { effects }),
}
```

**Caveat: accidental execution.** Because `AsyncEffect` implements `.then()`, passing it to any Promise-aware utility (`Promise.resolve(effect)`, `Promise.all([effect])`) will trigger execution. Keep effects in typed variables; don't pass them through generic Promise utilities without `await`ing first.

**Caveat: raw promises bypass the scope.** If an update does `await fetch(url)` instead of `await fx.fetch(url)`, the fetch isn't tracked, traced, or cancellable via the scope's AbortSignal. Dev mode warns when an async update `await`s a raw Promise that isn't an `AsyncEffect`.

### `fx.from()` -- API Wrapping

`fx.from(impl)` wraps any object's methods into scoped effect providers. `fx.effect(name)` declares abstract capabilities provided at runtime. Both are deferred to post-v1.

### Effect Providers

Providers are where effects actually execute. Every provider receives the scope's `AbortSignal` automatically:

```typescript
const providers: EffectProviders = {
  async fetch({ url }, { signal }) {
    const response = await fetch(url, { signal })
    return response.json()
    // If scope cancels -> signal aborts -> fetch throws AbortError
  },

  async persist({ data }, { signal }) {
    await db.save(data, { signal })
  },
}
```

### Future Scope Plugins

Each `with*` wraps the scope's methods to add behavior:

```typescript
// withRetry -- wraps timeout to retry on failure
const withRetry = ({ attempts, backoff }) => (scope: Scope): Scope => {
  const { timeout } = scope
  scope.timeout = (ms, fn) => {
    let attempt = 0
    const tryFn = () => {
      try { fn() }
      catch (e) {
        if (++attempt < attempts) {
          const delay = backoff === "exponential" ? 2 ** attempt * 100 : ms
          timeout(delay, tryFn)
        } else throw e
      }
    }
    return timeout(ms, tryFn)
  }
  return scope
}
```

Additional ideas: `withRateLimit({ max, per })`, `withPriority(level)`, `withSupervision(strategy)`, `withConcurrencyLimit(n)`, `withTimeout(ms)`, `withDevtools()`.

---

## Composition Examples

### Rich text editor -- more plugins, same pattern

```typescript
const editor = pipe(
  create(),
  withScope(),
  withAg(),
  withApp(),

  // Editing core
  withDocument(store),
  withCursor(),
  withSelection(),

  // Rich text -- each adds state + commands + apply() interception
  withBold(),
  withItalic(),
  withLists(),
  withCodeBlocks(),
  withTables(),

  // Cross-cutting
  withHistory(),          // undo -- intercepts op(models) calls
  withCollaboration(),    // CRDT -- wraps document ops

  // Surface
  withTerm({ mouse: true }),
  withReact({ view: <EditorView /> }),
)
```

### Swapping surfaces

```typescript
// Terminal TUI
pipe(create(), withScope(), withAg(), withApp(), ...domains, withTerm(), withReact({ view: <App /> }))

// Browser (future) -- no ag, tea on native React DOM
pipe(create(), withScope(), withApp(), ...domains, withReactDOM({ view: <App />, root: "#app" }))
```

Domain plugins are surface-agnostic. Drop the terminal, add a browser adapter -- models and commands stay the same.

### `createApp()` preset

Hides the pipe for the common case:

```typescript
function createApp(options: {
  view: ReactElement
  domains: Plugin[]
  term?: TermOptions
}) {
  return pipe(
    create(), withScope(), withAg(), withApp(),
    ...options.domains,
    withTerm(options.term), withReact({ view: options.view }),
  )
}

const app = createApp({
  view: <App />,
  domains: [withTodo(), withEditor()],
})
await app.run()
```

---

## Open Questions

- **Plugin ordering.** Last plugin in `pipe` wraps `apply()` outermost -- it intercepts first. Should the framework detect/enforce ordering, or is it convention?

- **Plugin identity.** Can a plugin be added twice? Should plugins have IDs for dedup/replacement?

- **Hot reloading.** Can plugins be added/removed at runtime? Rich text editing may need this (enable/disable formatting based on context). Or is composition static?

- **Supervision strategies.** Should scopes support restart policies via `withSupervision()` (Erlang-style one-for-one), or is cancel-on-error sufficient for TUI apps?

- **Non-cancellable blocks.** Kotlin has `NonCancellable` for cleanup code that must complete. `scope.onDispose()` likely covers most cases; `withNonCancellable()` if needed.

---

_See also: [00-architecture.md](./00-architecture.md) (canonical reference), [02-signals.md](./02-signals.md) (signals, models), [03-commands.md](./03-commands.md) (command shapes), [04-input.md](./04-input.md) (keymaps, dispatch), [05-app.md](./05-app.md) (original app composition detail), [06-scopes.md](./06-scopes.md) (original scope tree detail)._
