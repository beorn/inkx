# Era 2 Wiring Guide

_Status: draft (2026-03-19). How packages connect for each use case._

Everything is a plugin — capabilities are opt-in.

## Principles

1. **Composability** — pipe + plugins. Infrastructure, domains, and rendering compose freely.
2. **Type inference** — infer from factories and schemas. Minimize explicit annotations.
3. **Objects over strings** — TypeScript references primary. Strings only for serialization.
4. **Ergonomics** — obvious APIs. One way to do things.
5. **No `this`** — closure access and parameters only.

## How It Works

```
  dispatch(op) ──────────────────────────────────────────────────────┐
                                                                     │
  ┌── dispatch chain (infrastructure) ─────────────────────────────┐ │
  │  withScope: installs lazy op.scope getter                      │◄┘
  │    → create: reentry guard                                     │
  │      → calls apply(op) ───────────────────────────────────┐    │
  │                                                            │    │
  │  ┌── apply chain (app + rendering plugins) ──────────────┐ │    │
  │  │  withReact: calls inner, fans out unhandled to useInput│◄┘    │
  │  │  withTea/keymap: input:key → resolves binding → cmd op │      │
  │  │  withTea/commands: command → resolves from tree → fn() │      │
  │  └────────────────────────────────────────────────────────┘      │
  └──────────────────────────────────────────────────────────────────┘
                                  │
                        signal mutation → React re-render → flush → stdout
```

Three wrapping tiers: `dispatch` (infrastructure), `apply` (app logic), `run` (lifecycle).

## Terminology

- **Ag**: rendering (Ag = silver). Node tree, adapters, renderers, 30+ components.
- **Tea**: app architecture (bundled as `silvertea`). Models, commands, keymaps.
- **Impure**: native framework bridges — tea without ag rendering.
- **Operation** (op): anything dispatched. Serializable payload.
- **Plugin**: `(app) => app`. Wraps methods or adds capabilities.

## Three Levels

| Level | What you add | State | Input handling |
|---|---|---|---|
| **Foundation** | `create()` | none | ops pass through |
| **+ Ag** | `withAg()`, `withTerm()`, `withReact()` | React useState | `useInput()` in components |
| **+ Tea** | `withTea()`, domain plugins | Signals/models | Keymap → commands → signals |
| **+ Interception** | `withLogging()`, proxies | Same, observable | All mutations through dispatch |

---

## Part 0: Foundation (@silvery/create)

Zero dependencies. The dispatch/apply pipeline — nothing more.

```typescript
function create() {
  let processing = false
  const app = {
    dispatch(op) {
      if (processing) throw new Error(`Reentrant dispatch(): ${op.type}`)
      processing = true
      try { return app.apply(op) }      // closure, not this
      finally { processing = false }
    },
    apply(op) { return false },
    run: undefined as (() => Promise<void>) | undefined,
  }
  return app
}
```

- **`dispatch(op)`** — entry point. Reentry guard. Infrastructure plugins wrap this.
- **`apply(op)`** — plugin chain. App plugins wrap via `const { apply } = app; app.apply = ...`.
- **`run`** — undefined. Renderer provides it. Adapter wraps it.

**Follow-up dispatch**: `queueMicrotask(() => app.dispatch(...))` for keymap → command and command → command chaining.

### withScope (opt-in)

```typescript
function withScope(rootScope?: Scope) {
  return (app) => {
    const scope = rootScope ?? createScope("app")
    app.scope = scope
    const prevDispatch = app.dispatch
    app.dispatch = (op) => {
      if (!op.scope) {
        let _scope: Scope | undefined
        Object.defineProperty(op, "scope", {
          get: () => (_scope ??= scope.child(
            op.type === "command" ? `op:command:${op.path?.join(".")}` : `op:${op.type}`
          )),
          enumerable: false, configurable: true,
        })
      }
      return prevDispatch(op)
    }
    app.quit = () => scope.cancel()
    return app
  }
}
```

### Op Types

