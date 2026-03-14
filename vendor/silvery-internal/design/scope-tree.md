# The Scope Tree

_A unified tree for effects, concurrency, observability, and lifecycle. Connects [state-api-redesign.md](./state-api-redesign.md) (effects, async updates) with [loggily](../../loggily/) (spans, logs, tracing) and prior work in [legion/centurion](~/Code/legion/centurion/) (structured concurrency)._

## v1 Surface vs Future

**v1 (core)**:

- Scope creation, disposal, and nesting (`Scope`, `createChild`, `[Symbol.dispose]`)
- `fx.delay()`, `fx.interval()` — timer effects with scoped cleanup
- AbortSignal-based cancellation cascade (parent cancel → child cancel → provider abort)
- Testing with mock providers and `withTestClock()`
- Scoped cleanup via DisposableStack (`scope.defer()`)

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
- **`app.rt.scope.spawn(name, fn)`**: explicit child scope

## Providers vs Effect Providers

Runtime providers (`app.rt.providers`) are plain typed objects providing I/O capabilities. Effect providers are the same objects — `fx.effect()` creates descriptors that look up the appropriate provider at execution time. There is one provider registry, not two.

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
│   ├── fx.interval(30s, "save")           ← ongoing effect (scoped to model)
│   └── log.debug("model initialized")     ← log (scoped to model's span)
├── Model: Navigation
│   └── fx.interval(100, "scrollAnim")
└── View
    └── fx.subscribe(resize, "onResize")
```

Every node in this tree has:

- **Identity**: a namespace path (`app:todo:importAndSave:fetch`)
- **Lifetime**: starts when created, ends when scope exits
- **Ownership**: parent created it, parent cleans it up
- **Context**: inherits parent's trace ID, props, state
- **Cancellation**: AbortSignal from parent, propagated automatically

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
├── AbortController          ← cancellation
├── DisposableStack          ← cleanup
├── loggily span             ← observability
├── effect record[]          ← collection (via ALS)
├── ALS context              ← propagation
└── children: Scope[]        ← tree structure
    └── (linked: parent abort → child abort)
```

### Implementation

```typescript
class Scope implements Disposable {
  #controller = new AbortController()
  #children: Scope[] = []
  #cleanups = new DisposableStack()
  #effects: AsyncEffect[] = []
  #span: Span
  #parentAbortHandler?: () => void

  get signal() {
    return this.#controller.signal
  }

  constructor(
    readonly name: string,
    readonly parent?: Scope,
    private providers: EffectProviders,
  ) {
    // Parent abort → child abort (structured concurrency)
    if (parent) {
      parent.#children.push(this)
      // Guard: parent may already be aborted (race condition)
      if (parent.signal.aborted) {
        this.cancel("parent already aborted")
      } else {
        this.#parentAbortHandler = () => this.cancel()
        parent.signal.addEventListener("abort", this.#parentAbortHandler, { once: true })
      }
    }
    // Scope IS a loggily span
    this.#span = loggily.startSpan(name)
  }

  // Run an effect within this scope
  async run<T>(effect: AsyncEffect<T>): Promise<T> {
    this.#effects.push(effect)
    const provider = this.providers[effect.type]
    // Provider receives the scope's AbortSignal automatically
    return provider(effect.args, { signal: this.signal, scope: this })
  }

  // Create a child scope
  createChild(name: string): Scope {
    return new Scope(`${this.name}:${name}`, this, this.providers)
  }

  // Cancel this scope and all children
  cancel(reason?: string) {
    this.#controller.abort(reason)
    // Children cancel via the abort event listener (automatic)
  }

  // Register cleanup (timers, subscriptions, etc.)
  defer(cleanup: Disposable | (() => void)) {
    this.#cleanups.use(cleanup)
  }

  [Symbol.dispose]() {
    this.cancel("scope disposed")
    // Remove abort listener from parent (prevents memory leak on long-lived parent scopes)
    if (this.parent && this.#parentAbortHandler) {
      this.parent.signal.removeEventListener("abort", this.#parentAbortHandler)
    }
    // Remove from parent's children list
    if (this.parent) {
      const idx = this.parent.#children.indexOf(this)
      if (idx >= 0) this.parent.#children.splice(idx, 1)
    }
    this.#cleanups[Symbol.dispose]()
    this.#span.end()
  }
}
```

### AsyncEffect — the effect descriptor that's also a thenable

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
    return scope.run(this).then(resolve, reject)
  }
}

