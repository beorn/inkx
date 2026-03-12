# The Scope Tree

_A unified tree for effects, concurrency, observability, and lifecycle. Connects [state-api-redesign.md](./state-api-redesign.md) (effects, async updates) with [loggily](../../loggily/) (spans, logs, tracing) and prior work in [legion/centurion](~/Code/legion/centurion/) (structured concurrency)._

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

## Why It's Not Native

Every programmer uses this pattern daily (function calls form a tree, block scopes nest, React components unmount children). Yet no mainstream language provides it as a unified primitive. Why?

**1. Async broke lexical scoping.** Block scoping works beautifully for synchronous code — the scope IS the lifetime. Promises broke this. `fetch(url)` returns a Promise that outlives the calling function. There's no ownership. Fire-and-forget is the default. Structured concurrency (Trio 2018, Kotlin, Swift, Java Loom) is the recent effort to restore scope-as-lifetime for async work.

**2. Concerns evolved separately.** Memory management got RAII and GC. Concurrency got threads and async/await. Observability got logging frameworks. Error handling got try/catch. Each reinvented the tree independently, in separate code, with separate APIs. Nobody stepped back to notice they're all the same tree.

**3. Flat namespaces in the OS.** PIDs, file descriptors, thread IDs are flat integers. The tree structure of process groups exists but is weakly enforced. Most runtimes inherit this flatness.

