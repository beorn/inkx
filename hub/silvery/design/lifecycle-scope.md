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
5. **One uniform gate.** Every resource shape plugs in through `scope.adopt(Disposable)`. No special cases.
6. **Unmount is hard law.** If a resource must outlive its component, it was owned by the wrong thing.
7. **Cross-platform by construction.** Scope knows only `AbortSignal`. SIGINT/pagehide live in host wiring.
8. **Render is pure.** In React, `scope.defer(...)`, `scope.adopt(...)`, `scope.child(...)`, and `scope[Symbol.asyncDispose]()` are forbidden during render. Resource acquisition happens after commit via `useScopeEffect(...)` or inside event handlers.

## TypeScript / runtime prerequisites

Silvery lifecycle scopes assume `AbortController` / `AbortSignal` and explicit resource management symbols are available at runtime. TypeScript should compile with `lib` including `esnext.disposable` (or equivalent) so `Disposable`, `AsyncDisposable`, `Symbol.dispose`, and `Symbol.asyncDispose` are typed. React integration targets the current `react-reconciler` host config used by Silvery; platform wrappers in `@silvery/node` stay pure-Node and do not depend on React.

## Core API — `@silvery/scope`

The `Scope` interface still has four methods. Companion exports cover root creation and fire-and-forget disposal reporting; host wiring adds `withScope()`.

```ts
export interface Scope extends AsyncDisposable {
  readonly signal: AbortSignal
  defer(fn: () => void | Promise<void>): void
  adopt<T extends Disposable | AsyncDisposable>(value: T): T
  child(name?: string): Scope
}

export class ScopeDisposedError extends Error {}

export interface DisposeErrorContext {
  readonly phase: "react-unmount" | "signal" | "app-exit" | "manual"
  readonly scope?: Scope
}

export function createScope(name?: string): Scope
export function reportDisposeError(error: unknown, context: DisposeErrorContext): void

// @silvery/ag-term
export function withScope(): AppPlugin   // default-enabled by createApp()
```

**What was cut**:

- `cancelled` — derivable from `signal.aborted`. One fact, one place.
- `sleep(ms)` / `timeout(ms, fn)` / `interval(ms, fn)` — free functions in `@silvery/core`, not methods on `Scope`.
- `name` as a getter — debug-only. Keep `name` only as an optional `createScope(name?)` / `scope.child(name?)` argument for trace messages; not part of the runtime interface.
- `createScope(parent, name)` — removed. Roots use `createScope(name?)`; descendants come from `scope.child(name?)`.
- No `scope.spawn`, `scope.watch`, `scope.listen`, `scope.tempdir`. Resources are factories in platform packages (`@silvery/node`, `@silvery/web`, etc.) that return `Disposable`.

**Why `defer` survives alongside `adopt`**: `defer(fn)` and `adopt({[Symbol.dispose]: fn})` are equivalent, but 90% of call sites register a callback, not a disposable-bearing object. Keeping both is cheap and removes the need to write `{[Symbol.dispose]: fn}` noise in every cleanup line.

### Scope state machine and disposal

A scope is always in exactly one state: `open`, `disposing`, or `disposed`.

- `open` — `defer(...)`, `adopt(...)`, and `child(...)` succeed.
- `disposing` — entered exactly once by the first call to `[Symbol.asyncDispose]()`. The scope aborts `signal`, disposes children first, then runs its own cleanup stack in strict LIFO, continuing after errors.
- `disposed` — terminal state after the disposal promise settles.

`[Symbol.asyncDispose]()` is idempotent: the first call starts teardown and returns the disposal promise; every later call returns that same promise. Once a scope leaves `open`, calls to `defer(...)`, `adopt(...)`, or `child(...)` throw `ScopeDisposedError`.

Children dispose before their parent's own stack runs. If a child is disposed early, it detaches from the parent's child set immediately; the parent later skips it rather than disposing it a second time.

If any cleanup throws, disposal continues through the full tree. When teardown finishes, the returned promise rejects with `AggregateError` containing every collected failure.

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