```typescript
type Op = { type: string; [key: string]: unknown }

interface OpTypes {
  resize: { cols: number; rows: number }
}
declare module "@silvery/create" {
  interface OpTypes {
    "input:key": { key: string; shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
    "input:mouse": { kind: "click" | "doubleClick" | "rightClick"; x: number; y: number; button?: string; modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean } }
    command: { path: string[]; args?: Record<string, unknown> }
    prompt: { command: string[]; missing: string[] }
    error: { source: string[]; error: string }
  }
}

type Operation = { [K in keyof OpTypes]: Op & { type: K } & OpTypes[K] }[keyof OpTypes]
```

**Serialization**: `op.scope` and `op.pending` are non-enumerable (runtime handles). `op.result` is enumerable (serializable data). `JSON.stringify(op)` captures type, path, args, and resolved result.

---

## Part 1: Ag (@silvery/ag)

Node tree, adapters, renderers — plugins on top of `create()`.

```typescript
function withAg() {
  return (app) => { app.root = createRootNode(); return app }
}
```

### Adapter

```typescript
function withReact({ view }: { view: ReactElement }) {
  return (app) => {
    const inputHandlers = new Set<(op: Op) => boolean>()
    const prevApply = app.apply
    app.apply = (op) => {
      if (prevApply(op)) return true
      if (op.type.startsWith("input:")) {
        for (const h of inputHandlers) if (h(op)) return true
      }
      return false
    }
    const prevRun = app.run
    app.run = async () => {
      await using reconciler = createReconciler(app.root, () => app.flush?.())
      reconciler.render(view)
      await prevRun?.()
    }
    return app
  }
}
```

### Renderer

```typescript
function withTerm(options?: TermOptions) {
  return (app) => {
    app.run = async () => {
      await using terminal = createTerminal(options)
      app.flush = () => runPipeline(app.root, terminal)
      app.flush()
      for await (const key of terminal.keys(app.scope?.signal)) {
        app.dispatch({ type: "input:key", ...key })
      }
    }
    return app
  }
}
```

---

## Part 2: Tea (silvertea)

`withTea()` creates the registries (models, commands, keymap). Domain plugins populate them. Everything co-located in the domain plugin — models, commands, keybindings. No circular dependencies, no `this`, full type safety via closure access.

### withTea — app infrastructure (single plugin)