// fx namespace — each function returns a typed AsyncEffect
const fx = {
  fetch: (url: string): AsyncEffect<Response> => new AsyncEffect("fetch", { url }),

  persist: (data: unknown): AsyncEffect<void> => new AsyncEffect("persist", { data }),

  interval: (ms: number, update: string): AsyncEffect<Disposable> => new AsyncEffect("interval", { ms, update }),

  all: <T>(effects: AsyncEffect<T>[]): AsyncEffect<T[]> => new AsyncEffect("all", { effects }),

  dispatch: (model: Model, update: string, args?: unknown): AsyncEffect<void> =>
    new AsyncEffect("dispatch", { model, update, args }),
}
```

### `fx.from()` and `fx.effect()` — future API wrapping

`fx.from(impl)` will wrap any object's methods into scoped effect providers. `fx.effect(name)` declares abstract capabilities provided at runtime. Both are deferred to post-v1 — see [Appendix: Advanced Effect Policies](#appendix-advanced-effect-policies) for the full design including serialization and execution policy matrices.

For v1, effects are created explicitly via `fx.delay()`, `fx.interval()`, and hand-written `AsyncEffect` constructors in the `fx` namespace.

### Effect providers — where AbortSignal meets I/O

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

  // interval — returns a Disposable, registers cleanup on scope
  async interval({ ms, update }, { signal, scope }) {
    const id = setInterval(() => runtime.send(update), ms)
    const handle = {
      [Symbol.dispose]() {
        clearInterval(id)
      },
    }
    // Auto-cancel when scope exits
    scope.defer(handle)
    // Also cancel if signal fires
    signal.addEventListener("abort", () => handle[Symbol.dispose](), { once: true })
    return handle
  },

  // all — structured concurrency: child scope per effect, cancel siblings on failure
  async all({ effects }, { scope }) {
    const childScope = scope.createChild("all")
    try {
      return await Promise.all(effects.map((effect) => scopeContext.run(childScope, () => effect.then((v) => v))))
    } catch (e) {
      childScope.cancel("sibling failed")
      throw e
    } finally {
      childScope[Symbol.dispose]()
    }
  },

  // dispatch — cross-model messaging
  async dispatch({ model, update, args }, { scope }) {
    const instance = runtime.getInstance(model)
    return instance[update](args)
  },
}
```

### The update author's experience

The developer writes plain async functions. Scoping, cancellation, tracing, and effect recording are automatic:

```typescript
// createModel wraps a factory → typed hook (see state-api-redesign.md §Sip 3)
const useTodo = createModel(() => {
  const items = signal<Item[]>([])
  const autoSave = signal<Disposable | null>(null)

  return {
    items,
    autoSave,

    // No effects — plain function
    add({ text }: { text: string }) {
      items.value = [...items.value, { text, done: false }]
    },

    // Effects — async function, await typed effects
    async save() {
      await fx.persist({ data: items.value })
    },

    // Sequential — each await is scoped, abortable, traced
    async importAndSave({ url }: { url: string }) {
      const data = await fx.fetch(url) // Response — typed naturally
      items.value = data
      await fx.persist({ data })
    },

    // Ongoing effects — returns Disposable
    async startAutoSave() {
      autoSave.value = await fx.interval(30_000, "save")
    },

    // Parallel — structured concurrency
    async batchImport({ urls }: { urls: string[] }) {
      const results = await fx.all(urls.map((url) => fx.fetch(url)))
      // If any fails, siblings are cancelled (scope cancel propagates)
      await fx.persist({ data: results })
    },

    // Cross-model dispatch
    async confirm() {
      await fx.dispatch(useBoard, "addItem", { text: items.value[0]?.text })
    },
  }
})
```

### How cancellation flows — complete example