**Render-phase rule**: component render must be side-effect free. Calling `scope.defer(...)`, `scope.adopt(...)`, `scope.child(...)`, or `scope[Symbol.asyncDispose]()` during render is invalid. Acquire in `useScopeEffect(...)`; dispose from event handlers only when you intentionally end a lifetime early.

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

Every resource shape collapses into one line.

**Component-owned resources** — acquired after commit, live until the keyed effect is replaced or the component unmounts:

```tsx
function Panel({ cmd }: { cmd: string }) {
  useScopeEffect((scope) => {
    scope.adopt(spawn(cmd))
    scope.adopt(tempDir())
  }, [cmd])

  return <Box>...</Box>
}
```

**Shorter lifetimes** — `useScopeEffect(...)` gives a fresh child scope per dep-set:

```tsx
function Panel({ url }: { url: string }) {
  useScopeEffect((scope) => {
    scope.adopt(connectWebSocket(url))
    scope.defer(() => flushLogs())
  }, [url])

  return <Box>...</Box>
}
```

`connectWebSocket(url)` is the platform wrapper:

```ts
export function connectWebSocket(url: string): WebSocket & Disposable {
  const ws = new WebSocket(url)
  return Object.assign(ws, {
    [Symbol.dispose]() {
      ws.close()
    },
  })
}
```

**Narrow synchronous lifetime** — TC39 `using` inside a block:

```ts
async function compile(scope: Scope) {
  await using s = scope.child("compile")
  const tmp = s.adopt(tempDir())
  // tmp + any other resources in s disposed at block exit (success or throw)
}
```

Do not `using` an already-adopted resource — that creates two owners and a double-dispose. Wrap with a child scope instead, as above.

Non-component code takes scope explicitly:

```ts
export function openStore(scope: Scope, path: string): Database {
  const db = new Database(path)
  scope.defer(() => db.close())
  return db
}
```

For APIs that return primitives (`setTimeout`, `setInterval`, `fs.watch`, etc.), write thin `Disposable` wrappers in the platform/helper package:

```ts
export function interval(ms: number, fn: () => void): Disposable {
  const id = setInterval(fn, ms)
  return { [Symbol.dispose]: () => clearInterval(id) }
}
```

Every entry in the resource list below reduces to this same pattern.

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
  scope.adopt(createController())
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
    scope.adopt(sess.session.subscribe((e) => {
      if (e.kind === "permission-request") {
        const id = seq++
        setToasts((t) => [...t, { id, text: `...`, kind: "warn" }])
        scope.adopt(timeout(4000, () => setToasts((t) => t.filter((x) => x.id !== id))))
      }
    }))
  }
}, [sessions])
```

`timeout(ms, fn)` is a free-function factory in `@silvery/core` returning `Disposable`. The effect scope collects everything — subscriptions and the pending timers — and disposes them as one unit.

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
      s.adopt(timeout(debounceMs, doWrite))
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

    root.adopt(term.signals.on("SIGINT", () => {
      sigintCount++
      const delay = sigintCount === 1 ? 500 : 0
      const forceQuit = timeout(delay, () => process.exit(130))
      forceQuit // fires regardless of scope; not adopted (deliberate: this IS the kill-switch)
      disposeRoot("signal")
    }, { priority: 0, name: "root-scope-dispose" }))

    root.adopt(term.signals.on("SIGTERM", () => disposeRoot("signal")))
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
  scope.adopt(store.subscribe(onChange))
}, [store, onChange])
```

Option B: keep stores returning `() => void` (BC) and wrap the unsubscribe:

```ts
// @silvery/core
export function disposable(fn: () => void): Disposable {
  return { [Symbol.dispose]: fn }
}
```

```tsx
useScopeEffect((scope) => {
  scope.adopt(disposable(store.subscribe(onChange)))
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
  return scope.adopt(watch(path, onChange))  // watch() from @silvery/node
}
```

No manual close — the passed scope owns it.

The `watch()` factory:

```ts
// @silvery/node
export function watch(path: string, fn: (e: fs.WatchEventType, f: string | null) => void): Disposable {
  const w = fs.watch(path, fn)
  return { [Symbol.dispose]: () => w.close() }
}
```

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
  const proc = scope.adopt(spawnClaude(args))
  scope.adopt(on(proc, "exit", onExit))
  return proc
}
```

```ts
// @silvery/node
export function spawnClaude(args: string[]): ChildProcess & Disposable {
  const proc = spawn("claude", args)
  return Object.assign(proc, {
    [Symbol.dispose]() { proc.kill("SIGTERM") }
  })
}
```

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
  scope.adopt(mountSubroot(<PanelUI />, term))
}, [term])
```

When the outer component unmounts or the deps change, the effect scope disposes the sub-root; its own fiber tree then disposes cascading scopes.

`mountSubroot` returns `{ unmount(): void } & Disposable` where `[Symbol.dispose]` calls `unmount()`.

## Resource coverage

Each resource shape is a factory returning `Disposable` or `AsyncDisposable`; adding a new shape means writing a factory, not changing `Scope`.

| Shape | Factory | Package |
|---|---|---|
| Child processes | `spawn(cmd, args, opts)` | `@silvery/node` |
| MCP stdio pipes | returned from `spawn`; `scope.defer(() => pipe.close())` | `@silvery/node` |
| File watchers | `watch(path, cb)` | `@silvery/node` |
| File descriptors / streams | `createWriteStream` + adoption wrapper | `@silvery/node` |
| Database connections | `openDb(path)` | per-driver |
| Network sockets | `connectWebSocket(url)` | `@silvery/web` / `@silvery/node` |
| Subscriptions | `on(emitter, event, fn)` / `disposable(fn)` | `@silvery/core` |
| Timers | `interval(ms, fn)` / `timeout(ms, fn)` / `sleep(scope, ms)` | `@silvery/core` |
| Temp directories | `tempDir()` | `@silvery/node` |
| Server listeners | `listen(port)` | `@silvery/node` |
| Worker threads | `worker(script)` | `@silvery/node` |
| Terminal protocol state | `rawMode(term)` | `@silvery/ag-term` |
| Terminal signals | `term.signals.on(signal, fn, opts)` returns `Disposable` | `@silvery/ag-term` |
| Sub-reconciler roots | `mountSubroot(element)` | `@silvery/ag-react` |

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
3. **Render-phase scope side effects.** In React, `scope.defer(...)`, `scope.adopt(...)`, `scope.child(...)`, and `scope[Symbol.asyncDispose]()` do not belong in component bodies.
4. **Two cleanup systems.** If scopes exist, ad-hoc `useEffect` cleanup, `term.signals.on`, and `useDispose` must route through scope. Effect cleanup is allowed only to dispose an effect-owned child scope (or via `useScopeEffect(...)` internally).
5. **Silent teardown failures.** Collect errors, surface as `AggregateError`, and report unawaited disposal failures via `reportDisposeError(...)`.
6. **Scopes outliving owners.** If a resource needs to survive its component, it was owned by the wrong component. Move it to an ancestor / service / app scope.
7. **Priority tags on `Scope`.** Hidden global coupling. Use nesting / registration order / child scopes.
8. **Ad-hoc dep-array lifetime management.** If a dep change should reset ownership, create/dispose a child scope with `useScopeEffect(...)`; do not hand-roll unrelated cleanup state.
9. **Shared subtree scopes by default.** Makes leaf cleanup too late. Default to component-local ownership.
10. **WeakRef / FinalizationRegistry for cleanup.** Non-deterministic; useless for processes, sockets, fds.

## Done when

- `apps/silvercode/src/App.tsx` has no `useDispose`, no render-phase scope side effects, and no ad-hoc `useEffect` cleanup except disposing effect-owned child scopes (or `useScopeEffect(...)` internally); the subprocess dies via scope on panel unmount, app exit, and subtree crash/unmount.
- `bun run lint` fails on raw `setTimeout` / `setInterval` / `new AbortController` / `child_process.spawn` / `fs.watch` / `net.createServer` / `http.createServer` outside `@silvery/*` and `vendor/*`.
- STRICT test passes: root unmount returns timers, fds, subscriptions, child processes, listeners, handles, and requests to baseline counts (capture `process._getActiveHandles()` / `process._getActiveRequests()` before mount and assert post-dispose delta is zero in a termless harness).
- Grep for `useDispose|term\.signals\.on\(|useExit\(` in app-layer non-vendor code returns zero hits.

