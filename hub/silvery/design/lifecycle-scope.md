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

## Core API — `@silvery/scope`

Four methods. That is the full surface.

```ts
export interface Scope extends AsyncDisposable {
  readonly signal: AbortSignal
  defer(fn: () => void | Promise<void>): void
  adopt<T extends Disposable | AsyncDisposable>(value: T): T
  child(name?: string): Scope
}

export function createScope(parent?: Scope, name?: string): Scope
export function withScope(): AppPlugin   // default-enabled by createApp()
```

**What was cut**:

- `cancelled` — derivable from `signal.aborted`. One fact, one place.
- `sleep(ms)` — free function: `sleep(scope, ms)`. Belongs in a helpers module, not on Scope.
- `name` as a getter — debug-only. Keep as optional constructor arg for trace messages; not part of the runtime interface.
- No `scope.spawn`, `scope.watch`, `scope.listen`, `scope.tempdir`. Resources are factories in platform packages (`@silvery/node`, `@silvery/web`, etc.) that return `Disposable`.

**Why `defer` survives alongside `adopt`**: `defer(fn)` and `adopt({[Symbol.dispose]: fn})` are equivalent, but 90% of call sites register a callback, not a disposable-bearing object. Keeping both is cheap and removes the need to write `{[Symbol.dispose]: fn}` noise in every cleanup line.

### Disposal algorithm

1. Mark `cancelled = true`
2. Abort `scope.signal`
3. Dispose children first (tree teardown before own cleanups)
4. Run own cleanups in strict LIFO
5. Await async cleanups
6. Continue through all cleanups on error
7. If any cleanup threw, throw `AggregateError` at the end

**No priorities.** If teardown order matters, express it through nesting, registration order, or child scopes. Priorities are hidden global coupling; `term.signals` can keep them for the signal-mediator layer only.

## React API — `@silvery/ag-react`

One hook. That is the full React-facing API.

```ts
export function useScope(): Scope
```

**What was cut**:

- `useScopeEffect(setup, deps)` — deferred. Ship it only if real app code asks for a scope narrower than the component. `useScope()` + a manual `useEffect` with `scope.child()` covers the case at minor call-site cost. Add the hook later if the pattern repeats.
- `<ScopeBoundary scope={}>` — deferred. The use case is "render a subtree with an externally-constructed scope" which is rare. If it shows up, add it; we don't need to ship speculative API.

The ambient scope is the component's own. Sub-lifetimes come from `scope.child()` inside an effect:

```tsx
const scope = useScope()
useEffect(() => {
  const s = scope.child("effect")
  setup(s)
  return () => void s[Symbol.asyncDispose]()
}, [deps])
```

If that pattern appears more than ~3 times, extract `useScopeEffect`. Not before.

### Reconciler integration

- Every fiber gets an optional `scope` slot.
- `useScope()` walks ancestor fibers to find the nearest scope. Fibers that don't call `useScope()` don't pay for one (lazy allocation).
- On fiber deletion, if `fiber.scope` is set, the reconciler synchronously calls `scope[Symbol.asyncDispose]()`. Disposal is unavoidable — there is no path to skip it.
- The app root always has a scope (from `withScope()`, now default-enabled in `createApp()`).

## Resource adoption pattern

Every resource shape collapses into one line.

**Component-lifetime resources** — acquired once, live until unmount:

```tsx
function Panel({ cmd }: { cmd: string }) {
  const scope = useScope()
  const proc = scope.adopt(spawn(cmd))
  const dir  = scope.adopt(tempDir())
  // unmount → scope disposes → proc + dir disposed LIFO
  return <Box>...</Box>
}
```

**Shorter lifetimes** — via `scope.child()` in a standard `useEffect`:

```tsx
function Panel({ url }: { url: string }) {
  const scope = useScope()
  useEffect(() => {
    const s = scope.child("ws")
    s.adopt(new WebSocket(url))
    s.defer(() => flushLogs())
    return () => void s[Symbol.asyncDispose]()
  }, [scope, url])
  return <Box>...</Box>
}
```

**Narrow synchronous lifetime** — TC39 `using` inside a block:

```ts
async function compile(scope: Scope) {
  using tmp = scope.adopt(tempDir())
  // tmp disposed at block exit (success or throw)
}
```