```typescript
function withTea() {
  return (app) => {
    // Capability marker — prevents double-install
    if (app._tea) throw new Error("withTea() already installed")
    app._tea = true

    app.models = {}
    app.commands = {}

    // Per-app command ref → path mapping (not module-global)
    const commandMeta = new WeakMap<object, { path: string[] }>()

    // --- Command execution (wraps apply) ---
    const prevApply = app.apply
    app.apply = (op) => {
      if (op.type === "command") {
        const cmd = resolveCommand(app.commands, op.path)
        if (!cmd?.fn) return prevApply(op)

        // Always produce a promise — uniform completion model
        const pending = Promise.resolve().then(() => {
          const resolution = resolveInvocation(app, cmd, op.args)
          op.args = resolution.args ?? op.args  // write back resolved args for replay
          op.status = resolution.state
          if (resolution.state !== "ready") {
            if (resolution.state === "prompt") {
              queueMicrotask(() => app.dispatch({ type: "prompt", command: op.path, missing: resolution.missing }))
            }
            throw new CommandError(resolution.state, op.path)
          }
          return op.scope
            ? op.scope.run(() => cmd.fn(resolution.args))
            : cmd.fn(resolution.args)
        }).then((value) => {
          op.result = value
          op.status = "ok"
          return value
        }).catch((err) => {
          op.result = undefined
          op.status = "error"
          Object.defineProperty(op, "error", { value: err, enumerable: false })
          queueMicrotask(() => app.dispatch({ type: "error", source: op.path, error: String(err) }))
          throw err
        }).finally(() => {
          // Auto-dispose scope if we created it (not caller-provided)
          if (op.scope && !op._callerScope) op.scope.dispose?.()
        })
        Object.defineProperty(op, "pending", { value: pending, enumerable: false })
        return true
      }
      return prevApply(op)
    }

    // --- Keymap (wraps apply after commands) ---
    // Per-binding entries: each has key, command ref, optional when condition
    type RegisteredBinding = {
      key: string
      command: CommandRef
      args?: unknown
      when?: Readable<boolean>
      prompt?: string
    }
    const bindings: RegisteredBinding[] = []

    const prevApply2 = app.apply
    app.apply = (op) => {
      if (op.type === "input:key") {
        // Check bindings in reverse order (last registered = highest priority)
        // Note: multi-key sequences (e.g. "dd") require a chord engine with
        // trie lookup, timeout, and ambiguity handling — see era2/04-input.
        // The simplified lookup here handles single keys; the real implementation
        // will use compileKeymap() which builds the trie from registered bindings.
        for (let i = bindings.length - 1; i >= 0; i--) {
          const b = bindings[i]
          if (b.key !== op.key) continue
          if (b.when && !b.when.value) continue  // condition inactive
          const meta = commandMeta.get(b.command)
          if (!meta) continue
          const resolution = resolveInvocation(app, b.command, b.args)
          if (resolution.state === "ready") {
            queueMicrotask(() => app.dispatch({ type: "command", path: meta.path, args: resolution.args }))
          } else if (resolution.state === "prompt") {
            queueMicrotask(() => app.dispatch({ type: "prompt", command: meta.path, missing: resolution.missing }))
          }
          // "unavailable" / "invalid" → key does nothing (swallowed)
          return true
        }
      }
      return prevApply2(op)
    }

    // --- Registration APIs ---

    // Register keybindings — handles both plain and when()-wrapped descriptors
    app.keymap = (rawBindings) => {
      for (const [key, value] of Object.entries(rawBindings)) {
        if (value && typeof value === "object" && "when" in value) {
          // ConditionalBinding from when()
          const { when: condition, binding } = value
          const cmd = typeof binding === "object" && "command" in binding ? binding.command : binding
          const prompt = typeof binding === "object" && "prompt" in binding ? binding.prompt : undefined
          bindings.push({ key, command: cmd, when: condition, prompt })
        } else if (value && typeof value === "object" && "command" in value) {
          // { command, args?, prompt? }
          bindings.push({ key, command: value.command, args: value.args, prompt: value.prompt })
        } else {
          // Direct command ref
          bindings.push({ key, command: value })
        }
      }
    }

    // Register command metadata — per-app, instant ref → path lookup
    app.registerCommand = (path: string[], cmd: object) => {
      const existing = commandMeta.get(cmd)
      if (existing) {
        if (existing.path.join(".") !== path.join(".")) throw new Error(`Command registered at "${existing.path.join(".")}", cannot re-register at "${path.join(".")}"`)
        return  // same path — no-op
      }
      commandMeta.set(cmd, { path })
    }

    // Typed command helper — always async, always rejects on failure
    app.command = (refOrPath, args) => {
      const path = typeof refOrPath === "string"
        ? refOrPath.split(".")
        : commandMeta.get(refOrPath)?.path ?? findPathInTree(app.commands, refOrPath)
      const op: Op = { type: "command", path, args }
      app.dispatch(op)
      return op.pending  // always exists — set by command apply wrapper
    }

    return app
  }
}
```

### when() — descriptor-based

`when()` returns per-binding descriptors carrying the live signal. Object spread produces descriptors, not eagerly computed values:

```typescript
type Binding = CommandRef | { command: CommandRef; args?: unknown; prompt?: string }
type ConditionalBinding = { when: Readable<boolean>; binding: Binding }

function when<B extends Record<string, Binding>>(
  condition: Readable<boolean>,
  bindings: B,
): Record<keyof B, ConditionalBinding> {
  const result = {} as any
  for (const [key, binding] of Object.entries(bindings)) {
    result[key] = { when: condition, binding }
  }
  return result
}
```

`app.keymap()` inspects each value — if it has a `when` property, the binding is conditional. The signal's `.value` is checked at input time (lazy evaluation, not reactive subscription).

### resolveInvocation — surface behavior

| Surface | ready | prompt | unavailable | invalid |
|---|---|---|---|---|
| **keymap** | dispatch command op | dispatch prompt op | swallow (key does nothing) | swallow |
| **app.command()** | resolve with result | reject `PromptRequired` | reject `Unavailable` | reject `ValidationError` |
| **raw dispatch** | execute | set `op.status` | set `op.status` | set `op.status` + error op |
| **CLI/MCP** | execute | report missing args | report unavailable | report validation error |

### Models