```typescript
// 1. User triggers importAndSave
// Runtime creates a child scope: app:todo:importAndSave

async importAndSave(s, { url }) {
  // 2. await fx.fetch(url)
  //    → AsyncEffect.then() looks up scope via ALS
  //    → scope.run() calls fetch provider with { signal: scope.signal }
  //    → provider calls native fetch(url, { signal })
  const data = await fx.fetch(url)

  // 3. If the model unmounts DURING the fetch:
  //    → model scope cancels
  //    → model scope's abort event fires
  //    → child scope (importAndSave) receives abort, calls this.cancel()
  //    → child scope's AbortController fires
  //    → signal passed to fetch(url, { signal }) triggers
  //    → fetch throws AbortError
  //    → await rejects
  //    → async function exits (finally block runs if present)
  //    → child scope disposed (span closed, cleanups run)

  s.items.value = data
  await fx.persist({ data })
}

// 4. Error handling — standard try/catch, runs within the scope
async importAndSave(s, { url }) {
  try {
    const data = await fx.fetch(url)
    s.items.value = data
    await fx.persist({ data })
  } catch (e) {
    if (e.name === "AbortError") return       // cancelled — nothing to do
    await fx.toast({ message: `Import failed: ${e.message}` })
  } finally {
    log.info?.("cleanup complete")            // always runs
  }
}

// 5. Manual cancellation via Disposable handle
async startAutoSave(s) {
  s.autoSave.value = await fx.interval(30_000, "save")
  // Later:
  s.autoSave.value[Symbol.dispose]()          // stops the interval
  // Or: model unmount cancels the scope → interval cleaned up automatically
}
```

### Cancellation cascade diagram

```
Model unmounts
  → model scope.cancel()
    → AbortController.abort()
      → child scope "importAndSave" receives abort event
        → child scope.cancel()
          → AbortController.abort()
            → signal passed to fetch() fires
              → fetch throws AbortError
                → await rejects
                  → async function exits
                    → finally block runs
      → child scope "autoSave" receives abort event
        → DisposableStack cleans up
          → clearInterval()
      → loggily span ends (with cancellation metadata)
```

Nothing outlives its parent. Every pending I/O operation aborts. Every timer clears. Every span closes. Automatic, via the platform's own `AbortSignal` propagation.

## Scope Plugins (`with*` composition)

The base scope is minimal: AbortController + children + ALS context. Everything else is composable via `with*` wrappers — the same SlateJS-style plugin pattern used throughout Silvery. Each `with*` wraps `run()` — the single point where effects execute.

**v1 plugins**: `withRecording()` (capture effect descriptors for testing), `withTestClock()` (controllable time for timer tests).