**4. No unified effect model.** "Doing I/O," "managing concurrency," "handling errors," and "observing execution" are treated as separate concerns with separate mechanisms. A unified scope tree needs a unified model — which is what algebraic effects research explores, but hasn't reached mainstream languages.

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

  get signal() { return this.#controller.signal }

  constructor(
    readonly name: string,
    readonly parent?: Scope,
    private runners: EffectRunners,
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
    const runner = this.runners[effect.type]
    // Runner receives the scope's AbortSignal automatically
    return runner(effect.args, { signal: this.signal, scope: this })
  }

  // Create a child scope
  createChild(name: string): Scope {
    return new Scope(`${this.name}:${name}`, this, this.runners)
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

Each `fx.*` function returns an `AsyncEffect<T>` — a plain data descriptor that is also `await`-able. When `await`ed, it looks up the current scope via `AsyncLocalStorage` and delegates to the scope's runner.

**Caveat: accidental execution.** Because `AsyncEffect` implements `.then()`, passing it to any Promise-aware utility (`Promise.resolve(effect)`, `Promise.all([effect])`, JSON serialization libraries that check for thenables) will trigger execution. Keep effects in typed variables; don't pass them through generic Promise utilities without `await`ing first.

```typescript
class AsyncEffect<T> {
  constructor(
    readonly type: string,
    readonly args: Record<string, unknown>,
  ) {}

  then<R>(
    resolve: (value: T) => R | PromiseLike<R>,
    reject?: (error: unknown) => R | PromiseLike<R>,
  ): Promise<R> {
    const scope = currentScope()             // ALS lookup
    return scope.run(this).then(resolve, reject)
  }
}

// fx namespace — each function returns a typed AsyncEffect
const fx = {
  fetch: (url: string): AsyncEffect<Response> =>
    new AsyncEffect("fetch", { url }),

  persist: (data: unknown): AsyncEffect<void> =>
    new AsyncEffect("persist", { data }),

  interval: (ms: number, update: string): AsyncEffect<Disposable> =>
    new AsyncEffect("interval", { ms, update }),

  all: <T>(effects: AsyncEffect<T>[]): AsyncEffect<T[]> =>
    new AsyncEffect("all", { effects }),

  dispatch: (model: Model, update: string, args?: unknown): AsyncEffect<void> =>
    new AsyncEffect("dispatch", { model, update, args }),
}
```

### Effect runners — where AbortSignal meets I/O

Runners are where effects actually execute. Every runner receives the scope's `AbortSignal` automatically — no manual threading.

```typescript
const runners: EffectRunners = {
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
    const handle = { [Symbol.dispose]() { clearInterval(id) } }
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
      return await Promise.all(
        effects.map((effect) =>
          scopeContext.run(childScope, () => effect.then((v) => v))
        )
      )
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
const Todo = createModel({
  state: () => ({
    items: signal<Item[]>([]),
    autoSave: signal<Disposable | null>(null),
  }),

  updates: {
    // No effects — plain function (same as before)
    add(s, { text }) {
      s.items.value = [...s.items.value, { text, done: false }]
    },

    // Effects — async function, await typed effects
    async save(s) {
      await fx.persist({ data: s.items.value })
    },

    // Sequential — each await is scoped, abortable, traced
    async importAndSave(s, { url }) {
      const data = await fx.fetch(url)       // Response — typed naturally
      s.items.value = data
      await fx.persist({ data })
    },

    // Ongoing effects — returns Disposable
    async startAutoSave(s) {
      s.autoSave.value = await fx.interval(30_000, "save")
    },

    // Parallel — structured concurrency
    async batchImport(s, { urls }) {
      const results = await fx.all(urls.map(url => fx.fetch(url)))
      // If any fails, siblings are cancelled (scope cancel propagates)
      await fx.persist({ data: results })
    },

    // Cross-model dispatch
    async confirm(s) {
      s.open.value = false
      await fx.dispatch(Board, "addItem", { text: s.value.value })
    },
  },
})
```

### How cancellation flows — complete example

```typescript
// 1. User triggers importAndSave
// Runtime creates a child scope: app:todo:importAndSave

async importAndSave(s, { url }) {
  // 2. await fx.fetch(url)
  //    → AsyncEffect.then() looks up scope via ALS
  //    → scope.run() calls fetch runner with { signal: scope.signal }
  //    → runner calls native fetch(url, { signal })
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

The base scope is minimal: AbortController + children + ALS context. Everything else is composable via `with*` wrappers — the same SlateJS-style plugin pattern used throughout Silvery.

```typescript
// Runtime with plugins — all scopes get these behaviors
const runtime = pipe(
  createRuntime({ runners: { fetch, persist, toast } }),
  withTracing(),           // wraps scope.run() to add loggily spans
  withRecording(),         // wraps scope.run() to capture effect descriptors
  withDevtools(),          // exposes live scope tree to inspector
)

// Per-scope plugins for specific behaviors
const scope = pipe(
  createScope("batchImport"),
  withRetry({ attempts: 3, backoff: "exponential" }),
  withRateLimit({ max: 10, per: "second" }),
)
```

Each `with*` wraps `run()` — the single point where effects execute:

```typescript
// withTracing — wraps run() to create a loggily span per effect
const withTracing = () => <T extends { run: Function }>(scope: T) => {
  const { run } = scope
  scope.run = (effect) => {
    const span = loggily.startSpan(effect.type, effect.args)
    return run(effect).then(
      (v) => { span.end(); return v },
      (e) => { span.end(e); throw e },
    )
  }
  return scope
}

// withRecording — wraps run() to capture effect descriptors
const withRecording = () => <T extends { run: Function }>(scope: T) => {
  scope.effects = []
  const { run } = scope
  scope.run = (effect) => {
    scope.effects.push(effect.descriptor)
    return run(effect)
  }
  return scope
}

// withRetry — wraps run() to retry failed effects
const withRetry = ({ attempts, backoff }) => <T extends { run: Function }>(scope: T) => {
  const { run } = scope
  scope.run = async (effect) => {
    for (let i = 0; i < attempts; i++) {
      try { return await run(effect) }
      catch (e) {
        if (i === attempts - 1) throw e
        if (backoff === "exponential") await delay(2 ** i * 100)
      }
    }
  }
  return scope
}
```

Same composition model everywhere:

```
Models:   pipe(Todo, withVim(), withUndo())
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

// Level 2: Data-dependent effects — provide mock runners
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

`collect()` is a thin wrapper — recording scope with no-op runners:

```typescript
async function collect(fn: () => Promise<void>): Promise<AsyncEffect[]> {
  const scope = pipe(createScope("collect"), withRecording())
  await scope.run(fn)         // effects recorded, runners are no-ops
  return scope.effects
}
```

Level 1 works for fire-and-forget effects (`fx.persist(data)`, `fx.toast(msg)`) where the update doesn't use the return value. But when downstream code depends on effect results (`const data = await fx.fetch(url); s.items.value = data`), mock runners are required — `collect()` returns `undefined` and downstream code breaks. This is the same constraint generators have: `const data = yield* fx.fetch(url)` requires the test driver to provide `data` via `.next(data)`. There's no free lunch — if your code uses an effect's result, the test must provide it.

## How Loggily Becomes the Scope Tree

Loggily already has the infrastructure:

| Scope tree need             | Loggily feature                             |
| --------------------------- | ------------------------------------------- |
| Tree structure              | Span hierarchy (parentId, traceId)          |
| Identity / namespace        | Colon-separated names (`app:todo:save`)     |
| Lifetime tracking           | Span start/end with duration                |
| Context inheritance         | Props merge from parent to child            |
| Automatic parenting         | AsyncLocalStorage context propagation       |
| Cleanup protocol            | `Disposable` / `Symbol.dispose()`           |
| Collection for testing      | `startCollecting()` / `getCollectedSpans()` |
| Worker thread support       | Worker message forwarding                   |
| Zero-overhead when disabled | `log.debug?.()` conditional logging         |
| Output modes                | Console (dev), JSON (prod), custom writers  |

What Silvery adds on top (via `with*` plugins on the scope):

- **`withTracing()`** — each `scope.run()` becomes a loggily span
- **`withRecording()`** — captures effect descriptors for testing/replay
- **Cancellation propagation** — AbortController per scope, linked parent→child
- **`withRetry()` / `withRateLimit()`** — operational policies
- **`fx.all()`** — structured concurrency via child scopes

Loggily provides the tree. Silvery provides the semantics. Plugins compose behaviors.

### Development experience

```bash
# See the full scope tree with timing
TRACE=1 bun run app
# → SPAN app:todo:importAndSave (246ms)
# →   INFO  "starting import" {url: "..."}
# →   SPAN app:todo:fetch (234ms)
# →   SPAN app:todo:persist (12ms) {count: 42}

# Filter to specific scopes
TRACE=app:todo bun run app

# JSON output for production
TRACE_FORMAT=json bun run app
# → {"name":"app:todo:fetch","duration":234,"traceId":"abc","parentId":"def"}

# Debug logging for specific namespaces
DEBUG=app:todo:* bun run app
```

## Why async/await Over Generators

An earlier version of this design used generators (`yield*` with typed adapters). We switched to async/await because:

1. **Natural TypeScript typing.** `await fx.fetch(url)` returns `Response` — no adapter trick needed. TypeScript's `Generator<Y, R, N>` has a single `Next` type for all yield points ([Design Limitation #32523](https://github.com/microsoft/TypeScript/issues/32523)), requiring a `yield*` adapter workaround per effect. `async/await` just works.

2. **Scope captures effects via ALS.** The scope tree records every effect that passes through it automatically — no `collect(generator)` needed. Test by swapping runners and inspecting `scope.effects`.

3. **AbortSignal is built-in.** The scope owns an `AbortController`. Runners receive the signal automatically. Native `fetch`, `setTimeout`, and every AbortSignal-aware API cancels automatically. No custom cancellation protocol.

4. **Everyone knows async/await.** Generators with `yield*` are less familiar. Async functions are standard JavaScript — no learning curve.

5. **Plugin composition.** `with*` wrappers on `scope.run()` compose naturally. Tracing, recording, retry, rate limiting — all just function wrapping on the same `run()` method.

What we lose: generators' synchronous `collect()` (drive a generator without a runtime) and explicit step-by-step control (`gen.next(value)`). What we gain: natural typing, familiar syntax, platform-native cancellation, and the scope tree as the universal collection/tracing/cancellation mechanism.

## Prior Art

### Kotlin Coroutine Scopes — The Most Mature

Kotlin's [structured concurrency](https://kotlinlang.org/docs/coroutines-basics.html#structured-concurrency) (2018) is the most polished implementation of scope trees in a mainstream language. Every coroutine runs inside a `CoroutineScope`. Scopes form a tree. Cancellation flows down. Errors propagate up.

```kotlin
// Kotlin — scope tree is built into the language
coroutineScope {        // parent scope
    val data = async {  // child — cancelled if parent cancels
        fetchData(url)  // suspend function — like our async update
    }
    launch {            // child — fire-and-forget, still scoped
        logProgress()
    }
    data.await()        // structured: parent waits for children
}
// ALL children complete (or cancel) before this line runs
```

**Key concepts that map directly:**

| Kotlin                     | Silvery Scope Tree                               |
| -------------------------- | ------------------------------------------------ |
| `CoroutineScope`           | `Scope`                                          |
| `coroutineScope { }`       | `scope.createChild(name)`                        |
| `Job` (lifecycle handle)   | AbortController (cancel/signal)                  |
| `Job.cancel()`             | `scope.cancel()`                                 |
| `Job.children`             | `scope.#children`                                |
| `SupervisorJob`            | `withSupervision()` plugin (open question)        |
| `CoroutineContext`         | ALS context + runners                            |
| `Dispatchers.IO/Main`     | Effect runners (the DI boundary)                 |
| `withContext(dispatcher)`  | Runner selection per effect type                 |
| `ensureActive()`           | `signal.throwIfAborted()`                        |
| `NonCancellable`           | No equivalent yet (open question)                |

**What validates our design**: Kotlin proved that scope-as-tree is the right model for async work at production scale (Android, server). Our `Scope` maps almost 1:1 to `CoroutineScope` — we independently arrived at the same shape. Key differences: Kotlin's scopes are language-level (`suspend`); ours are library-level (ALS + AsyncEffect). Kotlin separates dispatchers from scopes; we unify runners with the scope tree. Kotlin has no effect recording or observability built in; we integrate both.

**What we learn**: Kotlin's `SupervisorJob` (don't cancel siblings on failure) is the most-requested deviation from strict structured concurrency. Our `withSupervision()` open question is exactly this. Kotlin's `NonCancellable` context (for cleanup code that must complete) is worth considering.

### Effection v4 — The Closest Cousin

[Effection](https://frontside.com/effection) (Frontside) is a <5KB structured concurrency library for JavaScript using synchronous generators and a scope tree.

**Core model**: Everything is a `Task` in a scope tree. Tasks own their children. Cancellation flows down. Errors propagate up. Nothing outlives its parent.

**Two primitives**:

- **`action()`** — bridges callback-based APIs into the scope tree. Returns a value, registers teardown.
- **`resource()`** — a long-running process that provides a value. Yields its "ready" value, keeps running until scope closes.

```typescript
// Effection v4
import { run, action, resource, spawn } from "effection"

function* fetchData(url) {
  const response = yield* action(function* (resolve, reject) {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal }).then(resolve, reject)
    return () => controller.abort() // teardown on scope cancel
  })
  return yield* action(function* (resolve, reject) {
    response.json().then(resolve, reject)
  })
}

await run(main)
```

**What validates our design**: Effection proves scope trees work in production JavaScript. We share the same structured concurrency semantics and auto-cleanup. Key differences: Effection uses generators (we use async/await for natural typing), Effection has no observability (we unify with loggily), Effection is standalone (we integrate with state management and React).

### Effect.ts — The Maximalist Alternative

[Effect](https://effect.website) is a comprehensive typed effect system for TypeScript. `Effect<Success, Error, Requirements>` — lazy, composable, with typed errors and compile-time DI.

**Why not for Silvery**: Effect solves a different problem at a different scale. Its type-level encoding adds complexity that doesn't align with Silvery's sip progression. The dependency injection system (Layers, Context) is powerful but heavyweight for a TUI framework where the runtime IS the DI container.

**What we learn**: The fiber tree is a scope tree with supervision. `Effect.all()` with concurrency options = our `fx.all()`. Their `Scope` with finalizers = our DisposableStack.

### Legion/Centurion — The Prototype

[Legion/centurion](~/Code/legion/centurion/) explored structured concurrency for JavaScript with TaskGroup hierarchies and AbortSignal propagation. Our scope tree completes what centurion prototyped:

| Centurion                   | Silvery Scope Tree                              |
| --------------------------- | ----------------------------------------------- |
| `TaskGroup`                 | `Scope`                                         |
| `TaskGroup.run(asyncFn)`    | `scope.run(() => update(s, args))`              |
| `TaskGroup.spawn("child")`  | `scope.createChild("child")`                    |
| `TaskGroup.signal`          | `scope.signal` (AbortSignal)                    |
| `TaskGroup.abort(reason)`   | `scope.cancel(reason)`                          |
| `[Symbol.dispose]` → abort  | `[Symbol.dispose]` → cancel + cleanup + span    |
| `AsyncLocalStorage` context | ALS for scope + runner lookup                   |
| Manual `{ signal }` in tasks| Automatic — runners receive signal              |
| No observability            | Scope IS a loggily span                         |
| No effect recording         | `withRecording()` captures all effects          |
| No pluggable runners        | Runners are the DI boundary                     |
| No plugins                  | `with*` composition on scope and runtime        |

Centurion was a standalone concurrency library. Here, structured concurrency is integrated with effects-as-data, loggily's observability tree, pluggable runners, and `with*` composition. One tree, not two libraries.

| Dimension          | Kotlin coroutines       | Effection v4         | Effect.ts               | Silvery scope tree          |
| ------------------ | ----------------------- | -------------------- | ----------------------- | --------------------------- |
| **Size**           | Language built-in       | <5KB                 | ~200KB+                 | Part of Silvery             |
| **Approach**       | `suspend` + dispatchers | Generators + runtime | Typed effect values     | async/await + AsyncEffect   |
| **Type safety**    | Full (suspend typing)   | Minimal              | Maximum (3 type params) | Natural (await typing)      |
| **DI**             | CoroutineContext        | None                 | Layers + Context        | Pluggable runners           |
| **Observability**  | None built-in           | None built-in        | Built-in tracing        | Unified with loggily        |
| **Learning curve** | Medium (Kotlin-specific)| Low                  | High                    | Lowest (async/await)        |
| **Scope tree**     | Yes (Job hierarchy)     | Yes (core primitive) | Yes (fiber tree)        | Yes (unified with spans)    |
| **Cleanup**        | Job.invokeOnCompletion  | Generator teardown   | Scope finalizers        | DisposableStack + abort     |
| **Cancellation**   | CancellationException   | Generator throw      | Fiber interruption      | AbortSignal (platform)      |
| **State mgmt**     | None                    | None                 | Ref, FiberRef           | Signals (reactive)          |
| **Plugins**        | CoroutineContext elems  | None                 | Layers                  | `with*` composition         |
| **Testing**        | `runTest { }`           | Run generators       | Provide test layers     | Swap runners, inspect scope |
| **Supervision**    | SupervisorJob           | None                 | Supervisor fiber        | `withSupervision()` (TBD)   |

## What This Enables

**Testing**: Swap runners, run updates, inspect `scope.effects` + state. No mocks for the effect system itself — mock at the runner boundary.

**Debugging**: `TRACE=1` shows the live scope tree — which effects are running, how long they took, what failed. No separate debugging infrastructure.

**AI agents**: The scope tree is inspectable at runtime. An AI agent can see what effects are active, what's pending, what failed. Combined with the command registry and state access, the agent has full visibility into the app's execution.

**Replay**: Record `scope.effects` + runner results. Replay by providing a runner that feeds back recorded results in sequence.

**Time-travel debugging**: Snapshot state at scope boundaries. Step forward/backward through scopes. Each scope is a self-contained unit with clear inputs (args), outputs (state mutations + effects), and duration.

## Open Questions

- **Restart/supervision strategies.** Erlang's supervisor can restart failed children (one-for-one, one-for-all, rest-for-one). Should Silvery scopes support restart policies via a `withSupervision()` plugin? Or is cancel-on-error sufficient for TUI apps?

- **Scope-level error boundaries.** React has `ErrorBoundary` components. Should model scopes have configurable error handling via `withErrorBoundary()` (catch and recover vs propagate)?

- **Cross-scope communication beyond dispatch.** `fx.dispatch(Model, "update", args)` sends a message to another model. Should scopes be able to watch/subscribe to each other's state changes?

- **Scope priorities and scheduling.** Should some scopes have priority over others? (e.g., UI-critical effects before background sync) Could be a `withPriority()` plugin.

- **Resource limits per scope.** Maximum concurrent effects, memory budgets, timeout policies. Centurion explored concurrency limits and backpressure — `withConcurrencyLimit()` and `withTimeout()` plugins.

---

_See also: [state-api-redesign.md](./state-api-redesign.md) (effects, models, sip progression), [command-centric.md](./command-centric.md) (commands as the app's behavior), [ai-mode.md](./ai-mode.md) (AI agents driving command-centric apps)._