## Implementation guide

Concrete targets so Phase 0-1 can be claimed without reverse-engineering.

### Scope interface — pruning diff

`vendor/silvery/packages/scope/src/index.ts` currently exports a superset. Phase 0 prunes it to the locked form:

```ts
export interface Scope extends AsyncDisposable {
  readonly signal: AbortSignal
  defer(fn: () => void | Promise<void>): void
  adopt<T extends Disposable | AsyncDisposable>(value: T): T
  child(name?: string): Scope
}

export class ScopeDisposedError extends Error {}

export interface DisposeErrorContext {
  readonly phase: "react-unmount" | "signal" | "app-exit" | "manual"
  readonly scope?: Scope
}

export function createScope(name?: string): Scope
export function reportDisposeError(error: unknown, context: DisposeErrorContext): void
```

Runtime changes:

- `name` and lifecycle state stay on the internal struct for debug/trace but stay out of the public `Scope` interface.
- `sleep(scope, ms)`, `timeout(ms, fn)`, and `interval(ms, fn)` live in `@silvery/core`.
- `[Symbol.dispose]` is not part of `Scope`; teardown happens through `[Symbol.asyncDispose]()`.
- `adopt(...)` performs a real runtime check and throws `TypeError` for non-disposables. It prefers `[Symbol.asyncDispose]` when present:

```ts
function toDisposer(value: Disposable | AsyncDisposable): () => void | Promise<void> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new TypeError("scope.adopt() requires a Disposable or AsyncDisposable")
  }

  const asyncDispose = (value as AsyncDisposable)[Symbol.asyncDispose]
  if (typeof asyncDispose === "function") {
    return () => asyncDispose.call(value)
  }

  const dispose = (value as Disposable)[Symbol.dispose]
  if (typeof dispose === "function") {
    return () => dispose.call(value)
  }

  throw new TypeError("scope.adopt() requires a Disposable or AsyncDisposable")
}
```

### Disposal runtime contract

`defer(fn)` and `adopt(value)` push onto one shared stack in registration order. Disposal pops that stack in reverse. If code wants cleanup `A` to run after adopted resource `B` is gone, call `defer(A)` first and `adopt(B)` second.

Implementation requirements:

1. New scopes start in `open`.
2. The first `[Symbol.asyncDispose]()` transitions to `disposing`, aborts `signal`, and creates the single disposal promise.
3. Children dispose before the parent's own stack runs.
4. A child that starts disposing early detaches from its parent's child set immediately, so the parent never disposes it twice.
5. When the traversal settles, state becomes `disposed`.
6. Any `defer(...)`, `adopt(...)`, or `child(...)` call outside `open` throws `ScopeDisposedError`.
7. All cleanup failures are collected and surfaced as one `AggregateError` after the full traversal completes.

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

### `@silvery/node` — new package

Location: `vendor/silvery/packages/node/`. Deps: shared Silvery scope types only; no React dependency. Pure Node package. `@silvery/bun` can layer on later for `bun:sqlite` etc. Exports: `spawn`, `watch`, `tempDir`, `listen`, and any thin adoption wrappers needed for Node-owned resources. Timers stay in `@silvery/core`. Whole package target is <300 LOC.

Phase 2 creates this package. Phase 1 doesn't need it — inline the one `spawnClaude` wrapper in silvercode and port after Phase 2.

### Testing strategy

- **Unit tests** (`vendor/silvery/packages/scope/tests/` — new directory): `createScope`, `defer` / `adopt` ordering, state transitions (`open → disposing → disposed`), idempotent `[Symbol.asyncDispose]()`, post-dispose `ScopeDisposedError`, child detachment, `AggregateError` on multi-throw, sync vs async dispose paths.
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
- **What if `scope.defer(fn)` throws synchronously during dispose?** Collected into `AggregateError`. Disposal continues. Other disposers run regardless.
- **Can I hold `scope` in a `useRef`?** No — always `useScope()`. StrictMode may give you a different scope on remount; the ref would point at a disposed one.
- **Does `scope.adopt` transfer ownership?** Yes. The adopted value is disposed when the scope disposes; the caller should not call `.close()` / `.kill()` / etc. on it.
- **Two components want to adopt the same resource?** Only one owns. The other receives a reference (via prop / context) and doesn't adopt.