Non-component code takes scope explicitly:

```ts
export function openStore(scope: Scope, path: string): Database {
  const db = new Database(path)
  scope.defer(() => db.close())
  return db
}
```

For APIs that return primitives (`setTimeout` → number, `fs.watch` → FSWatcher), write thin `Disposable` wrappers:

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
const scope = useScope()
scope.defer(() => {
  controller.closeAll()
  printResumeHints()
})
```

Or, better — if `controller` itself becomes `Disposable`:

```tsx
const scope = useScope()
const controller = scope.adopt(createController())
scope.defer(printResumeHints)
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
const scope = useScope()
useEffect(() => {
  const s = scope.child("toasts")
  for (const sess of sessions) {
    s.adopt(sess.session.subscribe((e) => {          // subscribe returns Disposable
      if (e.kind === "permission-request") {
        const id = seq++
        setToasts((t) => [...t, { id, text: `...`, kind: "warn" }])
        s.adopt(timeout(4000, () => setToasts((t) => t.filter((x) => x.id !== id))))
      }
    }))
  }
  return () => void s[Symbol.asyncDispose]()
}, [scope, sessions])
```

`timeout(ms, fn)` is a free-function factory in `@silvery/core` returning `Disposable`. The child scope collects everything — subscriptions and the pending timers — and disposes them as one unit.

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
  let cancel: (() => void) | null = null
  let pending: StickyFolds | null = null

  function doWrite() { /* ... */ }

  scope.defer(() => cancel?.())    // timer dies with the scope

  return {
    schedule(folds: StickyFolds) {
      pending = folds
      cancel?.()
      const d = scope.adopt(timeout(debounceMs, doWrite))
      cancel = () => { d[Symbol.dispose]() }
    },
    flush() { cancel?.(); doWrite() },
  }
}
```

No `dispose()` method on the returned object — the scope owns the lifetime. If the caller wants it narrower, they pass a child scope.

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
    term.signals.on("SIGINT", () => {
      sigintCount++
      const delay = sigintCount === 1 ? 500 : 0
      const forceQuit = timeout(delay, () => process.exit(130))
      forceQuit // fires regardless of scope; not adopted (deliberate: this IS the kill-switch)
      void root[Symbol.asyncDispose]()
    }, { priority: 0, name: "root-scope-dispose" })
    term.signals.on("SIGTERM", () => void root[Symbol.asyncDispose]())
    app.defer(() => root[Symbol.asyncDispose]())
    return { ...app, scope: root }
  }
}
```

App's `bootstrap.ts` becomes empty (or just `import` side-effects). The SIGINT handler is host plumbing, exactly once.

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
const scope = useScope()
function quit() {
  void scope[Symbol.asyncDispose]()  // cascades: all descendants dispose
  // printResumeHints registered via scope.defer earlier, runs LIFO
}
```

Or, if `useExit` is a service call that must stay imperative, keep it — but don't use it for cleanup. Cleanup goes through scope.

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
const scope = useScope()
useEffect(() => {
  const sub = scope.adopt(store.subscribe(onChange))
  return () => sub[Symbol.dispose]()
}, [scope, store])
```

Option B: keep stores returning `() => void` (BC) and use an `on()` helper that wraps:

```ts
// @silvery/core
export function on<E>(emitter: EmitterLike<E>, event: string, fn: (e: E) => void): Disposable {
  emitter.on(event, fn)
  return { [Symbol.dispose]: () => emitter.off(event, fn) }
}
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

```ts
const scope = useScope()
useEffect(() => {
  const s = scope.child("fetch")
  fetch(url, { signal: s.signal }).then(...)
  return () => void s[Symbol.asyncDispose]()
}, [scope, url])
```