**Future plugins**: `withTracing()`, `withRetry()`, `withRateLimit()`, `withSupervision()`, `withDevtools()` — see [Appendix: Advanced Plugins](#appendix-advanced-plugins).

```typescript
// v1 — recording for tests
const scope = pipe(createScope("test"), withRecording())
await scope.run(() => todo.save(state))
expect(scope.effects).toEqual([fx.persist({ data: items })])

// Future — composing multiple plugins
const runtime = pipe(
  createRuntime({ fetch, persist }),
  withTracing(), // loggily span per effect
  withRecording(), // capture descriptors
)
```

Same composition model everywhere (see [state-api-redesign.md](./state-api-redesign.md) for the full two-surface architecture):

```
State:    pipe(createState({...}), withUndo(), withValidation())
Runtime:  pipe(createRuntime({...}), withTracing(), withRecording())
Scopes:   pipe(createScope(name), withRetry(), withRateLimit())
```

### Testing

Two levels of testing:

```typescript
// Level 1: Fire-and-forget effects — just collect descriptors
// Works when the update doesn't depend on effect return values
test("save persists items", async () => {
  const effects = await collect(() => todo.save(state))
  expect(effects).toEqual([fx.persist({ data: items })])
})

// Level 2: Data-dependent effects — provide mock providers
// Required when downstream code uses effect results (common case)
test("importAndSave fetches then persists", async () => {
  const scope = testScope({ fetch: () => mockData })
  await scope.run(() => todo.importAndSave(state, { url: "/api" }))

  expect(scope.effects).toEqual([fx.fetch("/api"), fx.persist({ data: mockData })])
  expect(state.items.value).toEqual(mockData)
})

// Level 2b: Cancellation behavior
test("cancellation aborts pending effects", async () => {
  const scope = testScope({ fetch: () => delay(1000) })

  const promise = scope.run(() => todo.importAndSave(state, { url: "/slow" }))
  scope.cancel("test cancellation")

  await expect(promise).rejects.toThrow("AbortError")
})
```

`collect()` is a thin wrapper — recording scope with no-op providers:

```typescript
async function collect(fn: () => Promise<void>): Promise<AsyncEffect[]> {
  const scope = pipe(createScope("collect"), withRecording())
  await scope.run(fn) // effects recorded, providers are no-ops
  return scope.effects
}
```

Level 1 works for fire-and-forget effects (`fx.persist(data)`, `fx.toast(msg)`) where the update doesn't use the return value. But when downstream code depends on effect results (`const data = await fx.fetch(url); s.items.value = data`), mock providers are required — `collect()` returns `undefined` and downstream code breaks. There's no free lunch — if your code uses an effect's result, the test must provide it.

### Testing timer effects: `withTestClock()`

Timer effects (`fx.delay`, `fx.interval`) are time-dependent — tests shouldn't wait for real time to pass. The `withTestClock()` plugin replaces timer providers with a controllable clock:

```typescript
test("debounced search waits 300ms then fires", async () => {
  const clock = createTestClock()
  const scope = pipe(testScope(), withTestClock(clock))

  const promise = scope.run(() => search.debounced(state, { query: "foo" }))

  // No time has passed — search hasn't fired yet
  expect(scope.effects).not.toContainEqual(fx.fetch(expect.anything()))

  // Advance 300ms — debounce fires
  await clock.advance(300)
  expect(scope.effects).toContainEqual(fx.fetch("/search?q=foo"))
})

test("interval fires repeatedly", async () => {
  const clock = createTestClock()
  const scope = pipe(testScope({ save: () => {} }), withTestClock(clock))

  await scope.run(() => todo.startAutoSave(state))

  await clock.advance(30_000) // first tick
  expect(scope.effects.filter((e) => e.type === "persist")).toHaveLength(1)

  await clock.advance(30_000) // second tick
  expect(scope.effects.filter((e) => e.type === "persist")).toHaveLength(2)
})
```

`withTestClock()` intercepts `fx.delay` and `fx.interval` providers. `clock.advance(ms)` resolves pending timers synchronously. No real `setTimeout` calls, no flaky timing. Works with `scope.cancel()` — cancelling the scope clears all pending timers.

## How Loggily Becomes the Scope Tree (Future)

Loggily already has span hierarchy, ALS propagation, Disposable cleanup, and zero-overhead conditional logging. The scope tree maps naturally: each scope IS a loggily span. Silvery adds cancellation propagation (AbortController per scope), effect recording (`withRecording()`), structured concurrency (`fx.all()`), and operational plugins (`withRetry()`, `withRateLimit()`).

Two v1-adjacent additions that depend on scopes but not full loggily integration:

- **`fx.mutex(key)`** — named mutex for exclusive resource access within async updates. Scoped — released when the update's scope ends.
- **`fx.batch(updates)`** — group multiple updates into a single atomic batch, triggering one re-render instead of N.

## Why async/await Over Generators

An earlier version used generators (`yield*` with typed adapters). We switched to async/await for three reasons: natural TypeScript typing (`await fx.fetch(url)` returns `Response` — no adapter trick for TS's single-`Next`-type limitation [#32523](https://github.com/microsoft/TypeScript/issues/32523)), platform-native cancellation via AbortSignal, and universal familiarity. What we lose: generators' synchronous `collect()` and explicit step-by-step control. What we gain: the scope tree as the universal collection/tracing/cancellation mechanism.

## Prior Art

**Kotlin coroutines** (2018) — the most mature scope tree in a mainstream language. `CoroutineScope` maps almost 1:1 to our `Scope`. Key lesson: `SupervisorJob` (don't cancel siblings on failure) is the most-requested deviation from strict structured concurrency.

**Effection v4** — <5KB structured concurrency for JavaScript using generators. Proves scope trees work in production JS. We differ: async/await for natural typing, integrated observability, state management integration.

**Effect.ts** — maximalist typed effect system. Powerful but heavyweight for a TUI framework. Their fiber tree validates scope-as-tree; their `Scope` with finalizers = our DisposableStack.

**Legion/Centurion** — our own prototype. Standalone concurrency library with TaskGroup + AbortSignal. The scope tree completes what centurion started by adding effects-as-data, pluggable providers, and `with*` composition.

**Redux Saga** — same "effects as data" lineage (yield descriptors, test by inspecting). We add structured concurrency and scoped providers instead of a single global middleware.

| Dimension         | Kotlin coroutines       | Effection v4         | Effect.ts               | Silvery scope tree            |
| ----------------- | ----------------------- | -------------------- | ----------------------- | ----------------------------- |
| **Size**          | Language built-in       | <5KB                 | ~200KB+                 | Part of Silvery               |
| **Approach**      | `suspend` + dispatchers | Generators + runtime | Typed effect values     | async/await + AsyncEffect     |
| **Type safety**   | Full (suspend typing)   | Minimal              | Maximum (3 type params) | Natural (await typing)        |
| **DI**            | CoroutineContext        | None                 | Layers + Context        | Pluggable providers           |
| **Observability** | None built-in           | None built-in        | Built-in tracing        | Unified with loggily          |
| **Scope tree**    | Yes (Job hierarchy)     | Yes (core primitive) | Yes (fiber tree)        | Yes (unified with spans)      |
| **Cleanup**       | Job.invokeOnCompletion  | Generator teardown   | Scope finalizers        | DisposableStack + abort       |
| **Cancellation**  | CancellationException   | Generator throw      | Fiber interruption      | AbortSignal (platform)        |
| **Plugins**       | CoroutineContext elems  | None                 | Layers                  | `with*` composition           |
| **Testing**       | `runTest { }`           | Run generators       | Provide test layers     | Swap providers, inspect scope |

## What This Enables

**Testing**: Swap providers, run updates, inspect `scope.effects` + state. No mocks for the effect system itself — mock at the provider boundary.

**Debugging**: `TRACE=1` shows the live scope tree — which effects are running, how long they took, what failed. No separate debugging infrastructure.

**AI agents**: The scope tree is inspectable at runtime. An AI agent can see what effects are active, what's pending, what failed. Combined with the command tree and state access, the agent has full visibility into the app's execution.

**Replay**: Record `scope.effects` + provider results. Replay by providing a provider that feeds back recorded results in sequence.

**Time-travel debugging**: Snapshot state at scope boundaries. Step forward/backward through scopes. Each scope is a self-contained unit with clear inputs (args), outputs (state mutations + effects), and duration.

## Open Questions

- **Supervision strategies.** Should scopes support restart policies via `withSupervision()` (Erlang-style one-for-one, etc.), or is cancel-on-error sufficient for TUI apps?

- **Scope-level error boundaries.** Should model scopes have `withErrorBoundary()` (catch and recover vs propagate)?

- **Non-cancellable blocks.** Kotlin has `NonCancellable` for cleanup code that must complete. `scope.defer()` likely covers most cases; `withNonCancellable()` if needed.

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

Each `with*` wraps `scope.run()` — the single point where effects execute:

```typescript
// withRetry — wraps run() to retry failed effects
const withRetry =
  ({ attempts, backoff }) =>
  <T extends { run: Function }>(scope: T) => {
    const { run } = scope
    scope.run = async (effect) => {
      for (let i = 0; i < attempts; i++) {
        try {
          return await run(effect)
        } catch (e) {
          if (i === attempts - 1) throw e
          if (backoff === "exponential") await delay(2 ** i * 100)
        }
      }
    }
    return scope
  }

// withTracing — wraps run() to create a loggily span per effect
const withTracing =
  () =>
  <T extends { run: Function }>(scope: T) => {
    const { run } = scope
    scope.run = (effect) => {
      const span = loggily.startSpan(effect.type, effect.args)
      return run(effect).then(
        (v) => {
          span.end()
          return v
        },
        (e) => {
          span.end(e)
          throw e
        },
      )
    }
    return scope
  }
```

Additional plugin ideas: `withRateLimit({ max, per })`, `withPriority(level)`, `withSupervision(strategy)`, `withConcurrencyLimit(n)`, `withTimeout(ms)`, `withDevtools()`.

---

_See also: [architecture-overview.md](./architecture-overview.md) (entry point connecting all design docs), [state-api-redesign.md](./state-api-redesign.md) (signals, models, sip progression), [command-centric.md](./command-centric.md) (command shapes, auto-derived surfaces), [input-system.md](./input-system.md) (keymaps, sources, dispatch), [app-composition.md](./app-composition.md) (plugin composition, `op()` ergonomics), [ai-mode.md](./ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](./app-explosion.md) (the vision)._
