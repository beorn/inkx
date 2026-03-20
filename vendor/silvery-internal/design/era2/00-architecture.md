# Era 2 Architecture

_Status: draft (2026-03-19). The central reference for Silvery Era 2. Deep-dives in sibling docs._

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

## Graphs

A silvery app is composed of five interconnected structures:

| Graph                   | What it is                                                          | Shape | API                                          |
| ----------------------- | ------------------------------------------------------------------- | ----- | -------------------------------------------- |
| **Reactive data graph** | Signals connected by computeds. How data flows.                     | DAG   | `signal()`, `computed()`, `createModel()`    |
| **Async scope tree**    | Spawned async work and its ownership. Cancellation down, errors up. | Tree  | `createScope()`, `scope.child()`, `op.scope` |
| **Ag node tree**        | Abstract UI structure. Adapter writes, renderer reads.              | Tree  | `createRootNode()`, `withAg()`               |
| **Command tree**        | Action namespace. Discoverable, projectable to CLI/MCP/palette.     | Tree  | `app.commands.todo.add`                      |
| **Plugin chain**        | dispatch/apply/run wrapping layers.                                 | Stack | `create()`, `pipe()`, `with*()`              |

These are views of one runtime. A keypress traverses the plugin chain, resolves a command (command tree), executes it in a scope (async scope tree), mutates signals (reactive data graph), which triggers a re-render of the UI (ag node tree).

## Terminology

- **Ag**: rendering (Ag = silver). Node tree, adapters, renderers, 30+ components.
- **Tea**: app architecture (bundled as `silvertea`). Models, commands, keymaps.
- **Impure**: native framework bridges — tea without ag rendering.
- **Operation** (op): anything dispatched. Serializable payload.
- **Plugin**: `(app) => app`. Wraps methods or adds capabilities.

## Three Levels

| Level              | What you add                            | State            | Input handling                 |
| ------------------ | --------------------------------------- | ---------------- | ------------------------------ |
| **Foundation**     | `create()`                              | none             | ops pass through               |
| **+ Ag**           | `withAg()`, `withTerm()`, `withReact()` | React useState   | `useInput()` in components     |
| **+ Tea**          | `withTea()`, domain plugins             | Signals/models   | Keymap → commands → signals    |
| **+ Interception** | `withLogging()`, proxies                | Same, observable | All mutations through dispatch |

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
      try {
        return app.apply(op)
      } finally {
        // closure, not this
        processing = false
      }
    },
    apply(op) {
      return false
    },
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
          get: () =>
            (_scope ??= scope.child(op.type === "command" ? `op:command:${op.path?.join(".")}` : `op:${op.type}`)),
          enumerable: false,
          configurable: true,
        })
      }
      return prevDispatch(op)
    }
    app.quit = () => scope.cancel()

    // Wrap run to dispose root scope on exit
    const prevRun = app.run
    app.run = async () => {
      try {
        await prevRun?.()
      } finally {
        scope.dispose()
      }
    }

    return app
  }
}
```

### Op Types

```typescript
type Op = { type: string; [key: string]: unknown }

// All op types use declaration merging on the same interface.
// @silvery/create defines the base:
interface OpTypes {
  resize: { cols: number; rows: number }
  command: { path: string[]; args?: Record<string, unknown> }
  prompt: { command: string[]; missing: string[] }
  error: { source: string[]; error: string }
}