The scope's own `signal` replaces the ad-hoc controller. One less object to track.

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
const scope = useScope()
const watcher = scope.adopt(watch(path, onChange))  // watch() from @silvery/node
// no manual close — scope owns it
```

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
const scope = useScope()
const proc = scope.adopt(spawnClaude(args))  // returns Disposable wrapping ChildProcess
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

```ts
const scope = useScope()
const root = scope.adopt(mountSubroot(<PanelUI />, term))
// when outer component unmounts, sub-root unmounts; its own fiber tree disposes cascading scopes
```

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
| Network sockets | `new WebSocket(url)` (browser + node) | platform-native |
| Subscriptions | `on(emitter, event, fn)` helper | `@silvery/core` |
| Intervals / timers | `interval(ms, fn)` / `timeout(ms, fn)` | `@silvery/core` |
| Temp directories | `tempDir()` | `@silvery/node` |
| Server listeners | `listen(port)` | `@silvery/node` |
| Worker threads | `worker(script)` | `@silvery/node` |
| Terminal protocol state | `rawMode(term)` | `@silvery/ag-term` |
| Sub-reconciler roots | `mountSubroot(element)` | `@silvery/ag-react` |

## Cross-platform story

Scope itself knows nothing about SIGINT, terminals, or tab close. It only knows `AbortSignal`.

Host wiring injects the root abort:

- **TUI**: `withScope` plugin wires `term.signals.on(SIGINT)` + `SIGTERM` → `rootController.abort()`
- **Web (future)**: `withScope` plugin wires `window.addEventListener("pagehide")` + `beforeunload` → `rootController.abort()`
- **Canvas (future)**: whatever the embedding lifetime gives

App code is identical across targets. Browsers don't guarantee awaited async cleanup on tab close; that is a host-level honesty, not a reason to pollute the API. The model stays: deterministic when *you* control teardown, best-effort when the host kills the world. Terminals are the same if the process is `SIGKILL`ed.

## Anti-patterns (what to reject in review)

1. **`scope.spawn`, `scope.watch`, `scope.listen` methods.** God-object. Keep Scope tiny; resources are factory functions.
2. **AsyncLocalStorage ambient scope.** Hides ownership. "Which scope did this callback inherit?" becomes unanswerable.
3. **Two cleanup systems.** If scopes exist, raw `useEffect` cleanup, `term.signals.on`, and `useDispose` must all route through scope.
4. **Silent teardown failures.** Collect errors, surface as `AggregateError`. A leaked socket because an earlier cleanup threw is worse than a noisy error.
5. **Scopes outliving owners.** If a resource needs to survive its component, it was owned by the wrong component. Move it to an ancestor / service / app scope.
6. **Priority tags on `Scope`.** Hidden global coupling. Use nesting / registration order / child scopes.
7. **`useEffect` dep-array gating resource lifetime.** Causes the mismatch this design eliminates. Unmount the component or create/dispose a child scope in an effect instead.
8. **Shared subtree scopes by default.** Makes leaf cleanup too late. Default to component-local ownership.
9. **WeakRef / FinalizationRegistry for cleanup.** Non-deterministic; useless for processes, sockets, fds.

## Done when

- `apps/silvercode/src/App.tsx` has no `useDispose` / `useEffect` cleanup / manual `.close()`; the subprocess dies via scope on panel unmount, app exit, and render throw.
- `bun run lint` fails on raw `setTimeout` / `setInterval` / `new AbortController` / `child_process.spawn` / `fs.watch` / `net.createServer` / `http.createServer` outside `@silvery/*` and `vendor/*`.
- STRICT test passes: root unmount leaves no live timers, fds, subscriptions, child processes, or listeners (checked via `process._getActiveHandles().length === 0` post-dispose in a termless harness).
- Grep for `useDispose|term\.signals\.on\(|useExit\(` in non-vendor code returns zero hits.

## Implementation guide

Concrete targets so Phase 0-1 can be claimed without reverse-engineering.

### Scope interface — pruning diff

`vendor/silvery/packages/scope/src/index.ts` currently exports a superset. Phase 0 prunes it to the locked form:

```diff
 export interface Scope extends Disposable {
-  readonly name: string
   readonly signal: AbortSignal
-  readonly cancelled: boolean
   defer(fn: () => void | Promise<void>): void
-  child(name?: string): Scope
+  child(name?: string): Scope              // name kept as ctor arg for trace only
   adopt<T extends Disposable | AsyncDisposable>(value: T): T
-  sleep(ms: number): Promise<void>
-  timeout(ms: number, fn: () => void): () => void
 }
-
-// Becomes:
+
+export interface Scope extends AsyncDisposable {
+  readonly signal: AbortSignal
+  defer(fn: () => void | Promise<void>): void
+  adopt<T extends Disposable | AsyncDisposable>(value: T): T
+  child(name?: string): Scope
+}
```

Runtime changes:

- `name` / `cancelled` stay on the internal struct for debug/trace but drop from the public interface.
- `sleep(ms)` / `timeout(ms, fn)` move to `@silvery/core` as free functions taking `scope` as first arg.
- `[Symbol.dispose]` → `[Symbol.asyncDispose]`; returns a Promise that resolves when all cleanups (incl. async) settle.
- `adopt` is new. Implementation: calls `defer(() => value[Symbol.dispose ?? Symbol.asyncDispose]())`, returns `value` unchanged.

### Disposal algorithm — LIFO semantics

`defer(fn)` and `adopt(value)` push onto **one shared stack** in call order. Disposal pops the stack in reverse — meaning an `adopt()` that came after a `defer()` runs *before* that `defer()`. This matters for code that wants "cleanup A after adopted resource B is gone": call `defer(A)` first, then `adopt(B)`.

Children dispose before their parent's own stack runs. Within a scope: all children (recursively) → own LIFO stack.

### Reconciler integration — where to edit

- **`vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`** — add an optional `scope: Scope | null` field on the fiber-local state the reconciler tracks. On the host-config `removeChild` / fiber-unmount path, if `scope != null`, `await scope[Symbol.asyncDispose]()` before returning.
- **`vendor/silvery/packages/ag-react/src/hooks/useScope.ts`** (new file) — hook that:
  1. Looks for a scope on the current fiber's state. If present, return it.
  2. Walks up the owner chain (React's fiber `.return` pointer, exposed via `react-reconciler` internals or equivalent) to find the nearest ancestor scope.
  3. Lazily allocates a fiber-local scope as a child of the nearest ancestor on first access — so components that never call `useScope()` pay nothing.
- **`vendor/silvery/packages/ag-term/src/runtime/create-app.tsx`** — `createApp()` unconditionally calls `withScope()` (so every app has a root scope). `app` gets a `.scope` field. The existing plugin-chain (`pipe(withX, withY)(...)`) stays as-is; `withScope` just goes first by default.
- **`vendor/silvery/packages/ag-term/src/runtime/devices/signals.ts`** — `withScope`'s root-wiring registers a single `priority: 0, name: "root-scope-dispose"` handler for SIGINT + SIGTERM that calls `rootScope[Symbol.asyncDispose]()`. App code no longer touches `term.signals` directly.

### `withScope` contract

```ts
// @silvery/ag-term
export function withScope(): <A extends AppBase>(app: A) => A & { readonly scope: Scope }
```

Where `AppBase` is the existing plugin-chain app shape (see `create-app.tsx`). `withScope` attaches `scope: rootScope` to the app; every fiber in the reconciler walks up to this root.

### `@silvery/node` — new package

Location: `vendor/silvery/packages/node/`. Deps: `react@19` (peer? no — pure Node), `@silvery/scope` (peer). No bun-specifics; `@silvery/bun` can layer on later for `bun:sqlite` etc. Exports: `spawn`, `watch`, `tempDir`, `interval`, `timeout`, `listen`. Each file is ~15-30 lines; whole package target is <300 LOC.

Phase 2 creates this package. Phase 1 doesn't need it — inline the one `spawnClaude` wrapper in silvercode and port after Phase 2.

### Testing strategy

- **Unit tests** (`vendor/silvery/packages/scope/tests/` — new directory): `createScope`, `defer`/`adopt` ordering, `child` cascade, `AggregateError` on multi-throw, sync vs async dispose paths.
- **Reconciler integration** (`vendor/silvery/packages/ag-react/tests/scope.test.tsx` — new): mount → unmount; `useScope()` ancestor walk; fiber disposal ordering; StrictMode double-invoke (use `<StrictMode>` wrapper in the test renderer).
- **End-to-end leak check** (termless — see `apps/km-tui/tests/CLAUDE.md` for termless harness): mount silvercode with a subprocess, unmount, assert `process._getActiveHandles().length === 0` and `process._getActiveRequests().length === 0`. Run under `SILVERY_STRICT=1`.
- **Template to copy**: `apps/km-tui/tests/showcase.spec.ts` (canonical TUI test pattern per root CLAUDE.md).

### StrictMode contract

Dev-mode double-invoke must dispose-then-reacquire. Contract: the second mount sees a **fresh scope** (new signal, empty disposer stack), never a cancelled one. The first mount's scope is disposed synchronously before the second mount's `useScope()` returns. Test explicitly.

### FAQ / edge cases

- **Resource shared across sibling components?** Lift to the nearest common ancestor — acquire in its `useScope()` and pass down. Siblings don't share scope.
- **Resource outlives re-render but dies on unmount?** `useScope()` directly at component level is correct. Don't nest in `useEffect(() => scope.child(...))` — that rebuilds on every deps change.
- **Error boundary caught an error?** The boundary's `componentDidCatch` disposes its subtree scope before rendering the fallback. Error-recovery UI runs under the boundary's own scope, not the crashed subtree's.
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
2. Move `sleep` / `timeout` to `@silvery/core` as free functions.
3. Switch to `[Symbol.asyncDispose]`.
4. Add `adopt()`.
5. Write the scope unit-test suite in `vendor/silvery/packages/scope/tests/`.

**Exit**: `@silvery/scope` matches the locked interface; unit tests green; `bun run test:vendor -- scope` passes.

### Phase 1 — Prototype de-risk (1 week)

Build order (each step passes tests before the next starts):

1. **`useScope()` hook** — new file `vendor/silvery/packages/ag-react/src/hooks/useScope.ts`. Lazy fiber-local allocation, ancestor walk. Test: two nested components, outer calls `useScope()`, inner walks up and finds it.
2. **Fiber disposal wiring** — edit `vendor/silvery/packages/ag-react/src/reconciler/host-config.ts`. On fiber unmount, `await scope?.[Symbol.asyncDispose]()`. Test: mount/unmount disposes the scope; StrictMode double-invoke disposes both cleanly.
3. **`withScope()` plugin** — `vendor/silvery/packages/ag-term/src/runtime/` (wire into `create-app.tsx` as default plugin). Roots SIGINT/SIGTERM through a single priority-0 signal handler (see *withScope contract*). Test: kill signal disposes root scope.
4. **Migrate silvercode Claude subprocess** — edit `apps/silvercode/src/App.tsx` to use `scope.adopt(spawnClaude(cwd))`. Inline the `spawnClaude` Disposable wrapper in silvercode for now (the real `@silvery/node` comes in Phase 2).
5. **Dogfood for a week** — run silvercode daily. Watch `ps | grep claude`, `lsof` for fd count, log file growth.

**Exit**: three teardown paths verified — (a) panel unmount kills subprocess, (b) SIGTERM app kills subprocess, (c) throw during render kills subprocess. StrictMode double-mount disposes cleanly. Sub-reconciler root cascades through outer scope. Zero leaks over 7 days.

**Bail criteria**: if any step's tests fail on commit-phase reentrancy, StrictMode double-dispose, or sub-root lifetime, stop and revisit the design before expanding scope.

### Phase 2 — Platform factories (3-5 days)

**Do**: Write `Disposable`-returning factories in platform packages. Only what existing app code actually uses — not speculative coverage.

- `@silvery/node`: `spawn`, `watch`, `tempDir`, `interval`, `listen`
- `@silvery/ag-term`: `rawMode`, `altScreen`, `mouseTracking` (migrate existing `term.modes.*` to return `Disposable`)
- `@silvery/core`: `on(emitter, event, fn)` subscription helper, `sleep(scope, ms)`

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
| 6 | `useExit` | Replace with `scope.defer(exit)` or root-scope disposal | `km-silvery.scope-useexit` |
| 7 | Store `subscribe`/`off` pairs | `scope.adopt(store.subscribe(fn))` (stores return `Disposable`) | `km-silvery.scope-stores` |

**Exit per bead**: grep shows zero remaining raw usage of that mechanism in `apps/*` + `packages/*` (vendor exempt). Test suite green.

**Exit for phase**: all 7 beads closed. No raw lifecycle code in app layer.

### Phase 4 — Enforcement + systematic doc/example audit (2-3 days)

Every doc, example, README, CLAUDE.md, skill, and tutorial must reflect the new pattern. Mixed guidance creates mixed code. This phase is a systematic sweep.

**Part A — ESLint gate**:

1. ESLint rule `no-raw-lifecycle` added, banning in `apps/*` + `packages/*`:
   - `setTimeout`, `setInterval`
   - `new AbortController`
   - `child_process.spawn/fork/exec`
   - `fs.watch`, `fs.createReadStream`, `fs.createWriteStream`
   - `net.createServer`, `http.createServer`
   - `EventEmitter.on` without a `scope.adopt(on(...))` wrapper
2. Exempt `@silvery/*` platform packages and `vendor/*` (they implement the wrappers).
3. CI gate — new violations fail the build.

**Part B — systematic doc/example audit**: sweep these surfaces and update every snippet. Each is its own tracked checklist item; do not close Phase 4 until all are green.

1. **Design docs** (`hub/silvery/design/*.md`) — any doc showing the old cleanup patterns; replace with scope-based examples. The design doc itself stays as canonical reference.
2. **Silvery package docs** (`vendor/silvery/docs/**`) — `the-silvery-way.md`, `styling.md`, hook docs, guide pages. Every cleanup example rewritten.
3. **Silvery READMEs** (`vendor/silvery/packages/*/README.md`) — every package-level README with resource/cleanup examples.
4. **Silvery examples** (`vendor/silvery/examples/**` if present) — ship-quality demo code must use the new pattern.
5. **Root CLAUDE.md** — every mention of `useDispose`, `term.signals.on`, cleanup patterns.
6. **km CLAUDE.md** (`/Users/beorn/Code/pim/km/CLAUDE.md`) — gotchas section, skill references.
7. **km-tui CLAUDE.md** (`apps/km-tui/CLAUDE.md`) — anti-patterns section.
8. **km skills** (`.claude/skills/tui/*`, `.claude/skills/silvery/*`, `.claude/skills/logging/*`) — component audit gates, silvery resolver, pipeline docs.
9. **km docs** (`docs/principles.md`, `docs/architecture.md`, `docs/lessons/*.md`) — input-architecture, performance, any resource-lifecycle guidance.
10. **App READMEs** (`apps/*/README.md`, `apps/*/CLAUDE.md`) — silvercode, km-tui, km-cli, km-repl.
11. **Related design docs** (`hub/silvery/design/v15-tea`, `reactive-pipeline.md`) — places that touch state-machine lifecycle.
12. **Migration guide** (new doc at `hub/silvery/design/migration-lifecycle-scope.md`) — single-page cheat sheet of the 10 before/after migrations from this doc, linkable from CLAUDE.md + release notes.
13. **Inline code comments** — grep `useDispose|term.signals.on|useExit` in app code for obsolete comments explaining the old pattern; update or delete.
14. **Test fixtures / helpers** — `apps/km-tui/tests/**`, `vendor/silvery/tests/**` for test-level resource setup showing the old idiom.

**Per-surface checklist command**:

```bash
# list suspected stale surfaces
rg -l 'useDispose|term\.signals\.on\(|useExit\(|new AbortController|fs\.watch\(' \
   docs/ hub/ vendor/silvery/docs/ vendor/silvery/README.md \
   apps/*/README.md apps/*/CLAUDE.md .claude/skills/
```

**Exit**: every file in the audit list has been read and either updated or explicitly marked out-of-scope with reason. `bun run lint` clean. Migration guide published. Grep for banned patterns outside `@silvery/*` + `vendor/*` returns zero hits.

### Phase 5 — Deprecate `useDispose` (1 release cycle, then delete)

**Do**:

1. `useDispose` gets JSDoc `@deprecated` pointing to `scope.defer` / `scope.adopt`.
2. Body stays as shim that forwards to `useScope().defer()` (+ the existing SIGINT/SIGTERM wiring, which is now redundant once root scope wires those).
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

1. **Fiber deletion timing.** React's reconciler deletes fibers during commit. Synchronous `[Symbol.dispose]` during commit is fine; `[Symbol.asyncDispose]` is awaited on the microtask. Need to confirm no commit-phase reentrancy surprises.
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