```typescript
const todoModel = createModel(() => {
  const cursor = signal(0)
  const items = signal<string[]>([])
  return {
    cursor, items,
    current: derived(() => items.value[cursor.value] ?? null),
    add(text: string) { items.value = [...items.value, text] },
    remove() {
      items.value = items.value.filter((_, i) => i !== cursor.value)
      cursor.value = Math.min(cursor.value, Math.max(0, items.value.length - 1))
    },
    moveDown() { cursor.value = Math.min(cursor.value + 1, Math.max(0, items.value.length - 1)) },
    moveUp()   { cursor.value = Math.max(cursor.value - 1, 0) },
  }
})

const editorModel = createModel(() => {
  const mode = signal<"normal" | "edit">("normal")
  return { mode, isEditing: derived(() => mode.value === "edit") }
})
```

`createModel(factory)` returns a definition. `.create()` makes an isolated instance. `useModel(todoModel, m => m.cursor)` in React reads via selector with signal auto-unwrap.

### Domain Plugins

Each domain plugin is self-contained. **`app.keymap?.()` is conditional** — headless apps skip keybindings. Domain plugins that reference other domains' commands must come after them in the pipe.

```typescript
function withTodo() {
  return (app) => {
    const todo = todoModel.create()
    app.models.todo = todo

    app.commands.todo = {
      add:       { title: "Add Item", args: { text: string() }, fn(args) { todo.add(args.text) } },
      remove:    { title: "Remove Item", args: { item: string({ default: () => todo.current.value }) }, fn() { todo.remove() } },
      move_down: { title: "Move Down", fn() { todo.moveDown() } },
      move_up:   { title: "Move Up",   fn() { todo.moveUp() } },
    }

    // Register command metadata for ref → path lookup
    for (const [name, cmd] of Object.entries(app.commands.todo)) {
      app.registerCommand?.(["todo", name], cmd)
    }

    app.keymap?.({
      j: app.commands.todo.move_down,
      k: app.commands.todo.move_up,
      dd: app.commands.todo.remove,
    })

    return app
  }
}

function withEditor() {
  return (app) => {
    const editor = editorModel.create()
    app.models.editor = editor

    app.commands.editor = {
      enter_edit: { title: "Edit", fn() { editor.mode.value = "edit" } },
      exit_edit:  { title: "Done", fn() { editor.mode.value = "normal" } },
    }
    for (const [name, cmd] of Object.entries(app.commands.editor)) {
      app.registerCommand?.(["editor", name], cmd)
    }

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

### Invocation Resolution

Shared by all surfaces — keymap, mouseMap, app.command(), CLI, MCP:

```typescript
function resolveInvocation(app, cmd, partialArgs?):
  | { state: "ready"; args: Record<string, unknown> }
  | { state: "prompt"; missing: string[] }
  | { state: "unavailable" }
  | { state: "invalid"; error: Error }