// Other packages augment — e.g. @silvery/ag-term:
declare module "@silvery/create" {
  interface OpTypes {
    "input:key": { key: string; shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
    "input:mouse": {
      kind: "click" | "doubleClick" | "rightClick"
      x: number
      y: number
      button?: string
      modifiers?: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
    }
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
  return (app) => {
    app.root = createRootNode()
    return app
  }
}
```

### Adapter

```typescript
function withReact({ view }: { view: ReactElement }) {
  return (app) => {
    const inputHandlers = new Set<(op: Op) => boolean>()

    // useInput hook registers here — exposed to React components via context
    app.onInput = (handler: (op: Op) => boolean) => {
      inputHandlers.add(handler)
      return () => {
        inputHandlers.delete(handler)
      } // returns unsubscribe
    }

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
      reconciler.render(view) // injects app into React context — useInput/useModel resolve via context
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
    // Track auto-created scopes (vs caller-provided) — no public _callerScope flag
    const autoScopes = new WeakSet<object>()

    // --- Command execution (wraps apply) ---
    // Every command op gets op.pending — even unknown/failed commands.
    const prevApply = app.apply
    app.apply = (op) => {
      if (op.type === "command") {
        const cmd = resolveCommand(app.commands, op.path)

        // Always produce a promise — uniform completion model
        const pending = Promise.resolve()
          .then(() => {
            if (!cmd?.fn) {
              op.status = "unknown"
              throw new CommandError("unknown", op.path)
            }
            const resolution = resolveInvocation(app, cmd, op.args)
            op.args = resolution.args ?? op.args // write back resolved args for replay
            op.status = resolution.state

            if (resolution.state === "prompt") {
              queueMicrotask(() => app.dispatch({ type: "prompt", command: op.path, missing: resolution.missing }))
              throw new CommandError("prompt", op.path)
            }
            if (resolution.state === "unavailable") throw new CommandError("unavailable", op.path)
            if (resolution.state === "invalid") throw resolution.error // preserve validation error

            // Track if scope was auto-created (for disposal)
            const hadScope = !!Object.getOwnPropertyDescriptor(op, "scope")
            const result = op.scope ? op.scope.run(() => cmd.fn(resolution.args)) : cmd.fn(resolution.args)
            if (op.scope && !hadScope) autoScopes.add(op.scope)
            return result
          })
          .then(
            (value) => {
              op.result = value
              op.status = "ok"
              return value
            },
            (err) => {
              // Preserve non-ready status (prompt/unavailable/invalid/unknown)
              // Only overwrite to "error" for actual execution failures
              if (!op.status || op.status === "ready") op.status = "error"
              op.result = undefined
              Object.defineProperty(op, "error", { value: err, enumerable: false })
              if (op.status === "error") {
                queueMicrotask(() => app.dispatch({ type: "error", source: op.path, error: String(err) }))
              }
              throw err
            },
          )
          .finally(() => {
            // Auto-dispose scope only if framework created it
            const scope = Object.getOwnPropertyDescriptor(op, "scope")?.get?.()
            if (scope && autoScopes.has(scope)) scope.dispose?.()
          })
        // Suppress unhandled rejection — keymap dispatches fire-and-forget
        void pending.catch(() => {})
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
      when?: () => boolean // signal accessor — called at input time
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
          if (b.when && !b.when()) continue // condition inactive
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
        if (existing.path.join(".") !== path.join("."))
          throw new Error(
            `Command registered at "${existing.path.join(".")}", cannot re-register at "${path.join(".")}"`,
          )
        return // same path — no-op
      }
      commandMeta.set(cmd, { path })
    }

    // Typed command helper — always async, always rejects on failure
    app.command = (refOrPath, args) => {
      const path =
        typeof refOrPath === "string"
          ? refOrPath.split(".")
          : (commandMeta.get(refOrPath)?.path ?? findPathInTree(app.commands, refOrPath))
      const op: Op = { type: "command", path, args }
      app.dispatch(op)
      return op.pending // always exists — set by command apply wrapper
    }

    return app
  }
}
```

### when() — descriptor-based

`when()` returns per-binding descriptors carrying the live signal. Object spread produces descriptors, not eagerly computed values:

```typescript
type Binding = CommandRef | { command: CommandRef; args?: unknown; prompt?: string }
type ConditionalBinding = { when: () => boolean; binding: Binding }

function when<B extends Record<string, Binding>>(
  condition: () => boolean, // signal accessor
  bindings: B,
): Record<keyof B, ConditionalBinding> {
  const result = {} as any
  for (const [key, binding] of Object.entries(bindings)) {
    result[key] = { when: condition, binding }
  }
  return result
}
```

`app.keymap()` inspects each value — if it has a `when` property, the binding is conditional. The signal is called at input time — `when()` (lazy evaluation, not reactive subscription).

### resolveInvocation — surface behavior

| Surface           | ready            | prompt                  | unavailable               | invalid                  | unknown                 |
| ----------------- | ---------------- | ----------------------- | ------------------------- | ------------------------ | ----------------------- |
| **keymap**        | dispatch command | dispatch prompt op      | swallow                   | swallow                  | swallow                 |
| **app.command()** | resolve result   | reject `PromptRequired` | reject `Unavailable`      | reject `ValidationError` | reject `UnknownCommand` |
| **raw dispatch**  | execute          | `op.status="prompt"`    | `op.status="unavailable"` | `op.status="invalid"`    | `op.status="unknown"`   |
| **CLI/MCP**       | execute          | report missing args     | report unavailable        | report error             | report not found        |

### Models

```typescript
// Flat signal — cursor position
// Deep store — todo items with nested properties
// Computed — derived current item
const todoModel = createModel(() => {
  const cursor = signal(0)
  const items = createStore<{ text: string; done: boolean; priority: number }[]>([])
  return {
    cursor,
    items,
    current: computed(() => items()[cursor()] ?? null),
    add(text: string) {
      items([...items(), { text, done: false, priority: 0 }])
    },
    toggleDone() {
      const i = cursor()
      const item = items()[i]
      if (item) items()[i].done(!items()[i].done()) // deep store — mutate in place
    },
    removeAt(index: number) {
      items(items().filter((_, i) => i !== index))
      cursor(Math.min(cursor(), Math.max(0, items().length - 1)))
    },
    moveDown() {
      cursor(Math.min(cursor() + 1, Math.max(0, items().length - 1)))
    },
    moveUp() {
      cursor(Math.max(cursor() - 1, 0))
    },
  }
})

const editorModel = createModel(() => {
  const mode = signal<"normal" | "edit">("normal")
  return { mode, isEditing: computed(() => mode() === "edit") }
})

// Async resource — loads data, refetches when dependencies change
const profileModel = createModel((rt: Pick<typeof providers, "api">) => {
  const userId = signal<string | null>(null)
  const profile = createResource(async () => {
    const id = userId()
    if (!id) return null
    return rt.api.fetchProfile(id)
  })
  return {
    userId,
    profile,
    switchUser(id: string) {
      userId(id)
    }, // triggers profile refetch
  }
})
```

`createModel(factory)` returns a definition. `.create()` makes an isolated instance. `useModel(todoModel, m => m.cursor())` in React calls the accessor and tracks the dependency.

### Domain Plugins

Each domain plugin is self-contained. **`app.keymap?.()` is conditional** — headless apps skip keybindings. Domain plugins that reference other domains' commands must come after them in the pipe.

```typescript
function withTodo() {
  return (app) => {
    const todo = todoModel.create()
    app.models.todo = todo

    app.commands.todo = {
      add: {
        title: "Add Item",
        args: { text: string() },
        fn(args) {
          todo.add(args.text)
        },
      },
      toggle_done: {
        title: "Toggle Done",
        fn() {
          todo.toggleDone()
        },
      },
      remove: {
        title: "Remove Item",
        args: { index: number({ default: () => todo.cursor() }) },
        fn(args) {
          todo.removeAt(args.index)
        },
      },
      move_down: {
        title: "Move Down",
        fn() {
          todo.moveDown()
        },
      },
      move_up: {
        title: "Move Up",
        fn() {
          todo.moveUp()
        },
      },
    }

    for (const [name, cmd] of Object.entries(app.commands.todo)) {
      app.registerCommand?.(["todo", name], cmd)
    }

    app.keymap?.({
      j: app.commands.todo.move_down,
      k: app.commands.todo.move_up,
      x: app.commands.todo.toggle_done,
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
      enter_edit: {
        title: "Edit",
        fn() {
          editor.mode("edit")
        },
      },
      exit_edit: {
        title: "Done",
        fn() {
          editor.mode("normal")
        },
      },
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
function resolveInvocation(
  app,
  cmd,
  partialArgs?,
):
  | { state: "ready"; args: Record<string, unknown> }
  | { state: "prompt"; missing: string[] }
  | { state: "unavailable" }
  | { state: "invalid"; error: Error }
```

Centralizes arg defaults, signal-based availability, and validation.

### Input Precedence

All declarative via `when()` and keymap layer ordering:

1. Last-registered bindings checked first (domain plugins register after withTea)
2. `when()` conditions evaluated dynamically at input time — signal accessors called per keypress
3. Unmatched input falls through to `useInput()` hooks (registered via `app.onInput`)

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
commandProxy(app).todo.add({ text: "Buy milk" }) // proxy → dispatch
await app.command(app.commands.todo.add, { text: "x" }) // object ref → dispatch
await app.command("todo.add", { text: "x" }) // string path (serialization)

// ⚠ Escape hatch — bypasses dispatch, scopes, logging, validation, replay:
app.commands.todo.move_down.fn() // direct — tests only
```

### Scopes and Op Lifecycle

```typescript
const op: Op = { type: "command", path: ["file", "save"] }
app.dispatch(op)

op.status // "ok" | "prompt" | "unavailable" | "invalid" | "unknown" | "error"
op.args // resolved/defaulted args (written back for replay)
op.result // enumerable — resolved value (serializable)
op.scope // non-enumerable — lazy, created on first access
op.pending // non-enumerable — always present for command ops
op.error // non-enumerable — error object (if status === "error")

await op.pending // resolves to result, rejects on error
JSON.stringify(op) // { type: "command", path: [...], args: {...}, status: "ok", result: {...} }
// scope, pending, error NOT included (non-enumerable)
```

**Scope disposal**: scopes auto-created by `withScope()` (via lazy getter) are tracked internally and disposed after command completion. Caller-provided scopes (set on the op before dispatch) are NOT disposed by the framework — ownership is detected automatically, no flag needed.

```typescript
// Caller-provided scope for batching:
const batch = app.scope.child("batch")
const op1 = { type: "command", path: [...], scope: batch }  // caller-owned
const op2 = { type: "command", path: [...], scope: batch }
app.dispatch(op1); app.dispatch(op2)
batch.dispose()  // caller controls lifetime
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
// Model unit test — createStore items have nested reactive properties
const todo = todoModel.create()
todo.add("test")
todo.add("another")
todo.moveDown()
expect(todo.cursor()).toBe(1)
expect(todo.items()[0].done()).toBe(false) // deep store — read nested
todo.toggleDone() // mutates via store proxy
expect(todo.items()[1].done()).toBe(true) // only this item's subscribers re-ran

// Resource test — async data loading
const profile = profileModel.create({ api: { fetchProfile: async (id) => ({ name: "Alice" }) } })
profile.switchUser("user-1")
expect(profile.profile.loading()).toBe(true) // loading signal
await flush() // let microtask complete
expect(profile.profile()).toEqual({ name: "Alice" })
expect(profile.profile.loading()).toBe(false)

// App test — full pipeline without rendering
const app = pipe(create(), withTea(), withTodo())
await app.command(app.commands.todo.add, { text: "test" })
```

`withTodo()` calls `app.keymap?.()` — conditional. Headless works because no renderer emits input ops, so bindings are never evaluated.

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
function withScope(): <A>(app: A) => A & { scope: Scope; quit(): void }
function withAg(): <A>(app: A) => A & { root: Node }
function withTea(): <A>(app: A) => A & SilveryApp
function withTerm(): <A extends { root: Node }>(app: A) => A & { run(): Promise<void> }
function withReact(o: O): <A extends { root: Node }>(app: A) => A // run optional — wraps if present
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

**Op lifecycle.** `op.status` (ok/prompt/unavailable/invalid/unknown/error), `op.args` (resolved — written back for replay), `op.result` (enumerable), `op.error` (non-enumerable). Non-ready statuses preserved — not overwritten to "error". `op.pending` always set for command ops, even rejected ones. Fire-and-forget rejections suppressed internally (`void pending.catch(() => {})`).

**Scope disposal.** Auto-created op scopes tracked via WeakSet, disposed after command completion. Caller-provided scopes (set before dispatch) not disposed — ownership detected automatically. Root scope disposed when `run()` exits.

**Capability protection.** `withTea()` throws on double-install. Domain plugins require `withTea()` for `app.models`/`app.commands`. Keybinding registration is optional (`app.keymap?.()`) — enables headless use.

**Interception plugin order.** `withLogging()` should be installed as the outermost `apply` wrapper (last in pipe before renderer/adapter) to observe all ops. Alternatively, wrap `dispatch` instead of `apply` for guaranteed visibility regardless of plugin order.

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

| Doc           | Covered here                                         | Full details in original                       |
| ------------- | ---------------------------------------------------- | ---------------------------------------------- |
| 02-signals    | `signal()`, `createModel()`                          | 8-sip API, framework bindings, provider DI     |
| 03-commands   | Command tree, args, availability, surfaces           | Surface projection, domain objects, CLI rules  |
| 04-input      | `keymap()`, `when()`, precedence                     | Mapping type, invoke(), chord/count state      |
| 05-app        | `dispatch()`/`apply()`, domain plugins, commandProxy | Two-box model/runtime, provider architecture   |
| 06-scopes     | `op.scope`, ALS, `AbortSignal`, lifetime             | Scope API (sleep, timeout, onDispose), effects |
| composability | Adapter/renderer roles                               | Framework×platform matrix, gap analysis        |
| packaging     | `create` + `ag-*` + tea split + `impure`             | Migration paths, bundle strategies             |
| decisions     | Referenced where relevant                            | Full decision log (25 decisions)               |