## Phased refactor plan

Uses `/refactor` discipline: explicit phases, verifiable exit criteria, zero WIP between phases, each phase shippable independently.

### Phase 0 — API lock (1 day)

The prior-art survey above already picks our mental model. Phase 0 is mechanical:

1. Apply the pruning diff (see *Implementation guide → Scope interface*) to `vendor/silvery/packages/scope/src/index.ts`.
2. Move `sleep(scope, ms)`, `timeout(ms, fn)`, and `interval(ms, fn)` to `@silvery/core`.
3. Switch to `[Symbol.asyncDispose]`.
4. Add `adopt()`, `ScopeDisposedError`, and `reportDisposeError(...)`.
5. Write the scope unit-test suite in `vendor/silvery/packages/scope/tests/`, including state transitions, idempotence, and post-dispose throws.

**Exit**: `@silvery/scope` matches the locked interface; unit tests green; `bun run test:vendor -- scope` passes.

### Phase 1 — Prototype de-risk (1 week)

Build order (each step passes tests before the next starts):

1. **`useScope()` / `useAppScope()` / `useScopeEffect()` hooks** — new files under `vendor/silvery/packages/ag-react/src/hooks/`. Test: nested components resolve the right ancestor scope; `useAppScope()` returns the root; `useScopeEffect()` creates only after commit.
2. **Fiber disposal wiring** — edit `vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`. On fiber unmount, start `scope?.[Symbol.asyncDispose]()` and route failures to `reportDisposeError(...)`. Test: mount/unmount disposes the scope; StrictMode double-invoke disposes both cleanly.
3. **`withScope()` plugin** — `vendor/silvery/packages/ag-term/src/runtime/` (wire into `create-app.tsx` as default plugin). Root SIGINT/SIGTERM through a single priority-0 signal handler. Test: kill signal starts root-scope disposal.
4. **Migrate silvercode Claude subprocess** — edit `apps/silvercode/src/App.tsx` to acquire it with `useScopeEffect(...)` and `scope.adopt(spawnClaude(...))`. Inline the `spawnClaude` `Disposable` wrapper in silvercode for now (the real `@silvery/node` comes in Phase 2).
5. **Dogfood for a week** — run silvercode daily. Watch `ps | grep claude`, `lsof` for fd count, log file growth.

**Phase 1 proof obligations (must pass before Phase 2):**

1. `useScopeEffect(...)` never runs during render; acquisition starts only after commit.
2. StrictMode double-invoke disposes the first scope before the second mount receives a fresh one.
3. `[Symbol.asyncDispose]()` is idempotent, and post-dispose `defer(...)`, `adopt(...)`, and `child(...)` throw `ScopeDisposedError`.
4. Early child disposal detaches from the parent and is skipped during later parent teardown.
5. Every fire-and-forget disposal path reports exactly once through `reportDisposeError(...)`.

**Exit**: three teardown paths verified — (a) panel unmount kills subprocess, (b) SIGTERM app kills subprocess, (c) subtree crash/unmount kills subprocess. StrictMode double-mount disposes cleanly. Sub-reconciler root cascades through outer scope. Zero leaks over 7 days.

**Bail criteria**: if any step's tests fail on commit-phase reentrancy, StrictMode double-dispose, or sub-root lifetime, stop and revisit the design before expanding scope.

### Phase 2 — Platform factories (3-5 days)

**Do**: write `Disposable`-returning factories in platform packages. Only what existing app code actually uses — not speculative coverage.

- `@silvery/node`: `spawn`, `watch`, `tempDir`, `listen`
- `@silvery/web` / `@silvery/node`: `connectWebSocket`
- `@silvery/ag-term`: `rawMode`, `altScreen`, `mouseTracking`; `term.signals.on(...)` returns `Disposable`
- `@silvery/core`: `on(emitter, event, fn)`, `disposable(fn)`, `timeout(ms, fn)`, `interval(ms, fn)`, `sleep(scope, ms)`