```

Centralizes arg defaults, signal-based availability, and validation.

### Input Precedence

All declarative via `when()` and keymap layer ordering:

1. Last-registered layers checked first (domain plugins register after withTea)
2. `when()` conditions evaluated reactively — bindings activate/deactivate as signals change
3. Unmatched input falls through to `useInput()` hooks

No imperative push/pop. Focus is a signal condition — `when(focusModel.hasFocus, { ... })`.

### Full Pipe

```typescript
const app = pipe(
  create(),
  withScope(),
  withAg(),
  withTea(),                    // models + commands + keymap registries
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

### Multiple Entry Points

```typescript
// All go through dispatch — observable, interceptable, scoped:
commandProxy(app).todo.add({ text: "Buy milk" })            // proxy → dispatch
await app.command(app.commands.todo.add, { text: "x" })     // object ref → dispatch
await app.command("todo.add", { text: "x" })                // string path (serialization)

// ⚠ Escape hatch — bypasses dispatch, scopes, logging, validation, replay:
app.commands.todo.move_down.fn()                             // direct — tests only
```

### Scopes and Op Lifecycle

```typescript
const op: Op = { type: "command", path: ["file", "save"] }
app.dispatch(op)

op.status              // "ok" | "prompt" | "unavailable" | "invalid" | "error"
op.args                // resolved/defaulted args (written back for replay)
op.result              // enumerable — resolved value (serializable)
op.scope               // non-enumerable — lazy, created on first access
op.pending             // non-enumerable — always present for command ops
op.error               // non-enumerable — error object (if status === "error")

await op.pending       // resolves to result, rejects on error
JSON.stringify(op)     // { type: "command", path: [...], args: {...}, status: "ok", result: {...} }
                       // scope, pending, error NOT included (non-enumerable)
```

**Scope disposal**: auto-created op scopes are disposed after command completion (sync or `pending.finally()`). Caller-provided scopes (`op.scope = batch`) are NOT disposed by the framework — the caller owns their lifetime.

```typescript
// Caller-provided scope for batching:
const batch = app.scope.child("batch")
app.dispatch({ type: "command", path: [...], scope: batch, _callerScope: true })
app.dispatch({ type: "command", path: [...], scope: batch, _callerScope: true })
// caller disposes: batch.dispose()
```

---

## Part 3: More Cases

### Case 1: Ag only (no tea)

```typescript
pipe(create(), withScope(), withAg(), withTerm(), withReact({ view: <Counter /> }))
```

### Case 2: Impure + React DOM (future)

```typescript
import { withReactDOM } from "@silvery/impure/react-dom"
pipe(create(), withScope(), withTea(), withTodo(), withReactDOM({ view: <App />, root: "#app" }))
```

No ag. Tea on native React DOM. No ag-ui components.

### Case 3: Headless

```typescript
const todo = todoModel.create()
todo.add("test"); todo.add("another"); todo.moveDown()
expect(todo.cursor.value).toBe(1)

const app = pipe(create(), withTea(), withTodo())   // no keymap, no rendering
await app.command(app.commands.todo.add, { text: "test" })
```

`withTodo()` calls `app.keymap?.()` — conditional, so headless works without withKeymap registering.

---

## Part 4: Type Safety

```
Models     → signal types, selector returns, method signatures, snapshot shape
Commands   → fn args inferred from args schema, paths from tree structure
Keymaps    → bindings validated against command refs (objects, not strings)
Plugins    → refine app type per capability
```

### Plugin return types

```typescript
function withScope():     <A>(app: A) => A & { scope: Scope; quit(): void }
function withAg():        <A>(app: A) => A & { root: Node }
function withTea():       <A>(app: A) => A & SilveryApp
function withTerm():      <A extends { root: Node }>(app: A) => A & { run(): Promise<void> }
function withReact(o: O): <A extends { root: Node; run(): Promise<void> }>(app: A) => A
```

### Preset

```typescript
function createApp(options: {
  view: ReactElement
  domains: Plugin[]
  term?: TermOptions
}) {
  return pipe(
    create(), withScope(), withAg(), withTea(),
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

## Part 5: Observability

```typescript
function withLogging() {
  return (app) => {
    const logger = createLogger("silvery")

    const prevApply = app.apply
    app.apply = (op) => {
      const span = logger.span(`op:${op.type}`, { path: op.path, args: op.args })
      const handled = prevApply(op)
      if (op.pending) {
        // Async command — close span on settlement
        op.pending.finally(() => span.end({ status: op.status, result: op.result }))
      } else {
        // Sync — close immediately
        span.end({ handled, result: op.result })
      }
      return handled
    }

    const prevRun = app.run
    app.run = async () => {
      await using span = logger.span("app:run")
      await prevRun?.()
      span.set({ status: "exited" })
    }

    return app
  }
}
```

**Replay/undo**: command invocations (path + args) form a serializable log. For undo, lower-level operation log (model patches) may be needed — see era2/05-app.

---

## Design Decisions

**alien-signals is the reactive engine.** `@silvery/signal` re-exports alien-signals core (`signal`, `computed`, `effect`, `batch`) and adds `createStore()` (deep proxy), `createResource()` (async bridge), and `/react` bindings (`useSignal`). Decision 26-28 in [decisions.md](./decisions.md). See [signals-landscape-2026.md](./signals-landscape-2026.md) for the full research and rationale.

**Everything is a plugin.** `create()` is zero-dep. Scope, ag, tea, rendering — all opt-in.

**`withTea()` — single app infrastructure plugin.** Creates models + commands + keymap registries. Domain plugins populate them.

**Domain plugins co-locate everything.** Models + commands + keybindings in one plugin. Closure access. No `this`. `app.keymap?.()` for headless compatibility.

**dispatch() + apply() + run().** Three wrapping tiers. Closure-based — no `this`.

**Command ref identity via per-app WeakMap.** `registerCommand()` maps object refs to paths. Instant lookup. Throws on conflicting re-registration. App-local — not module-global.

**`when()` is descriptor-based.** Returns per-binding descriptors with live signal. `app.keymap()` consumes them — each binding carries optional `when` condition. Lazy evaluation at input time.

**`resolveInvocation()` — shared resolver.** All surfaces use it. Normative behavior table per surface (keymap, app.command, raw dispatch, CLI/MCP).

**Command ops always produce `op.pending`.** Uniform completion model — both sync and async commands produce a promise. `app.command()` returns it. Rejects on any failure (parse, unavailable, throw, async rejection). Error ops also emitted.

**Op lifecycle.** `op.status` (ok/prompt/unavailable/invalid/error), `op.args` (resolved — written back for replay), `op.result` (enumerable), `op.error` (non-enumerable). Serializable fields: type, path, args, status, result.

**Scope disposal.** Auto-created op scopes disposed after command completion. Caller-provided scopes not disposed by framework.

**Capability protection.** `withTea()` throws on double-install. Domain plugins use `app.keymap?.()` and `app.registerCommand?.()` — conditional on tea being present.

**Objects over strings.** `app.commands.todo.move_down` primary. Strings for serialization only.

**`createApp()` preset.** Hides pipe for common case. Raw `pipe()` for advanced composition.

---

## Dependency Graph

```
Foundation:
  @silvery/create                         (zero deps — create, dispatch, apply)
  @silvery/scope                          (zero deps — withScope, createScope, currentScope)
  @silvery/signal                         (alien-signals + alien-deepsignals)
    ├── core: signal, computed, effect, batch  (re-export alien-signals, ~1.8KB)
    ├── createStore()                     deep reactive proxy (alien-deepsignals, ~2.7KB)
    ├── createResource()                  async signal bridge (scope-integrated)
    └── /react                            useSignal(), model selectors (peer: react)

Tea (app architecture — bundled as silvertea):
  @silvery/model                          (signal)
    └── /react                            (signal/react, peer: react)
  @silvery/commands                       (create, signal, scope)
    └── /react                            (signal/react, peer: react)

Ag (rendering):
  @silvery/ag                             (create — withAg, node tree, state machines)
  @silvery/ag-react                       (ag, peer: react — adapter/reconciler)
  @silvery/ag-svelte                      (ag, peer: svelte — future)
  @silvery/ag-term                        (ag, scope, flexily — renderer)
  @silvery/ag-web                         (ag — renderer, future)
  @silvery/ag-ui                          (ag, ag-react, model, commands, ag-theme — 30+ React components)
  @silvery/ag-theme                       (no deps — tokens, palettes)

Impure (native framework bridges — no ag):
  @silvery/impure
    ├── /react-dom                        (create, scope, commands, peer: react, react-dom)
    └── /svelte                           (create, scope, commands, peer: svelte — future)

Bundles:
  silvertea                               create + scope + signal + model + commands
  silvery                                 silvertea + ag + ag-react + ag-term + ag-ui + ag-theme
```

---

## Cross-Reference to Era 2 Docs

| Doc | Covered here | Full details in original |
|-----|-------------|--------------------------|
| 02-signals | `signal()`, `createModel()` | 8-sip API, framework bindings, provider DI |
| 03-commands | Command tree, args, availability, surfaces | Surface projection, domain objects, CLI rules |
| 04-input | `keymap()`, `when()`, precedence | Mapping type, invoke(), chord/count state |
| 05-app | `dispatch()`/`apply()`, domain plugins, commandProxy | Two-box model/runtime, provider architecture |
| 06-scopes | `op.scope`, ALS, `AbortSignal`, lifetime | Scope API (sleep, timeout, onDispose), effects |
| composability | Adapter/renderer roles | Framework×platform matrix, gap analysis |
| packaging | `create` + `ag-*` + tea split + `impure` | Migration paths, bundle strategies |
| decisions | Referenced where relevant | Full decision log (25 decisions) |
