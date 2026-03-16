# The Scope Tree

_A unified tree for effects, concurrency, observability, and lifecycle. Connects [state-api-redesign.md](../archive/state-api-redesign.md) (effects, async updates) with [loggily](../../loggily/) (spans, logs, tracing) and prior work in [legion/centurion](~/Code/legion/centurion/) (structured concurrency)._

## v1 Surface vs Future

**v1 (core)**:

- Scope creation, disposal, and nesting (`Scope`, `[Symbol.dispose]`)
- `scope.sleep(ms)`, `scope.timeout(ms, fn)` — timer primitives with scoped cleanup
- `scope.cancelled` — explicit cancellation checking
- `scope.onDispose(fn)` — scoped cleanup registration
- Testing with mock providers and `withTestClock()`

**Future (defer)**:

- `fx.from()` full API wrapping and execution/serialization policy matrix — see [Appendix: Advanced Effect Policies](#appendix-advanced-effect-policies)
- Advanced plugins (`withRateLimit`, `withPriority`, `withSupervision`, `withRetry`) — see [Appendix: Advanced Plugins](#appendix-advanced-plugins)
- Scope-level permissions and sandboxing
- Full loggily-as-spans integration (scope = span, `withTracing()`)

## The Pattern

A **tree of scopes where ownership, lifecycle, and communication follow the tree edges.** Parent owns children. Cancellation flows down. Errors and results flow up. Nothing outlives its parent.

This pattern appears in every major system — but each implements it for only one concern. Nobody unifies them.

| System                | Name                   | Scope =         | Down =                 | Up =                |
| --------------------- | ---------------------- | --------------- | ---------------------- | ------------------- |
| **Erlang/OTP**        | Supervision tree       | Process         | Shutdown               | Crash notification  |
| **Kotlin**            | CoroutineScope         | Coroutine scope | Cancellation           | Exception           |
| **Swift**             | Structured concurrency | TaskGroup       | Cancellation           | Thrown error        |
| **Java Loom**         | StructuredTaskScope    | Virtual thread  | Shutdown               | Exception           |
| **Trio (Python)**     | Nursery                | Nursery block   | Cancellation           | Exception           |
| **Effect (TS)**       | Fiber tree / Scope     | Fiber           | Interruption           | Failure             |
| **React**             | Component tree         | Component       | Unmount                | Error boundary      |
| **Unix**              | Process group          | Process         | SIGTERM                | Exit code           |
| **C++ RAII**          | Stack frames           | Block scope     | Destructor calls       | —                   |
| **C# / TS**           | `using` / Disposable   | Block scope     | `Dispose()`            | —                   |
| **DOM**               | Element tree           | Element         | `removeChild` cascades | Event bubbling      |
| **OpenTelemetry**     | Span tree              | Span            | —                      | — (observe only)    |
| **Zig**               | Allocator tree         | Allocator       | Free cascades          | —                   |
| **Algebraic effects** | Handler stack          | Effect handler  | —                      | Effects "thrown up" |
| **Legion/Centurion**  | TaskGroup tree         | TaskGroup       | AbortSignal            | Exception           |
| **Silvery**           | Scope tree             | Scope           | Cancellation + cleanup | Error + spans       |

## When Scopes Are Created

- **App startup**: `run(app)` creates the root scope
- **Command invocation**: `invoke({ command, args })` creates a child scope
- **`op()` intercepted async methods**: run in a child scope
- **Direct method calls**: run in the caller's scope (or root if none)
- **`using child = createScope(parent)`**: explicit child scope via `using` cleanup

## Providers vs Effect Providers (Future)

> **Note**: The provider/effect system is future/aspirational. v1 scopes provide only lifecycle (`cancelled`, `onDispose`, `[Symbol.dispose]`) and timers (`sleep`, `timeout`). I/O is done via direct async calls.

Runtime providers (`app.rt.providers`) are plain typed objects providing I/O capabilities. _In the future effects system_, effect providers will be the same objects — `fx.effect()` will create descriptors that look up the appropriate provider at execution time. There will be one provider registry, not two.

## Why It's Not Native

Every programmer uses this pattern daily, yet no mainstream language provides it as a unified primitive. Async broke lexical scoping (Promises outlive the calling function), and the four concerns — memory, concurrency, observability, error handling — each reinvented the tree independently. Structured concurrency (Trio 2018, Kotlin, Swift, Java Loom) is the recent effort to restore scope-as-lifetime for async work.

## What If Everything is Scoped?

The insight: effects, concurrency, observability, and lifecycle aren't separate trees. They're projections of the same tree.

```
Runtime (root scope)
├── Model: Todo
│   ├── importAndSave                      ← child scope (async update)
│   │   ├── fx.fetch(url)                  ← effect (scoped, auto-abortable)
│   │   ├── log.info("fetched", { n })     ← log (scoped to span via ALS)
│   │   └── fx.persist(data)               ← effect (scoped, auto-abortable)
│   ├── scope.timeout(30_000, save)        ← timer (scoped to model)
│   └── log.debug("model initialized")     ← log (scoped to model's span)
├── Model: Navigation
│   └── scope.sleep(100) loop              ← timer loop (scoped to model)
└── View
    └── fx.subscribe(resize, onResize)
```

Every node in this tree has:

- **Identity**: a namespace path (`app:todo:importAndSave:fetch`)
- **Lifetime**: starts when created, ends when scope exits
- **Ownership**: parent created it, parent cleans it up
- **Context**: inherits parent's trace ID, props, state
- **Cancellation**: parent dispose cascades to children, checked via `scope.cancelled`

### Logs ARE scoped

A `log.info("fetched")` inside an async update isn't really "fire-and-forget." It:

- Inherits the span context (trace ID, span ID, parent ID)
- Has a namespace path (`app:todo:importAndSave`)
- Carries inherited props (`{ url, userId }`)
- Is ordered within its scope's timeline
- Appears under its parent in structured trace output

The "fire" is that the caller doesn't wait for it. But it absolutely participates in the tree — it's a leaf node with inherited context. In structured trace output, it appears nested under its scope:

```
SPAN app:todo:importAndSave (246ms)
  INFO app:todo:importAndSave  "fetched" {bytes: 42000}
  SPAN app:todo:importAndSave:fetch (234ms) {url: "..."}
  SPAN app:todo:importAndSave:persist (12ms) {count: 42}
```

The distinction isn't "scoped vs unscoped" — it's "has lifetime vs instant." Spans and ongoing effects have lifetime (they start and end). Logs and fire-and-forget effects are instants (they happen once). Both exist in the tree.

## The Scope Primitive

A scope is a single object that unifies five concerns:

```
Scope
├── cancelled: boolean       ← cancellation (explicit checking)
├── sleep(ms)                ← scoped timer (resolves on dispose)
├── timeout(ms, fn)          ← scoped timer (cleared on dispose)
├── onDispose(fn)            ← cleanup registration
├── [Symbol.dispose]()       ← lifecycle (sets cancelled, runs cleanups)
├── loggily span             ← observability (future)
└── children: Scope[]        ← tree structure
    └── (linked: parent dispose → child dispose)
```

### v1 Canonical Interface

The working prototype uses this minimal interface — no `run(effect)`, `spawn()`, `exec()`, `done()`, or `join()`. Cancellation is checked explicitly via `scope.cancelled`, not via implicit propagation.

```typescript
interface Scope extends Disposable {
  readonly cancelled: boolean
  readonly signal: AbortSignal
  sleep(ms: number): Promise<void>
  timeout(ms: number, fn: () => void): () => void
  onDispose(fn: () => void): void
  [Symbol.dispose](): void
}
```

### Implementation

```typescript
function createScope(parent?: Scope): Scope {
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

    async sleep(ms: number) {
      return new Promise<void>((resolve, reject) => {
        if (cancelled) return resolve()
        const id = setTimeout(resolve, ms)
        scope.onDispose(() => {
          clearTimeout(id)
          resolve() // resolve (don't reject) on dispose — callers check `cancelled`
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

### AsyncEffect — future/aspirational effect descriptor

> **Note**: AsyncEffect and the `fx.*` namespace are **future/aspirational** — not part of the v1 Scope interface. v1 uses `scope.sleep()`, `scope.timeout()`, and direct async code within a scope's lifetime. The effect descriptor system below is the planned extension for tracked, serializable, provider-backed effects.

Each `fx.*` function returns an `AsyncEffect<T>` — a plain data descriptor that is also `await`-able. When `await`ed, it looks up the current scope via `AsyncLocalStorage` and delegates to the scope's provider.

**Caveat: accidental execution.** Because `AsyncEffect` implements `.then()`, passing it to any Promise-aware utility (`Promise.resolve(effect)`, `Promise.all([effect])`, JSON serialization libraries that check for thenables) will trigger execution. Keep effects in typed variables; don't pass them through generic Promise utilities without `await`ing first.

**Caveat: raw promises bypass the scope.** If an update does `await fetch(url)` instead of `await fx.fetch(url)`, it works — but the fetch isn't tracked, traced, or cancellable via the scope's AbortSignal. In dev mode, the runtime should warn when an async update `await`s a raw Promise that isn't an `AsyncEffect`. This catches accidental bypasses without breaking anything — the escape hatch is intentional for cases where you don't need scope integration (e.g., `await Bun.sleep(10)` in a test).

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

// fx namespace — each function returns a typed AsyncEffect
const fx = {
  fetch: (url: string): AsyncEffect<Response> => new AsyncEffect("fetch", { url }),

  persist: (data: unknown): AsyncEffect<void> => new AsyncEffect("persist", { data }),

  all: <T>(effects: AsyncEffect<T>[]): AsyncEffect<T[]> => new AsyncEffect("all", { effects }),
}
```

### `fx.from()` and `fx.effect()` — future API wrapping

`fx.from(impl)` will wrap any object's methods into scoped effect providers. `fx.effect(name)` declares abstract capabilities provided at runtime. Both are deferred to post-v1 — see [Appendix: Advanced Effect Policies](#appendix-advanced-effect-policies) for the full design including serialization and execution policy matrices.

For v1, timers use `scope.sleep(ms)` and `scope.timeout(ms, fn)` directly. The `fx.*` / `AsyncEffect` system is planned for post-v1.

### Effect providers (future) — where AbortSignal meets I/O

> **Note**: Providers are the future execution layer for the `AsyncEffect` system (post-v1). In v1, timers use `scope.sleep()` / `scope.timeout()` directly, and I/O is done via direct async calls within a scope's lifetime.

Providers are where effects actually execute. Every provider receives the scope's `AbortSignal` automatically — no manual threading.

```typescript
const providers: EffectProviders = {
  // fetch — signal passed to native fetch automatically
  async fetch({ url }, { signal }) {
    const response = await fetch(url, { signal })
    return response.json()
    // If scope cancels → signal aborts → fetch throws AbortError
  },

  // persist — signal available for cancellable writes
  async persist({ data }, { signal }) {
    await db.save(data, { signal })
  },

  // all — structured concurrency: child scope per effect, cancel siblings on failure
  async all({ effects }, { scope }) {
    using childScope = createScope(scope)
    try {
      return await Promise.all(effects.map((effect) => scopeContext.run(childScope, () => effect.then((v) => v))))
    } catch (e) {
      childScope[Symbol.dispose]()
      throw e
    }
  },
}
```

### The update author's experience

The developer writes plain async functions. The scope provides cancellation checking and timers:

```typescript
// createModel wraps a factory → typed hook (see state-api-redesign.md §Sip 3)
const useTodo = createModel((scope: Scope) => {
  const items = signal<Item[]>([])

  return {
    items,

    // No effects — plain function
    add({ text }: { text: string }) {
      items.value = [...items.value, { text, done: false }]
    },

    // Effects — async function, direct calls within scope lifetime
    async save() {
      await db.save(items.value)
    },

    // Sequential — each step checks scope.cancelled
    async importAndSave({ url }: { url: string }) {
      const response = await fetch(url)
      const data = await response.json()
      if (scope.cancelled) return
      items.value = data
      await db.save(data)
    },

    // Ongoing — scope.timeout for periodic saves
    startAutoSave() {
      const autoSave = () => {
        if (scope.cancelled) return
        db.save(items.value)
        scope.timeout(30_000, autoSave)
      }
      scope.timeout(30_000, autoSave)
    },

    // Parallel — structured concurrency via child scope
    async batchImport({ urls }: { urls: string[] }) {
      const results = await Promise.all(urls.map((url) => fetch(url).then((r) => r.json())))
      if (scope.cancelled) return
      await db.save(results)
    },

    // Cross-model — direct method call
    async confirm(board: Board) {
      board.addItem({ text: items.value[0]?.text })
    },
  }
})
```

### How cancellation flows — complete example

```typescript
// 1. User triggers importAndSave
// Runtime creates a child scope for the operation

async importAndSave(scope: Scope, s, { url }) {
  // 2. Fetch data — standard async call
  const response = await fetch(url)
  const data = await response.json()

  // 3. Check cancellation explicitly after each await
  //    If the model unmounts DURING the fetch:
  //    → parent scope disposes
  //    → child scope's onDispose callbacks fire
  //    → scope.cancelled becomes true
  //    → next check exits the function
  if (scope.cancelled) return

  s.items.value = data
  await db.save(data)
}

// 4. Error handling — standard try/catch
async importAndSave(scope: Scope, s, { url }) {
  try {
    const response = await fetch(url)
    const data = await response.json()
    if (scope.cancelled) return
    s.items.value = data
    await db.save(data)
  } catch (e) {
    if (scope.cancelled) return               // cancelled — nothing to do
    log.error?.(`Import failed: ${e.message}`)
  } finally {
    log.info?.("cleanup complete")            // always runs
  }
}

// 5. Periodic timer via scope.timeout
function startAutoSave(scope: Scope, s) {
  const tick = () => {
    if (scope.cancelled) return
    db.save(s.items.value)
    scope.timeout(30_000, tick)               // schedule next tick
  }
  scope.timeout(30_000, tick)
  // Model unmount disposes the scope → pending timeout cleaned up automatically
}
```

### Cancellation cascade diagram

```
Model unmounts
  → model scope[Symbol.dispose]()
    → scope.cancelled = true
    → onDispose callbacks fire
      → child scope "importAndSave" disposed
        → child scope.cancelled = true
        → pending sleep/timeout cleared
        → next `if (scope.cancelled) return` exits the function
      → child scope "autoSave" disposed
        → pending timeout cleared (clearTimeout)
      → loggily span ends (with cancellation metadata)
```

Nothing outlives its parent. Every pending timer clears. Every span closes. Cancellation is checked explicitly via `scope.cancelled`.

## Scope Plugins (`with*` composition)

The base scope is minimal: `cancelled`, `sleep()`, `timeout()`, `onDispose()`, `[Symbol.dispose]()`. Everything else is composable via `with*` wrappers — the same SlateJS-style plugin pattern used throughout Silvery. Each `with*` wraps the scope's methods to add behavior.

**v1 plugins**: `withTestClock()` (controllable time for `sleep`/`timeout` tests).

**Future plugins**: `withTracing()`, `withRetry()`, `withRateLimit()`, `withSupervision()`, `withDevtools()` — see [Appendix: Advanced Plugins](#appendix-advanced-plugins).

```typescript
// v1 — test clock for deterministic timer tests
const clock = createTestClock()
const scope = pipe(createScope(), withTestClock(clock))
scope.timeout(1000, () => model.save())
await clock.advance(1000) // timer fires synchronously

// Future — composing multiple plugins
const scope = pipe(
  createScope(),
  withTracing(), // loggily span per scope operation
  withTestClock(), // controllable time
)
```

Same composition model everywhere (see [state-api-redesign.md](../archive/state-api-redesign.md) for the full two-surface architecture):

```
State:    pipe(createState({...}), withUndo(), withValidation())
Runtime:  pipe(createRuntime({...}), withTracing(), withRecording())
Scopes:   pipe(createScope(), withRetry(), withRateLimit())
```

### Testing

Tests create scopes directly and pass them to the code under test:

```typescript
// Level 1: Simple scope — verify behavior within scope lifetime
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
  expect(state.items.value).toEqual([]) // no mutation after cancel
})

// Level 3: Timer behavior with test clock
test("auto-save fires on schedule", async () => {
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

No `scope.run()` or effect descriptors — tests exercise real code with real (or mocked) dependencies. The scope provides lifecycle and timers; everything else is direct.

### Testing timer effects: `withTestClock()`

`scope.sleep()` and `scope.timeout()` are time-dependent — tests shouldn't wait for real time to pass. The `withTestClock()` plugin replaces them with a controllable clock:

```typescript
test("debounced search waits 300ms then fires", async () => {
  const clock = createTestClock()
  using scope = pipe(createScope(), withTestClock(clock))
  const fetched: string[] = []

  search.debounced(scope, state, { query: "foo", onFetch: (url) => fetched.push(url) })

  // No time has passed — search hasn't fired yet
  expect(fetched).toHaveLength(0)

  // Advance 300ms — debounce fires
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

## How Loggily Becomes the Scope Tree (Future)

Loggily already has span hierarchy, ALS propagation, Disposable cleanup, and zero-overhead conditional logging. The scope tree maps naturally: each scope IS a loggily span. Silvery adds cancellation propagation (parent dispose → child dispose), timer primitives (`scope.sleep()`, `scope.timeout()`), and operational plugins (`withRetry()`, `withRateLimit()`).

Two v1-adjacent additions that depend on scopes but not full loggily integration:

- **`fx.mutex(key)`** — named mutex for exclusive resource access within async updates. Scoped — released when the update's scope ends.
- **`fx.batch(updates)`** — group multiple updates into a single atomic batch, triggering one re-render instead of N.

## Why async/await Over Generators

An earlier version used generators (`yield*` with typed adapters). We switched to async/await for three reasons: natural TypeScript typing (async functions return typed Promises naturally — no adapter trick for TS's single-`Next`-type limitation [#32523](https://github.com/microsoft/TypeScript/issues/32523)), explicit cancellation checking via `scope.cancelled`, and universal familiarity. What we lose: generators' synchronous `collect()` and explicit step-by-step control. What we gain: the scope tree as the universal lifecycle/tracing/cancellation mechanism.

## Prior Art

**Kotlin coroutines** (2018) — the most mature scope tree in a mainstream language. `CoroutineScope` maps almost 1:1 to our `Scope`. Key lesson: `SupervisorJob` (don't cancel siblings on failure) is the most-requested deviation from strict structured concurrency.

**Effection v4** — <5KB structured concurrency for JavaScript using generators. Proves scope trees work in production JS. We differ: async/await for natural typing, integrated observability, state management integration.

**Effect.ts** — maximalist typed effect system. Powerful but heavyweight for a TUI framework. Their fiber tree validates scope-as-tree; their `Scope` with finalizers = our DisposableStack.

**Legion/Centurion** — our own prototype. Standalone concurrency library with TaskGroup + AbortSignal. The scope tree completes what centurion started by adding effects-as-data, pluggable providers, and `with*` composition.

**Redux Saga** — same "effects as data" lineage (yield descriptors, test by inspecting). We add structured concurrency and scoped providers instead of a single global middleware.

| Dimension         | Kotlin coroutines       | Effection v4         | Effect.ts               | Silvery scope tree           |
| ----------------- | ----------------------- | -------------------- | ----------------------- | ---------------------------- |
| **Size**          | Language built-in       | <5KB                 | ~200KB+                 | Part of Silvery              |
| **Approach**      | `suspend` + dispatchers | Generators + runtime | Typed effect values     | async/await + AsyncEffect    |
| **Type safety**   | Full (suspend typing)   | Minimal              | Maximum (3 type params) | Natural (await typing)       |
| **DI**            | CoroutineContext        | None                 | Layers + Context        | Pluggable providers          |
| **Observability** | None built-in           | None built-in        | Built-in tracing        | Unified with loggily         |
| **Scope tree**    | Yes (Job hierarchy)     | Yes (core primitive) | Yes (fiber tree)        | Yes (unified with spans)     |
| **Cleanup**       | Job.invokeOnCompletion  | Generator teardown   | Scope finalizers        | `onDispose()` + `using`      |
| **Cancellation**  | CancellationException   | Generator throw      | Fiber interruption      | `scope.cancelled` (explicit) |
| **Plugins**       | CoroutineContext elems  | None                 | Layers                  | `with*` composition          |
| **Testing**       | `runTest { }`           | Run generators       | Provide test layers     | `withTestClock()`, mock deps |

## What This Enables

**Testing**: Create scopes with `withTestClock()`, pass to code under test, verify behavior and `scope.cancelled` state. Mock at the dependency boundary (db, fetch), not the scope itself.

**Debugging**: `TRACE=1` shows the live scope tree — which scopes are active, their nesting, what timers are pending. No separate debugging infrastructure.

**AI agents**: The scope tree is inspectable at runtime. An AI agent can see which scopes are active and their nesting. Combined with the command tree and state access, the agent has full visibility into the app's execution.

**Replay**: Record scope operations (sleep/timeout calls) + dependency results. Replay by providing mock dependencies that feed back recorded results in sequence.

**Time-travel debugging**: Snapshot state at scope boundaries. Step forward/backward through scopes. Each scope is a self-contained unit with clear inputs (args), outputs (state mutations), and duration.

## Open Questions

- **Supervision strategies.** Should scopes support restart policies via `withSupervision()` (Erlang-style one-for-one, etc.), or is cancel-on-error sufficient for TUI apps?

- **Scope-level error boundaries.** Should model scopes have `withErrorBoundary()` (catch and recover vs propagate)?

- **Non-cancellable blocks.** Kotlin has `NonCancellable` for cleanup code that must complete. `scope.onDispose()` likely covers most cases; `withNonCancellable()` if needed.

---

## Appendix: Advanced Effect Policies

_Deferred from v1. Included here for design completeness._

### `fx.from()` — wrapping any API into effects

Any object with methods can become a scoped effect provider: `const fs = fx.from(nodeFs.promises)`. Each method call creates an `AsyncEffect` descriptor. The original function becomes the default provider. The descriptor is serializable data (`{ provider, method, args }`) — looked up by name at execution time.

Two flavors: `fx.from(impl)` wraps existing APIs (real implementation IS the default provider). `fx.effect(name)` declares abstract capabilities provided differently per runtime (toast in terminal vs browser vs test).

### Serialization and execution policies

Effect descriptors are plain data. Two orthogonal configuration axes:

**Creation policy** (on the fx definition): `fx.from(impl)` (raw args, zero overhead), `fx.from(impl, { snapshot: true })` (structuredClone args), `fx.from(impl, { track: false })` (call through directly).

**Execution policy** (on the scope/provider):

| Mode                  | Descriptor       | Scope lookup | Recorded           | Overhead |
| --------------------- | ---------------- | ------------ | ------------------ | -------- |
| **tracked** (default) | Yes              | Yes          | If `withRecording` | ~1-5us   |
| **snapshot**          | Yes + clone args | Yes          | Yes (serializable) | ~5-50us  |
| **direct**            | No               | No           | No                 | ~0       |

Layer priority: runtime > scope > fx definition. Default to raw args (zero overhead). Use `{ snapshot: true }` for mutable-arg APIs. Use `effectMode: "direct"` only when profiling shows it matters.

## Appendix: Advanced Plugins

_Deferred from v1. Included here for design completeness._

Each `with*` wraps the scope's methods to add behavior:

```typescript
// withRetry — wraps timeout to retry on failure
const withRetry =
  ({ attempts, backoff }) =>
  (scope: Scope): Scope => {
    const { timeout } = scope
    scope.timeout = (ms, fn) => {
      let attempt = 0
      const tryFn = () => {
        try {
          fn()
        } catch (e) {
          if (++attempt < attempts) {
            const delay = backoff === "exponential" ? 2 ** attempt * 100 : ms
            timeout(delay, tryFn)
          } else {
            throw e
          }
        }
      }
      return timeout(ms, tryFn)
    }
    return scope
  }

// withTracing — wraps sleep/timeout to create loggily spans
const withTracing =
  () =>
  (scope: Scope): Scope => {
    const { sleep, timeout } = scope
    scope.sleep = async (ms) => {
      const span = loggily.startSpan("sleep", { ms })
      await sleep(ms)
      span.end()
    }
    scope.timeout = (ms, fn) => {
      return timeout(ms, () => {
        const span = loggily.startSpan("timeout", { ms })
        fn()
        span.end()
      })
    }
    return scope
  }
```

Additional plugin ideas: `withRateLimit({ max, per })`, `withPriority(level)`, `withSupervision(strategy)`, `withConcurrencyLimit(n)`, `withTimeout(ms)`, `withDevtools()`.

---

_See also: [architecture-overview.md](../archive/architecture-overview.md) (entry point connecting all design docs), [state-api-redesign.md](../archive/state-api-redesign.md) (signals, models, sip progression), [03-commands.md](./03-commands.md) (command shapes, auto-derived surfaces), [04-input.md](./04-input.md) (keymaps, sources, dispatch), [05-app.md](./05-app.md) (plugin composition, `op()` ergonomics), [ai-mode.md](../era3/ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](../era3/app-explosion.md) (the vision)._
