# Silvery Lifecycle / Scope — Design

**Status**: design locked (2026-04-24); prototype pending
**Bead**: `km-silvery.lifecycle-scope` (P0)
**Depends on**: `@silvery/scope` primitive (already shipped, not yet wired to runtime)

## One-sentence summary

Silvery has a scope tree rooted at the app; each mounted component instance owns a child scope; resources are acquired into the current scope and disposed by scope teardown in LIFO order when the component unmounts or the app exits.

## Why this exists

Silvery apps today acquire and dispose resources through at least 6 mechanisms: `useDispose`, `term.signals.on`, `useExit`, `subscribe/off` pairs, raw `setTimeout`/`AbortController`/`fs.watch`, and reconciler sub-roots. Each new silvery-native agent app (silvercode first; pam, kimmi, openclaw next) reinvents the wiring. The goal is to have **one** primitive that owns lifetime for every disposable in every target (TUI, web, canvas).

## Principles

1. **Scope is lifetime, not DI.** Do not conflate "how to construct" with "how to dispose" (Effect-TS `Layer` trap).
2. **Ownership is a tree.** Structured concurrency wants a tree; React fiber lifetimes are already a tree. Mirror them.
3. **Ambient-via-React, explicit-outside-React.** No `AsyncLocalStorage`. Ownership must be visible.
4. **Scope core stays tiny.** 4 methods, platform-neutral. Resources are factories in platform packages, not methods on Scope.
5. **One uniform gate.** Every resource shape plugs in through `scope.use(Disposable)`. No special cases.
6. **Unmount is hard law.** If a resource must outlive its component, it was owned by the wrong thing.
7. **Cross-platform by construction.** Scope knows only `AbortSignal`. SIGINT/pagehide live in host wiring.
8. **Render is pure.** In React, `scope.defer(...)`, `scope.use(...)`, `scope.child(...)`, and `scope[Symbol.asyncDispose]()` are forbidden during render. Resource acquisition happens after commit via `useScopeEffect(...)` or inside event handlers.

## TypeScript / runtime prerequisites

Silvery lifecycle scopes build on TC39 explicit resource management (`AsyncDisposableStack`, `Symbol.dispose`, `Symbol.asyncDispose`, `using` / `await using`) and `AbortController` / `AbortSignal`. Runtimes: Bun (all versions we target), Node 20.4+, browsers with WebKit/Blink/Firefox explicit-resource-management support. TypeScript `lib` must include `esnext.disposable` so the standard types resolve. No polyfill required on supported targets.

## Core API — `@silvery/scope`

**Scope is a subclass of TC39's `AsyncDisposableStack`.** All the disposer-stack semantics — LIFO ordering, async-await cleanup, `SuppressedError` on multi-throw, `.disposed` flag, idempotent `[Symbol.asyncDispose]()` — come from the standard. Scope adds exactly two things: an `AbortSignal` and a `child()` method.

```ts
export class Scope extends AsyncDisposableStack {
  readonly signal: AbortSignal
  readonly name?: string
  readonly #children = new Set<Scope>()
  readonly #parent?: Scope

  constructor(parent?: Scope, name?: string) {
    super()
    this.name = name
    this.#parent = parent

    const controller = new AbortController()
    this.signal = controller.signal
    this.defer(() => controller.abort())

    if (parent) {
      if (parent.signal.aborted) controller.abort()
      else {
        const onAbort = () => controller.abort()
        parent.signal.addEventListener("abort", onAbort, { once: true })
        this.defer(() => parent.signal.removeEventListener("abort", onAbort))
      }
      parent.#children.add(this)
    }
  }

  child(name?: string): Scope {
    return new Scope(this, name)
  }

  override async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return
    const errors: unknown[] = []

    // Dispose children first, most-recent first
    const children = [...this.#children].reverse()
    this.#children.clear()
    for (const c of children) {
      try { await c[Symbol.asyncDispose]() } catch (e) { errors.push(e) }
    }

    // Inherited user disposer stack (LIFO, from super)
    try { await super[Symbol.asyncDispose]() } catch (e) { errors.push(e) }

    // Remove self from parent so we don't leak after early dispose
    this.#parent?.#children.delete(this)

    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw errors.reduce((acc, e) => new SuppressedError(e, acc))
  }

  // Scope invariants prevent safe inheritance of move(); override to refuse.
  override move(): never {
    throw new TypeError("Scope.move() is not supported — create a new scope and re-register resources explicitly")
  }
}

export function createScope(name?: string): Scope {
  return new Scope(undefined, name)
}

// Sync cleanup — value is Disposable
export function disposable<T extends object>(
  value: T,
  dispose: (v: T) => void,
): T & Disposable
// Async cleanup — value is AsyncDisposable
export function disposable<T extends object>(
  value: T,
  dispose: (v: T) => Promise<void>,
): T & AsyncDisposable
// Implementation — attaches both symbols so either `using` or `await using` works.
// The caller's overload selects the static type; at runtime both paths are valid.
export function disposable(value: object, dispose: (v: object) => void | Promise<void>): object {
  return Object.assign(value, {
    [Symbol.dispose]() { void dispose(value) },
    [Symbol.asyncDispose]() { return Promise.resolve(dispose(value)) },
  })
}

export interface DisposeErrorContext {
  readonly phase: "react-unmount" | "signal" | "app-exit" | "manual"
  readonly scope?: Scope
}

export function reportDisposeError(error: unknown, context: DisposeErrorContext): void

// @silvery/ag-term
export function withScope(): AppPlugin   // default-enabled by createApp()
```

### Methods users see

Inherited from `AsyncDisposableStack` (TC39 standard):

- `scope.use(disposable)` — **canonical.** Strict: accepts only `Disposable | AsyncDisposable`. Returns the value unchanged.
- `scope.defer(fn)` — register a cleanup callback.
- `scope.adopt(value, dispose)` — TC39's value + disposer form. Works, but prefer `scope.use(disposable(value, fn))` or plain `scope.defer(fn)`.
- `scope.disposed` — post-dispose flag.
- `scope[Symbol.asyncDispose]()` — run teardown.