Each factory is ~5-15 lines: construct, return `{ ... , [Symbol.dispose]() { ... } }`.

**Exit**: every resource shape currently used in silvery + km + silvercode has a `Disposable`-returning factory. No new shapes added speculatively. Platform-package READMEs documented.

### Phase 3 — Migrate existing mechanisms (1-2 weeks)

One bead per mechanism; do them in order:

| Order | Mechanism | Action | Bead |
|---|---|---|---|
| 1 | Sub-reconciler roots (silvercode panels) | Wire root scope cascade | `km-silvery.scope-subroots` |
| 2 | Raw `setTimeout`/`setInterval` in app code | Replace with `scope.adopt(interval(...))` or `sleep(scope, ms)` | `km-silvery.scope-timers` |
| 3 | Raw `new AbortController` | Replace with `scope.signal` | `km-silvery.scope-abort` |
| 4 | Raw `fs.watch` / `child_process.spawn` | Use `@silvery/node` factories | `km-silvery.scope-node-io` |
| 5 | `term.signals.on(SIGINT)` in app code | Wire into root scope; app code no longer touches `term.signals` | `km-silvery.scope-signals` |
| 6 | `useExit` | Replace call sites with `useAppScope()` + root-scope disposal | `km-silvery.scope-useexit` |
| 7 | Store `subscribe`/`off` pairs | `scope.adopt(store.subscribe(fn))` (stores return `Disposable`) | `km-silvery.scope-stores` |

**Exit per bead**: grep shows zero remaining raw usage of that mechanism in `apps/*` + `packages/*` (vendor exempt). Test suite green.

**Exit for phase**: all 7 beads closed. No raw lifecycle code in app layer.

### Phase 4 — Enforcement + systematic doc/example audit (1-2 days)

Lock the pattern in place with one lint gate and one sweep.

1. **ESLint rule `no-raw-lifecycle`** for `apps/*` + `packages/*`, banning raw timers, `new AbortController`, Node resource constructors (`spawn`, `fs.watch`, servers/streams), and naked `.on(...)` subscriptions outside platform packages / `vendor/*`.
2. **Doc/example sweep** across `hub/silvery/design/*`, `vendor/silvery/docs/**`, package READMEs/examples, root + app `CLAUDE.md`, `.claude/skills/*`, app READMEs, migration guide, and test fixtures. Every snippet showing cleanup must use `useScopeEffect(...)`, `scope.adopt(...)`, `scope.defer(...)`, or explicit child-scope disposal.
3. **Audit command**:

```bash
rg -l 'useDispose|term\.signals\.on\(|useExit\(|new AbortController|fs\.watch\(|setTimeout\(|setInterval\(' \
   docs/ hub/ vendor/silvery/docs/ vendor/silvery/README.md \
   apps/*/README.md apps/*/CLAUDE.md .claude/skills/
```

4. **Exit**: lint clean, migration guide published, and banned patterns outside `@silvery/*` + `vendor/*` reduced to zero or explicitly documented as host wiring.

### Phase 5 — Deprecate `useDispose` (1 release cycle, then delete)

**Do**:

1. `useDispose` gets JSDoc `@deprecated` pointing to `useScopeEffect(...)`, `scope.defer(...)`, and `scope.adopt(...)`.
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
3. **Error during dispose of an async child.** `AggregateError` flow needs to preserve stacks and not tear down the parent scope prematurely.
4. **Sub-reconciler root lifetime.** Silvercode's panel sub-roots must cascade through the outer scope; this is the first test of child-scope composition under a real reconciler boundary.

## Prior art

Trio-style structured concurrency ported to React fiber lifetimes. One-liner per precedent:

- **Effect-TS `Scope` / `Layer`** — correct tree semantics; conflates lifetime with DI. We take the tree, skip the DI.
- **Trio nursery / Kotlin `coroutineScope` / Swift `TaskGroup`** — tree + LIFO + propagate-cancel. Borrowed whole.
- **Go `context.Context`** — cancellation propagation only. We add disposal on top.
- **VS Code `Disposable` / `DisposableStore`** — pragmatic TS baseline. `scope.adopt` + `using` avoids its `.add()` footgun.
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