Overridden to throw:

- `scope.move()` — Scope invariants (signal, name, child registry) don't transfer cleanly to a plain `AsyncDisposableStack`; the call throws. Create a new scope and register resources explicitly if you need to relocate ownership.

Added by Scope:

- `scope.signal: AbortSignal` — cancelled when scope disposes; links to parent's signal.
- `scope.child(name?): Scope` — creates a child scope; the child is tracked in a weak internal set (not the parent's disposer stack), so early child disposal releases the reference.

### Why subclass the standard

- **Don't reimplement the algorithm.** LIFO, async-await, `SuppressedError` on multi-throw, idempotent dispose, `.disposed` flag — all standard behavior. Zero code to maintain.
- **Familiarity.** Anyone who knows TC39 explicit resource management recognises the API instantly. Scope's contribution is narrow: `signal` + `child`.
- **Composability.** Scope is `AsyncDisposable`, so `using` works, `AsyncDisposableStack.use(scope)` works, and any TC39-aware code interoperates.

### Canonical form at call sites

```ts
const proc = scope.use(disposable(child_process.spawn("claude", args), p => p.kill("SIGTERM")))
```

`disposable(value, fn)` is a 3-line helper that wraps any value as a `Disposable`. It's the one piece of sugar we ship beyond `Scope` itself.

### Scope state machine and disposal

From `AsyncDisposableStack`: `open → disposed`. `[Symbol.asyncDispose]()` is idempotent. Post-dispose calls to `use`, `defer`, or `adopt` throw `ReferenceError` (standard). Multi-throw produces a chained `SuppressedError`.

Scope's override of `[Symbol.asyncDispose]()` adds cascade semantics:

1. **Dispose children first** (most-recent-first, iterated from an internal set).
2. **Run the inherited user disposer stack** (`super[Symbol.asyncDispose]()`) — LIFO over everything passed to `use(...)` / `defer(...)`.
3. **Remove self from parent's child set** so early disposal releases the reference.
4. **Aggregate errors** into `SuppressedError` if more than one disposer throws.

Children are tracked in a private `Set<Scope>`, not the disposer stack, so disposing a child early genuinely frees it — no growing-stack leak in long-running parents with frequently-rebuilt child scopes (e.g. `useScopeEffect` on a changing dep).

### Fire-and-forget disposal

Most teardown paths should `await scope[Symbol.asyncDispose]()`. When the host cannot await (React unmount, signal handler, app shutdown hook), start disposal and route failures through the shared sink:

```ts
scope[Symbol.asyncDispose]().catch((error) =>
  reportDisposeError(error, { phase: "manual", scope }),
)
```

`reportDisposeError(...)` is best-effort diagnostics and must never throw.

**No priorities.** If teardown order matters, express it through nesting, registration order, or child scopes. Priorities are hidden global coupling; `term.signals` can keep them for the signal-mediator layer only.

## React API — `@silvery/ag-react`

React gets two accessors and one acquisition helper:

```ts
export function useScope(): Scope
export function useAppScope(): Scope
export function useScopeEffect(
  setup: (scope: Scope) => void,
  deps: React.DependencyList,
): void
```

- `useScope()` returns the current component instance's scope.
- `useAppScope()` returns the root app scope for imperative whole-app shutdown paths.
- `useScopeEffect(setup, deps)` runs `setup` after commit with a fresh child scope of the component scope. On dep change or unmount, that child scope is disposed.

**Render-phase rule**: component render must be side-effect free. Calling `scope.defer(...)`, `scope.use(...)`, `scope.child(...)`, or `scope[Symbol.asyncDispose]()` during render is invalid. Acquire in `useScopeEffect(...)`; dispose from event handlers only when you intentionally end a lifetime early.

`useScopeEffect(...)` is the standard form for effect-scoped ownership:

```tsx
useScopeEffect((scope) => {
  setup(scope)
}, [setup])
```

The lower-level equivalent remains valid when needed:

```tsx
const scope = useScope()
useEffect(() => {
  const child = scope.child("effect")
  setup(child)
  return () => {
    child[Symbol.asyncDispose]().catch((error) =>
      reportDisposeError(error, { phase: "react-unmount", scope: child }),
    )
  }
}, [scope, setup])
```

**What was cut**:

- `useOwned(factory, deps)` — deferred. Phase 1 proves whether returning owned handles to render is necessary; until then, acquisition stays post-commit.
- `<ScopeBoundary scope={}>` — deferred. The use case is "render a subtree with an externally-constructed scope," which is rare. Add it only if real code needs it.

### Reconciler integration

- Every fiber gets an optional `scope` slot.
- `useScope()` walks ancestor fibers to find the nearest scope. Fibers that never call `useScope()` or `useScopeEffect()` do not allocate one.
- `useAppScope()` returns the root scope attached by `withScope()`.
- On fiber deletion, if `fiber.scope` is set, the reconciler starts `scope[Symbol.asyncDispose]()` and reports failures via `reportDisposeError(error, { phase: "react-unmount", scope })`. Disposal is unavoidable — there is no path to skip it.
- The app root always has a scope (from `withScope()`, now default-enabled in `createApp()`).

## Resource adoption pattern

Use existing native APIs. Wrap with `disposable(value, cleanup)`. Pass to `scope.use(...)`.

**Component-owned resources** — acquired after commit, live until the keyed effect is replaced or the component unmounts:

```tsx
function Panel({ cmd }: { cmd: string }) {
  useScopeEffect((scope) => {
    scope.use(disposable(child_process.spawn("claude", [cmd]), p => p.kill("SIGTERM")))
    const dir = fs.mkdtempSync(os.tmpdir() + "/panel-")
    scope.defer(() => fs.rmSync(dir, { recursive: true }))
  }, [cmd])

  return <Box>...</Box>
}
```

**Shorter lifetimes** — `useScopeEffect(...)` gives a fresh child scope per dep-set:

```tsx
function Panel({ url }: { url: string }) {
  useScopeEffect((scope) => {
    scope.use(disposable(new WebSocket(url), ws => ws.close()))
    scope.defer(() => flushLogs())
  }, [url])

  return <Box>...</Box>
}
```

No `@silvery/node` wrapper — just Node's `child_process.spawn`, `fs.mkdtempSync`, browser's `new WebSocket`. Silvery owns lifetime attachment, not resource construction.

**Narrow synchronous lifetime** — TC39 `using` inside a block:

```ts
async function compile(scope: Scope) {
  await using s = scope.child("compile")
  const tmp = fs.mkdtempSync(os.tmpdir() + "/c-")
  s.defer(() => fs.rmSync(tmp, { recursive: true }))
  // tmp + any other resources in s disposed at block exit (success or throw)
}
```

Do not `using` an already-adopted resource — that creates two owners and a double-dispose. Wrap with a child scope instead.

**Non-component code takes scope explicitly**:

```ts
export function openStore(scope: Scope, path: string): Database {
  const db = new Database(path)
  scope.defer(() => db.close())
  return db
}
```

**Timers, subscriptions, controllers** — native APIs with the right shape for each:

```ts
// timer — browser handle is a number, not an object. Use scope.defer for cleanup.
const timerId = setTimeout(fn, 5000)
scope.defer(() => clearTimeout(timerId))

// subscription — register + unregister pair, use defer
emitter.on("x", fn)
scope.defer(() => emitter.off("x", fn))

// fetch — use scope's signal, no wrapper needed
void fetch(url, { signal: scope.signal })
```

The rule: when the native API returns an object you can augment, `scope.use(disposable(value, cleanup))` is tightest. When the handle is a primitive (timer IDs) or the registration doesn't have a value to track (event subscriptions), `scope.defer(cleanup)` is the right tool.

## Before / After — real migrations

These are the actual patterns found in the codebase today (2026-04-24), with the scope-based equivalent.

### 1. `useDispose` — app shutdown cleanup

**Before** (`apps/silvercode/src/App.tsx:214`):

```tsx
import { useDispose } from "silvery"

useDispose(() => {
  controller.closeAll()
  printResumeHints()
})
```

**After**:

```tsx
useScopeEffect((scope) => {
  scope.defer(() => {
    controller.closeAll()
    printResumeHints()
  })
}, [controller])
```

Or, better — if `controller` itself becomes `Disposable`:

```tsx
useScopeEffect((scope) => {
  scope.defer(printResumeHints)
  scope.use(createController())
}, [])
// controller auto-closes on unmount; hint prints last (LIFO)
```

---

### 2. `setTimeout` for toast expiry

**Before** (`apps/silvercode/src/components/Notifications.tsx:12-29`):

```tsx
useEffect(() => {
  const unsubs = sessions.map((s) =>
    s.session.subscribe((e) => {
      if (e.kind === "permission-request") {
        const id = seq++
        setToasts((t) => [...t, { id, text: `...`, kind: "warn" }])
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
      }
    }),
  )
  return () => {
    for (const u of unsubs) u()
  }
}, [sessions])
```

Two leaks: the `setTimeout` has no clear path, and the subscribe/unsub pattern is 4 lines of plumbing.

**After**:

```tsx
useScopeEffect((scope) => {
  for (const sess of sessions) {
    scope.use(sess.session.subscribe((e) => {
      if (e.kind === "permission-request") {
        const id = seq++
        setToasts((t) => [...t, { id, text: `...`, kind: "warn" }])
        const timerId = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
        scope.defer(() => clearTimeout(timerId))
      }
    }))
  }
}, [sessions])
```

The effect scope collects everything — subscriptions via `.use()`, pending timers via `.defer()` — and disposes them as one unit.

---

### 3. `setTimeout` for debounced write

**Before** (`apps/km-tui/src/sticky-folds.ts:90-130`):

```ts
function createFoldPersister(repoPath: string, debounceMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: StickyFolds | null = null

  function doWrite() { /* ... */ }

  return {
    schedule(folds: StickyFolds) {
      pending = folds
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(doWrite, debounceMs)
    },
    flush() {
      if (timer !== null) { clearTimeout(timer); timer = null }
      doWrite()
    },
    dispose() {
      if (timer !== null) { clearTimeout(timer); timer = null }
    },
  }
}
```

Manual `timer` tracking, three places that clear it, a hand-rolled `dispose()`.

**After**:

```ts
function createFoldPersister(scope: Scope, repoPath: string, debounceMs = 300) {
  let timerScope: Scope | null = null
  let pending: StickyFolds | null = null

  function clearTimer() {
    if (timerScope === null) return
    const s = timerScope
    timerScope = null
    return s[Symbol.asyncDispose]().catch((error) =>
      reportDisposeError(error, { phase: "manual", scope: s }),
    )
  }

  function doWrite() { /* ... */ }

  scope.defer(() => clearTimer())

  return {
    schedule(folds: StickyFolds) {
      pending = folds
      void clearTimer()
      const s = scope.child("debounce")
      timerScope = s
      const id = setTimeout(doWrite, debounceMs)
      s.defer(() => clearTimeout(id))
    },
    flush() {
      void clearTimer()
      doWrite()
    },
  }
}
```

No `dispose()` method on the returned object — the scope owns the lifetime. The pending timer lives in a disposable child scope, so reschedule/flush just dispose that child and create a fresh one.

---

### 4. `process.on("SIGINT")` + deadline force-quit

**Before** (`apps/silvercode/src/bootstrap.ts:25-33`):

```ts
let sigintCount = 0
process.on("SIGINT", () => {
  sigintCount++
  const delay = sigintCount === 1 ? 500 : 0
  const t = setTimeout(() => process.exit(130), delay) as unknown as { unref?: () => void }
  t.unref?.()
})
```

This is pre-React (runs during `bootstrap.ts` before silvery mounts) so it has no component scope. It belongs on the app's root scope, wired by the `withScope` plugin.

**After** (in the `withScope` app plugin):

```ts
// @silvery/ag-term — host wiring, apps never see this
export function withScope() {
  return (app) => {
    const root = createScope("app")
    let sigintCount = 0

    function disposeRoot(phase: "signal" | "app-exit") {
      root[Symbol.asyncDispose]().catch((error) =>
        reportDisposeError(error, { phase, scope: root }),
      )
    }

    root.use(term.signals.on("SIGINT", () => {
      sigintCount++
      const delay = sigintCount === 1 ? 500 : 0
      // kill-switch — deliberately not adopted into any scope
      setTimeout(() => process.exit(130), delay).unref?.()
      disposeRoot("signal")
    }, { priority: 0, name: "root-scope-dispose" }))

    root.use(term.signals.on("SIGTERM", () => disposeRoot("signal")))
    app.defer(() => root[Symbol.asyncDispose]())
    return { ...app, scope: root }
  }
}
```

`term.signals.on(...)` now returns a `Disposable` and is adopted like any other subscription. App `bootstrap.ts` becomes empty (or just `import` side-effects). The SIGINT handler is host plumbing, exactly once.

---

### 5. `useExit`

**Before**:

```tsx
import { useExit } from "silvery"
const silveryExit = useExit()
function quit() {
  silveryExit()
  printResumeHints()
}
```

**After**:

```tsx
const appScope = useAppScope()

function quit() {
  appScope[Symbol.asyncDispose]().catch((error) =>
    reportDisposeError(error, { phase: "manual", scope: appScope }),
  )
  // printResumeHints registered via appScope.defer earlier, runs LIFO
}
```

Whole-app shutdown is a root-scope operation, so React gets `useAppScope()` rather than a separate cleanup API.

---

### 6. Store `subscribe` / `off` pairs

**Before**:

```tsx
useEffect(() => {
  const unsub = store.subscribe(onChange)
  return () => unsub()
}, [store])
```

**After** — option A: store returns a `Disposable` directly:

```ts
// In @km/core — stores' subscribe becomes Disposable-returning
subscribe(fn: (v: T) => void): Disposable {
  listeners.add(fn)
  return { [Symbol.dispose]: () => listeners.delete(fn) }
}
```

```tsx
useScopeEffect((scope) => {
  scope.use(store.subscribe(onChange))
}, [store, onChange])
```

Option B: keep stores returning `() => void` (BC) and register the unsubscribe with `scope.defer`:

```tsx
useScopeEffect((scope) => {
  const unsub = store.subscribe(onChange)
  scope.defer(unsub)
}, [store, onChange])
```

---

### 7. Raw `new AbortController()`

**Before**:

```ts
const ac = new AbortController()
useEffect(() => {
  fetch(url, { signal: ac.signal }).then(...)
  return () => ac.abort()
}, [url])
```

**After**:

```tsx
useScopeEffect((scope) => {
  void fetch(url, { signal: scope.signal }).then(...)
}, [url])
```

The effect scope's own `signal` replaces the ad-hoc controller. One less object to track.

---

### 8. `fs.watch` / `chokidar`

**Before**:

```ts
const watcher = fs.watch(path, onChange)
// ... somewhere later ...
watcher.close()
```

**After**:

```ts
export function watchPath(
  scope: Scope,
  path: string,
  onChange: (e: fs.WatchEventType, f: string | null) => void,
) {
  return scope.use(disposable(fs.watch(path, onChange), w => w.close()))
}
```

No wrapper package. Use Node's `fs.watch` directly; `disposable()` lifts it into the scope.

---

### 9. `child_process.spawn`

**Before** (pattern in silvercode):

```ts
const proc = spawn("claude", args, opts)
proc.on("exit", onExit)
// cleanup scattered: killAll() in closeAll(), separately from subscribe/off
```

**After**:

```ts
export function startClaude(scope: Scope, args: string[], onExit: () => void) {
  const proc = scope.use(disposable(
    child_process.spawn("claude", args),
    p => p.kill("SIGTERM"),
  ))
  proc.on("exit", onExit)
  scope.defer(() => proc.off("exit", onExit))
  return proc
}
```

Use `child_process.spawn` directly. `disposable(value, cleanup)` lifts it into the scope. Event listeners register/unregister via `scope.defer`.

---

### 10. Sub-reconciler roots

**Before** (silvercode panel):

```ts
const root = mountSubroot(<PanelUI />, term)
// ... later ...
root.unmount()
```

**After**:

```tsx
useScopeEffect((scope) => {
  scope.use(mountSubroot(<PanelUI />, term))
}, [term])
```

When the outer component unmounts or the deps change, the effect scope disposes the sub-root; its own fiber tree then disposes cascading scopes.

`mountSubroot` returns `{ unmount(): void } & Disposable` where `[Symbol.dispose]` calls `unmount()`.

## Resource coverage

Every shape reduces to `scope.use(disposable(nativeThing, cleanup))`. No framework-owned replacements for platform APIs.

| Shape | Acquire | Dispose |
|---|---|---|
| Child processes | `child_process.spawn(cmd, args)` | `p => p.kill("SIGTERM")` |
| MCP stdio pipes | returned from `spawn` | `() => pipe.close()` |
| File watchers | `fs.watch(path, cb)` / `chokidar.watch(...)` | `w => w.close()` |
| File descriptors / streams | `fs.createWriteStream(...)` | `s => s.close()` |
| Database connections | `new Database(path)` (per-driver) | `db => db.close()` |
| Network sockets | `new WebSocket(url)` / `net.createConnection(...)` | `w => w.close()` |
| Subscriptions | `emitter.on(event, fn)` | `() => emitter.off(event, fn)` |
| Timers | `setTimeout(fn, ms)` / `setInterval(fn, ms)` | `clearTimeout` / `clearInterval` |
| Temp directories | `fs.mkdtempSync(prefix)` | `d => fs.rmSync(d, { recursive: true })` |
| Server listeners | `http.createServer(...).listen(port)` | `s => s.close()` |
| Worker threads | `new Worker(script)` | `w => w.terminate()` |
| Abort / cancellation | (use `scope.signal` directly in `fetch`, `AbortSignal.timeout`, etc.) | — |
| Terminal protocol state | `term.modes.enable(...)` (silvery-owned) | returned `Disposable` |
| Terminal signals | `term.signals.on(signal, fn, opts)` (silvery-owned) | returned `Disposable` |
| Sub-reconciler roots | `mountSubroot(element)` (silvery-owned) | returned `Disposable` |

Silvery-owned APIs (`term.*`, `mountSubroot`) return `Disposable` directly so they can be passed to `scope.use()` without wrapping. Everything else uses the native API + `disposable()`.

## Cross-platform story

Scope itself knows nothing about SIGINT, terminals, or tab close. It only knows `AbortSignal`.

Host wiring owns the root scope and decides when to start disposal:

- **TUI**: `withScope()` wires `term.signals.on(...)` (which returns `Disposable`) so `SIGINT` / `SIGTERM` start `root[Symbol.asyncDispose]()`; unawaited failures go to `reportDisposeError(...)`.
- **Web (future)**: `withScope()` wires `pagehide` / `beforeunload` to root-scope disposal.
- **Canvas (future)**: whatever embedding lifetime the host provides starts root-scope disposal.

App code is identical across targets. Browsers don't guarantee awaited async cleanup on tab close; that is a host-level honesty, not a reason to pollute the API. The model stays: deterministic when *you* control teardown, best-effort when the host kills the world. Terminals are the same if the process is `SIGKILL`ed.

## Anti-patterns (what to reject in review)

1. **`scope.spawn`, `scope.watch`, `scope.listen` methods.** God-object. Keep Scope tiny; resources are factory functions.
2. **AsyncLocalStorage ambient scope.** Hides ownership. "Which scope did this callback inherit?" becomes unanswerable.
3. **Render-phase scope side effects.** In React, `scope.defer(...)`, `scope.use(...)`, `scope.child(...)`, and `scope[Symbol.asyncDispose]()` do not belong in component bodies.
4. **Two cleanup systems.** If scopes exist, ad-hoc `useEffect` cleanup, `term.signals.on`, and `useDispose` must route through scope. Effect cleanup is allowed only to dispose an effect-owned child scope (or via `useScopeEffect(...)` internally).
5. **Silent teardown failures.** Collected errors surface as TC39's `SuppressedError` chain; report unawaited disposal failures via `reportDisposeError(...)`.
6. **Scopes outliving owners.** If a resource needs to survive its component, it was owned by the wrong component. Move it to an ancestor / service / app scope.
7. **Priority tags on `Scope`.** Hidden global coupling. Use nesting / registration order / child scopes.
8. **Ad-hoc dep-array lifetime management.** If a dep change should reset ownership, create/dispose a child scope with `useScopeEffect(...)`; do not hand-roll unrelated cleanup state.
9. **Shared subtree scopes by default.** Makes leaf cleanup too late. Default to component-local ownership.
10. **WeakRef / FinalizationRegistry for cleanup.** Non-deterministic; useless for processes, sockets, fds.
11. **`scope.move()`.** Inherited from `AsyncDisposableStack` but overridden to throw — Scope carries extra state (signal, name, child set) that can't transfer to a plain stack. Create a new scope and register resources explicitly if you need to relocate ownership.

## Done when

- `apps/silvercode/src/App.tsx` has no `useDispose`, no render-phase scope side effects, and no ad-hoc `useEffect` cleanup except disposing effect-owned child scopes (or `useScopeEffect(...)` internally); the subprocess dies via scope on panel unmount, app exit, and subtree crash/unmount.
- `bun run lint` fails on raw `setTimeout` / `setInterval` / `new AbortController` / `child_process.spawn` / `fs.watch` / `net.createServer` / `http.createServer` outside `@silvery/*` and `vendor/*`.
- STRICT test passes: root unmount returns timers, fds, subscriptions, child processes, listeners, handles, and requests to baseline counts (capture `process._getActiveHandles()` / `process._getActiveRequests()` before mount and assert post-dispose delta is zero in a termless harness).
- Grep for `useDispose|term\.signals\.on\(|useExit\(` in app-layer non-vendor code returns zero hits.

## Implementation guide

Concrete targets so Phase 0-1 can be claimed without reverse-engineering.

### Scope — replace current implementation with AsyncDisposableStack subclass

`vendor/silvery/packages/scope/src/index.ts` currently implements a hand-rolled disposer stack. Phase 0 replaces it with the subclass defined in the Core API section above. Deleted vs current:

- Hand-rolled disposer stack / LIFO traversal / error aggregation — gone (inherited from `AsyncDisposableStack`).
- `[Symbol.dispose]` — gone (only `[Symbol.asyncDispose]` via the standard).
- `sleep(ms)`, `timeout(ms, fn)` on Scope — gone (use `setTimeout` + `scope.defer(() => clearTimeout(id))` or `AbortSignal.timeout`).
- `createScope(parent, name)` — gone (roots use `createScope(name?)`; children use `scope.child(name?)`).
- `ScopeDisposedError` — never exported in v4. Post-dispose operations throw TC39's `ReferenceError` instead.

### Disposal runtime contract

Inherited from `AsyncDisposableStack`: LIFO ordering, async-await, idempotent `[Symbol.asyncDispose]()`, post-dispose `ReferenceError`, multi-throw `SuppressedError`. Scope overrides `[Symbol.asyncDispose]()` to cascade children first (from a private `Set<Scope>`, not the disposer stack) before running the inherited stack.

Scope additions:

- **Parent signal linkage** — a child's `signal` aborts when the parent's aborts.
- **Children-first cascade** — the override ensures child scopes dispose before the parent's own user disposers.
- **Early-child release** — children register themselves in a `Set`, not the parent's disposer stack, so disposing a child early actually frees the reference.
- **Signal abort in disposer stack** — `this.defer(() => controller.abort())` means disposal aborts the signal as part of LIFO teardown.

### Reconciler integration — where to edit

- **`vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`** — add an optional `scope: Scope | null` field on the fiber-local state the reconciler tracks. On the fiber-unmount path, if `scope != null`, start `scope[Symbol.asyncDispose]()` and route failures to `reportDisposeError(error, { phase: "react-unmount", scope })`.
- **`vendor/silvery/packages/ag-react/src/hooks/useScope.ts`** (new file) — hook that:
  1. Looks for a scope on the current fiber's state. If present, return it.
  2. Walks up the owner chain (React's fiber `.return` pointer, exposed via `react-reconciler` internals or equivalent) to find the nearest ancestor scope.
  3. Lazily allocates a fiber-local scope as a child of the nearest ancestor on first access — so components that never call `useScope()` pay nothing.
- **`vendor/silvery/packages/ag-react/src/hooks/useAppScope.ts`** (new file) — returns the root scope attached by `withScope()`.
- **`vendor/silvery/packages/ag-react/src/hooks/useScopeEffect.ts`** (new file) — `useEffect` wrapper that creates a child scope after commit, calls `setup(child)`, and disposes that child on dep change/unmount.
- **`vendor/silvery/packages/ag-term/src/runtime/create-app.tsx`** — `createApp()` unconditionally calls `withScope()` first (so every app has a root scope). `app` gets a `.scope` field. The existing plugin-chain (`pipe(withX, withY)(...)`) stays as-is; `withScope` just goes first by default.
- **`vendor/silvery/packages/ag-term/src/runtime/devices/signals.ts`** — `term.signals.on(...)` returns `Disposable`; `withScope()` registers SIGINT/SIGTERM once and starts root-scope disposal.

### `withScope` contract

```ts
// @silvery/ag-term
export function withScope(): <A extends AppBase>(app: A) => A & { readonly scope: Scope }
```

Where `AppBase` is the existing plugin-chain app shape (see `create-app.tsx`). `withScope` attaches `scope: rootScope` to the app; `useAppScope()` returns this root and `useScope()` walks up from it.

### No new platform packages

There is no `@silvery/node`, `@silvery/web`, or `@silvery/core` wrapper package. Users call native APIs directly (`child_process.spawn`, `fs.watch`, `new WebSocket`, `setTimeout`) and lift them into the scope with `disposable(value, cleanup)` + `scope.use(...)`. Silvery's only contribution at the resource layer is the `disposable()` helper (3 lines, lives in `@silvery/scope`).

### Testing strategy

- **Unit tests** (`vendor/silvery/packages/scope/tests/` — new directory): parent-child signal propagation, `child()` registers via `use()` and cascades on parent disposal, `disposable()` helper, `reportDisposeError` + `DisposeErrorContext`, signal-aborted-in-disposer-stack ordering. Inherited behavior (LIFO, async, idempotent, `SuppressedError`, post-dispose throws) is TC39's responsibility — no need to re-test.
- **Reconciler integration** (`vendor/silvery/packages/ag-react/tests/scope.test.tsx` — new): mount → unmount; `useScope()` ancestor walk; `useAppScope()` root lookup; `useScopeEffect()` creates after commit and disposes on dep change/unmount; StrictMode double-invoke (use `<StrictMode>` wrapper in the test renderer).
- **End-to-end leak check** (termless — see `apps/km-tui/tests/CLAUDE.md` for termless harness): capture baseline active handles/requests before mount, unmount silvercode with a subprocess, then assert the post-dispose counts return to baseline (`delta === 0`). Run under `SILVERY_STRICT=1`.
- **Template to copy**: `apps/km-tui/tests/showcase.spec.ts` (canonical TUI test pattern per root CLAUDE.md).

### StrictMode contract

Dev-mode double-invoke must dispose-then-reacquire. Contract: the second mount sees a **fresh scope** (new signal, empty disposer stack), never a cancelled one. The first mount's scope is disposed synchronously before the second mount's `useScope()` returns. Test explicitly.

### FAQ / edge cases

- **Resource shared across sibling components?** Lift to the nearest common ancestor — acquire in its `useScope()` and pass down. Siblings don't share scope.
- **Resource outlives re-render but dies on unmount?** Use `useScopeEffect(setup, [])` for post-commit acquisition, or lift ownership to an ancestor/service if the lifetime is broader. Do not acquire during render.
- **Error boundary caught an error?** React unmounts the crashed subtree during recovery; that fiber subtree's scopes die with it. No special scope API is needed for error boundaries.
- **Async work that should outlive the component?** You're designing it wrong. Move the work to a service/app scope (the app root) and pass the component a handle — the component's lifetime is just "interested listener," not owner.
- **What if `scope.defer(fn)` throws synchronously during dispose?** Collected into TC39's `SuppressedError` chain. Disposal continues. Other disposers run regardless.
- **Can I hold `scope` in a `useRef`?** No — always `useScope()`. StrictMode may give you a different scope on remount; the ref would point at a disposed one.
- **Does `scope.use` transfer ownership?** Yes. The passed value is disposed when the scope disposes; the caller should not call `.close()` / `.kill()` / etc. on it.
- **Two components want to own the same resource?** Only one owns. The other receives a reference (via prop / context) and doesn't call `scope.use()` on it.
- **When would I use `scope.adopt(value, fn)` instead of `scope.use(disposable(value, fn))`?** Almost never. Both do the same thing; `.use(disposable(...))` reads left-to-right and composes with `using`. TC39's `.adopt` is available if you prefer it.

## Phased refactor plan

Uses `/refactor` discipline: explicit phases, verifiable exit criteria, zero WIP between phases, each phase shippable independently.

### Phase 0 — API lock (half day)

Replace the hand-rolled disposer stack with a subclass of `AsyncDisposableStack`:

1. Rewrite `vendor/silvery/packages/scope/src/index.ts` as the subclass sketch above. Delete the old disposer stack, LIFO traversal, state machine, and error-aggregation code.
2. Delete `sleep`, `timeout`, `interval` methods on Scope (callers use `setTimeout` + `disposable()` wrapping, or `AbortSignal.timeout`).
3. Export `disposable()` (sync + async overloads), `reportDisposeError`, `DisposeErrorContext`.
4. Require `lib: ["esnext.disposable"]` in scope's tsconfig.
5. Unit tests in `vendor/silvery/packages/scope/tests/`: parent-child signal propagation, `child()` registers via `use()` and inherits parent disposal, `disposable()` helper, `reportDisposeError` signature. No need to test the inherited LIFO/async/idempotent behavior — that's TC39's responsibility.

**Exit**: `@silvery/scope` matches the subclass form; unit tests green; `bun run test:vendor -- scope` passes.

### Phase 1 — Prototype de-risk (1 week)

Build order (each step passes tests before the next starts):

1. **`useScope()` / `useAppScope()` / `useScopeEffect()` hooks** — new files under `vendor/silvery/packages/ag-react/src/hooks/`. Test: nested components resolve the right ancestor scope; `useAppScope()` returns the root; `useScopeEffect()` creates only after commit.
2. **Fiber disposal wiring** — edit `vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`. On fiber unmount, start `scope?.[Symbol.asyncDispose]()` and route failures to `reportDisposeError(...)`. Test: mount/unmount disposes the scope; StrictMode double-invoke disposes both cleanly.
3. **`withScope()` plugin** — `vendor/silvery/packages/ag-term/src/runtime/` (wire into `create-app.tsx` as default plugin). Root SIGINT/SIGTERM through a single priority-0 signal handler. Test: kill signal starts root-scope disposal.
4. **Migrate silvercode Claude subprocess** — edit `apps/silvercode/src/App.tsx` to acquire it with `useScopeEffect(...)` and `scope.use(disposable(child_process.spawn("claude", args), p => p.kill("SIGTERM")))`. No factory needed.
5. **Dogfood for a week** — run silvercode daily. Watch `ps | grep claude`, `lsof` for fd count, log file growth.

**Phase 1 proof obligations (must pass before Phase 2):**

1. `useScopeEffect(...)` never runs during render; acquisition starts only after commit.
2. StrictMode double-invoke disposes the first scope before the second mount receives a fresh one.
3. `[Symbol.asyncDispose]()` is idempotent (inherited from `AsyncDisposableStack`); post-dispose `use(...)`, `defer(...)`, `adopt(...)`, or `child(...)` throw `ReferenceError`.
4. Early child disposal detaches from the parent and is skipped during later parent teardown.
5. Every fire-and-forget disposal path reports exactly once through `reportDisposeError(...)`.

**Exit**: three teardown paths verified — (a) panel unmount kills subprocess, (b) SIGTERM app kills subprocess, (c) subtree crash/unmount kills subprocess. StrictMode double-mount disposes cleanly. Sub-reconciler root cascades through outer scope. Zero leaks over 7 days.

**Bail criteria**: if any step's tests fail on commit-phase reentrancy, StrictMode double-dispose, or sub-root lifetime, stop and revisit the design before expanding scope.

### Phase 2 — Silvery-owned Disposable returns (1 day)

Silvery has a handful of APIs where users can't easily reach the underlying resource to wrap with `disposable()`. Make those APIs return `Disposable` directly:

- **`term.signals.on(signal, fn, opts)`** — return `Disposable`. (Currently returns `() => void` unregister function.)
- **`term.modes.enable(mode)`** / `rawMode` / `altScreen` / `mouseTracking` — return `Disposable`.
- **`mountSubroot(element)`** (if it doesn't already) — `{ unmount(): void } & Disposable`.

No `@silvery/node` / `@silvery/web` / `@silvery/core` packages. No `spawn()`, `watch()`, `tempDir()`, `listen()`, `connectWebSocket()`, `timeout()`, `interval()` wrappers. Users call the native APIs directly and wrap with `disposable(value, cleanup)`.

**Exit**: silvery-owned subscription/mode/root APIs return `Disposable`. No new packages shipped.

### Phase 3 — Migrate existing mechanisms (1-2 weeks)

One bead per mechanism; do them in order:

| Order | Mechanism | Action | Bead |
|---|---|---|---|
| 1 | Sub-reconciler roots (silvercode panels) | Wire root scope cascade via `scope.use(mountSubroot(...))` | `km-silvery.scope-subroots` |
| 2 | Raw `setTimeout` / `setInterval` in app code | Replace with `scope.use(disposable(setTimeout(fn, ms), clearTimeout))` | `km-silvery.scope-timers` |
| 3 | Raw `new AbortController` | Replace with `scope.signal` | `km-silvery.scope-abort` |
| 4 | Raw `fs.watch` / `child_process.spawn` | Wrap with `disposable(nativeCall, cleanup)` and `scope.use(...)` | `km-silvery.scope-node-io` |
| 5 | `term.signals.on(SIGINT)` in app code | Wire into root scope; app code no longer touches `term.signals` | `km-silvery.scope-signals` |
| 6 | `useExit` | Replace call sites with `useAppScope()` + root-scope disposal | `km-silvery.scope-useexit` |
| 7 | Store `subscribe` / `off` pairs | `scope.use(store.subscribe(fn))` (stores return `Disposable` or wrap with `disposable()`) | `km-silvery.scope-stores` |

**Exit per bead**: grep shows zero remaining raw usage of that mechanism in `apps/*` + `packages/*` (vendor exempt). Test suite green.

**Exit for phase**: all 7 beads closed. No raw lifecycle code in app layer.

### Phase 4 — Enforcement + systematic doc/example audit (1-2 days)

Lock the pattern in place with one lint gate and one sweep.

1. **ESLint rule `no-raw-lifecycle`** for `apps/*` + `packages/*`, banning raw timers, `new AbortController`, Node resource constructors (`spawn`, `fs.watch`, servers/streams), and naked `.on(...)` subscriptions outside platform packages / `vendor/*`.
2. **Doc/example sweep** across `hub/silvery/design/*`, `vendor/silvery/docs/**`, package READMEs/examples, root + app `CLAUDE.md`, `.claude/skills/*`, app READMEs, migration guide, and test fixtures. Every snippet showing cleanup must use `useScopeEffect(...)`, `scope.use(...)`, `scope.defer(...)`, or explicit child-scope disposal.
3. **Audit command**:

```bash
rg -l 'useDispose|term\.signals\.on\(|useExit\(|new AbortController|fs\.watch\(|setTimeout\(|setInterval\(' \
   docs/ hub/ vendor/silvery/docs/ vendor/silvery/README.md \
   apps/*/README.md apps/*/CLAUDE.md .claude/skills/
```

4. **Exit**: lint clean, migration guide published, and banned patterns outside `@silvery/*` + `vendor/*` reduced to zero or explicitly documented as host wiring.

### Phase 5 — Deprecate `useDispose` (1 release cycle, then delete)

**Do**:

1. `useDispose` gets JSDoc `@deprecated` pointing to `useScopeEffect(...)`, `scope.defer(...)`, and `scope.use(...)`.
2. Body stays as a shim that forwards to `useScopeEffect((scope) => scope.defer(fn), [fn])`.
3. One release later: delete `useDispose.ts`. Grep-gate against imports.

**Exit**: `useDispose.ts` deleted. No imports anywhere.

### WIP discipline

- Each phase is shippable on its own. The app works after Phase 1 (new scope coexists with old mechanisms). After Phase 3, old mechanisms gone. Phase 4 makes it permanent.
- Do not start Phase N+1 until Phase N is closed. No parallel phases.
- Each bead has a failing test or grep-based exit criterion before it opens.
- After each phase: `bun run test:ci` green, `bd preflight` green, commit + push.

### Beads to create

- `km-silvery.scope-phase-0` (parent: `km-silvery.lifecycle-scope`) — research + API lock
- `km-silvery.scope-phase-1` — prototype de-risk (fiber slot, useScope, silvercode migration)
- `km-silvery.scope-phase-2` — platform factories
- `km-silvery.scope-phase-3-*` — one per migration mechanism (7 beads)
- `km-silvery.scope-phase-4` — enforcement + doc/example audit (parent bead)
  - `km-silvery.scope-phase-4-eslint` — ESLint rule + CI gate
  - `km-silvery.scope-phase-4-docs-design` — hub/silvery/design/*
  - `km-silvery.scope-phase-4-docs-silvery` — vendor/silvery/docs/**, READMEs, examples
  - `km-silvery.scope-phase-4-docs-km` — root CLAUDE.md, km-tui CLAUDE.md, .claude/skills/*
  - `km-silvery.scope-phase-4-docs-apps` — per-app CLAUDE.md and READMEs
  - `km-silvery.scope-phase-4-migration-guide` — `hub/silvery/design/migration-lifecycle-scope.md`
  - `km-silvery.scope-phase-4-comments` — stale inline comments + test fixtures
- `km-silvery.scope-phase-5` — useDispose removal

Each phase's parent bead depends on the previous phase's parent bead. Phase 4 sub-beads run in parallel once the ESLint rule lands.

## Open risks

1. **Fiber deletion timing.** React's reconciler deletes fibers during commit. The reconciler must start `[Symbol.asyncDispose]()` without blocking commit and must route any rejection to `reportDisposeError(...)`. Prototype tests confirm there is no commit-phase reentrancy surprise.
2. **StrictMode double-invoke.** Dev-mode double-mount must double-dispose cleanly. Prototype test suite must cover this.
3. **Error during dispose of an async child.** TC39's `SuppressedError` chain preserves stacks; Prototype tests confirm parent teardown continues after a child dispose throws.
4. **Sub-reconciler root lifetime.** Silvercode's panel sub-roots must cascade through the outer scope; this is the first test of child-scope composition under a real reconciler boundary.

## Prior art

Trio-style structured concurrency ported to React fiber lifetimes. One-liner per precedent:

- **Effect-TS `Scope` / `Layer`** — correct tree semantics; conflates lifetime with DI. We take the tree, skip the DI.
- **Trio nursery / Kotlin `coroutineScope` / Swift `TaskGroup`** — tree + LIFO + propagate-cancel. Borrowed whole.
- **Go `context.Context`** — cancellation propagation only. We add disposal on top.
- **VS Code `Disposable` / `DisposableStore`** — pragmatic TS baseline that predates TC39. `scope.use(disposable(...))` + `using` gives the same ergonomics without the bespoke type.
- **TC39 `AsyncDisposableStack`** (ES2024) — the spec we subclass. We do not reimplement its semantics; we extend it with `signal` and `child()`.
- **React `useEffect` cleanup** — the return-function cleanup is today's pattern; fiber-scoped disposal generalises it.
- **Rust `Drop` + scoped threads** — gives the lexical (`using`) + structural (fiber) pair.
- **TC39 explicit resource management** — `using` is a first-class citizen, not a bolt-on.

## References

- Existing primitive: [`vendor/silvery/packages/scope/src/index.ts`](../../../vendor/silvery/packages/scope/src/index.ts)
- Current stopgap: [`vendor/silvery/packages/ag-react/src/hooks/useDispose.ts`](../../../vendor/silvery/packages/ag-react/src/hooks/useDispose.ts)
- Reconciler host-config (fiber lifecycle hooks go here): [`vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`](../../../vendor/silvery/packages/ag-react/src/reconciler/host-config.ts)
- App entry (withScope plugs in here): [`vendor/silvery/packages/ag-term/src/runtime/create-app.tsx`](../../../vendor/silvery/packages/ag-term/src/runtime/create-app.tsx)
- Signal mediator: `vendor/silvery/packages/ag-term/src/runtime/devices/signals.ts`
- Public doc mirror (post Phase 4): `vendor/silvery/docs/design/lifecycle-scope.md`
- Bead: `km-silvery.lifecycle-scope`
