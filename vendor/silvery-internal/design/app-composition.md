# App Composition

_Status: draft (v2, 2026-03-12). How apps are assembled from plugins._

_See also: [state-api-redesign.md](./state-api-redesign.md) (signals, models, createModel), [command-centric.md](./command-centric.md) (command registry, surfaces), [scope-tree.md](./scope-tree.md) (structured concurrency, effects), [universal-editor.md](../../docs/future/universal-editor.md) (docily/textily/termily package split)._

## The Shape

An app has two concerns, a command registry, and an interception pipeline:

```typescript
interface App {
  model: Record<string, any> // all state — domain models + surface view models
  rt: Runtime // all I/O — providers, scope, lifecycle
  commands: CommandRegistry // metadata/discovery over model methods
  apply(o: Op): unknown // interception pipeline (wrappable by plugins)
  invoke(id: string, params?): any // command dispatch for surfaces
  run(): Promise<RunHandle>
  dispose(): void
}

interface Runtime {
  providers: Record<string, any> // typed I/O capabilities (persist, AI, term, etc.)
  scope: Scope // root scope for structured concurrency
  hooks: {
    onStart: Array<() => void | Promise<void>>
    onStop: Array<() => void | Promise<void>>
  }
}
```

**Two concerns.** Model holds all reactive state and behavior — both domain state (`chat.exchanges`) and surface state (`term.inputText`). Runtime holds all I/O capabilities and effect lifecycle. Commands are a metadata registry over model methods — not a separate concern, just discoverability.

**Why only two?** We started with four (state, events, runtime, view) and simplified:

- "Events" (commands) belong in the model — they're just named methods that update state and trigger effects.
- "View" is the rendering half of a surface, and surfaces are plugins that contribute to both model and runtime.
- What's left: state+behavior (model) and I/O+lifecycle (runtime). Everything else composes into these two boxes.

## `op()` — The Interception Proxy

The key design: a proxy that routes calls through `apply()`.

```typescript
// Direct — not intercepted, fast, impure
app.model.chat.submit({ text: "hello" })
app.rt.providers.fs.write("data.json", state)

// Through apply() — intercepted by plugins (undo, tracing, recording)
op(app.model).chat.submit({ text: "hello" })
op(app.rt).providers.fs.write("data.json", state)
```

`op()` wraps an object in a Proxy that captures each method call as an operation and routes it through `app.apply()`. Same API, same types, same autocomplete — the proxy is invisible to the caller's type signature.

### Semantic contract

- `op()` intercepts **method calls only** — not property reads, not signal writes
- The **method call is the operation boundary** — plugins see one op per method call, regardless of how many signals it writes internally
- Plugins can observe, wrap, or cancel execution via `app.apply()`
- Apps can run in **loose mode** (direct calls allowed) or **strict mode** (state-changing methods must go through `op()` or `invoke()`)
- `op()` does NOT intercept signal reads — components read signals directly via `.value` or selectors

> **Note**: The implementation below is illustrative pseudocode. A production implementation must handle nested path accumulation, receiver binding, proxy identity caching, async generator methods, and symbol properties.

```typescript
function op<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const val = Reflect.get(obj, prop, receiver)
      if (typeof val === "function") {
        return (...args: any[]) =>
          app.apply({
            target: obj === app.model ? "model" : "runtime",
            path: [prop], // e.g., ["chat", "submit"]
            args,
            run: () => val.apply(obj, args),
          })
      }
      // Nested access — return another proxy to capture the full path
      if (typeof val === "object" && val !== null) return op(val)
      return val
    },
  })
}
```

Plugins wrap `app.apply()` to intercept:

```typescript
// Undo — only cares about model ops
function withHistory(): Plugin {
  return (app) => {
    const { apply } = app
    app.apply = (o) => {
      if (o.target === "model") pushUndo(o)
      return apply(o)
    }
    return app
  }
}

// Tracing — sees everything
function withTracing(): Plugin {
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

### When to use `op()`

The caller decides per-call:

- **State mutations that need interception** (undo, recording, collaboration): use `op(app.model)`
- **Effects that need tracing**: use `op(app.rt)`
- **Fire-and-forget, performance-critical, or internal bookkeeping**: call directly

For some apps, `op()` may be required for all state mutations (e.g., rich text editors where undo must see everything). For others, it's opt-in (e.g., a chat app where only submit/compact matter). The framework doesn't prescribe — the app's conventions do.

### End-to-end: keypress → state change

```typescript
// 1. Terminal surface receives "enter" keypress
// 2. Keybinding maps "enter" → "chat.submit"
// 3. app.invoke("chat.submit", { text: inputText.value })
//    → looks up command in registry
//    → calls execute(), which does:
// 4. op(app.model).chat.submit({ text })
//    → proxy creates op: { target: "model", path: ["chat","submit"], args, run }
//    → routes through app.apply()
// 5. app.apply(op)
//    → withHistory plugin records the op
//    → withTracing plugin logs it
//    → op.run() executes the actual method
// 6. chat.submit() runs:
//    → exchanges.value = [...exchanges.value, { role: "user", content: text }]
//    → signal notifies subscribers → React re-renders
```

The `op()` proxy joins the signal auto-unwrapping proxy in `createModel` selectors — both hide machinery behind natural syntax.

## Plugins

A plugin is a function that extends the app:

```typescript
type Plugin = (app: App) => App
```

Plugins contribute to model, runtime, commands, or wrap `apply()`. There are no special categories — a plugin does whatever it needs.

### Model plugin — add domain state

```typescript
function withChat(script: ScriptEntry[], opts: ChatOpts): Plugin {
  return (app) => {
    const exchanges = signal<Exchange[]>([])
    const phase = signal<Phase>("idle")

    app.model.chat = {
      exchanges,
      phase,
      submit({ text }) {
        exchanges.value = [...exchanges.value, { role: "user", content: text }]
      },
      async *respond(entry) {
        phase.value = "thinking"
        // ... streaming via async generator
        phase.value = "idle"
      },
      async compact() {
        /* ... */
      },
    }

    // Register commands — metadata over the methods
    app.commands.register({
      "chat.submit": { title: "Send Message", execute: (p) => op(app.model).chat.submit(p) },
      "chat.compact": { title: "Compact Context", execute: () => op(app.model).chat.compact() },
    })

    return app
  }
}
```

Note: `execute` uses `op()` so plugin-intercepted invocation goes through `apply()`. Direct calls (`app.model.chat.submit()`) bypass it — the app decides which is appropriate.

### Runtime plugin — add I/O capability

```typescript
function withPersist(dir: string): Plugin {
  return (app) => {
    app.rt.providers.persist = {
      async write(path, data) {
        await Bun.write(`${dir}/${path}`, JSON.stringify(data))
      },
      async read(path) {
        return JSON.parse(await Bun.file(`${dir}/${path}`).text())
      },
    }
    return app
  }
}
```

### Surface plugin — add view model + I/O

A surface is just a plugin that contributes to both model and runtime. No special abstraction.

```typescript
function withTerminal(element: JSX.Element, bindings: Record<string, string>): Plugin {
  return (app) => {
    // View model — surface-specific state
    app.model.term = {
      inputText: signal(""),
      scrollOffset: signal(0),
      focused: signal(true),
      ctrlDPending: signal(false),
      elapsed: signal(0),
    }

    // Runtime — terminal I/O + rendering
    app.rt.providers.term = createTerminalProvider()

    app.rt.hooks.onStart.push(async () => {
      const term = app.rt.providers.term

      // Keyboard → commands
      term.onKey((key) => {
        const commandId = bindings[key]
        if (commandId) app.invoke(commandId)
      })

      // Rendering — mount React (or Svelte, etc.)
      term.render(element, app)
    })

    // Surface-specific commands
    app.commands.register({
      "term.clear": { title: "Clear Screen", execute: () => app.rt.providers.term.clear() },
    })

    return app
  }
}
```

Domain state and surface state are separate namespaces:

```typescript
app.model.chat.exchanges // domain — the conversation
app.model.term.inputText // surface — what's in the text field
app.model.term.scrollOffset // surface — where the viewport is
```

Multiple surfaces can coexist. Drop the terminal, add a browser surface — `app.model.chat` stays the same.

### Cross-cutting plugin — wraps `apply()`

```typescript
function withHistory(): Plugin {
  return (app) => {
    const undoStack = signal<Op[]>([])
    const redoStack = signal<Op[]>([])

    // Intercept state mutations
    const { apply } = app
    app.apply = (o) => {
      if (o.target === "model") {
        undoStack.value = [...undoStack.value, o]
        redoStack.value = []
      }
      return apply(o)
    }

    // Undo/redo commands
    app.commands.register({
      "history.undo": {
        title: "Undo",
        execute: () => {
          /* pop and invert */
        },
      },
      "history.redo": {
        title: "Redo",
        execute: () => {
          /* re-apply */
        },
      },
    })

    return app
  }
}
```

## Commands

Commands are **metadata over model methods** — not a separate concern.

Model methods are the real behavior. The command registry makes them discoverable for surfaces, help text, CLI generation, MCP tools, and AI agents:

```typescript
app.model.chat.submit({ text }) // direct — typed, autocomplete
app.invoke("chat.submit", { text }) // via registry — for surfaces, remote
```

Both call the same code. `invoke()` looks up the command and calls its `execute`, which calls the model method (potentially through `op()`).

See [command-centric.md](./command-centric.md) for the full command tree design.

## The Runner

The app shape is inert. The runner connects everything and starts the event loop:

```typescript
async function run(app: App): Promise<RunHandle> {
  for (const fn of app.rt.hooks.onStart) await fn()

  return {
    async waitUntilExit() {
      await app.rt.scope.done()
    },
    [Symbol.dispose]() {
      app.dispose()
    },
  }
}
```

Different drivers for different contexts:

```typescript
// Interactive
using handle = await run(app)
await handle.waitUntilExit()

// Tests — no runner needed, just call methods
const app = pipe(createApp(), withChat(mockProviders))
app.model.chat.submit({ text: "hello" })
expect(app.model.chat.exchanges.value).toHaveLength(1)

// AI agent — drive via commands
for (const intent of plan) {
  await app.invoke(intent.command, intent.params)
}

// CLI — single command
const result = await app.invoke(parsedArgs.command, parsedArgs.params)
```

## Composition

Apps assemble via `pipe`:

```typescript
const app = pipe(
  createApp(),

  // Runtime — I/O capabilities (DI boundary)
  withPersist("./data"),
  withAI({ model: "claude-sonnet-4-20250514" }),

  // Models — domain state + behavior
  withChat(script, { fast }),

  // Cross-cutting — wrap apply()
  withHistory(),
  withTracing(),

  // Surface — view model + I/O + rendering
  withTerminal(<ChatView />, {
    enter: "chat.submit",
    escape: "app.exit",
    "ctrl+l": "chat.compact",
  }),
)

using handle = await run(app)
await handle.waitUntilExit()
```

For testing — swap runtime, drop the surface:

```typescript
const app = pipe(
  createApp(),
  withPersist(tmpDir),
  withAI({ stream: mockStream }),
  withChat(script, { fast: true }),
  // no surface — headless
)

op(app.model).chat.submit({ text: "hello" })
expect(app.model.chat.exchanges.value).toHaveLength(1)
```

For rich text editing — same pattern, more plugins:

```typescript
const editor = pipe(
  createApp(),
  withPersist("./vault"),

  // Editing core
  withDocument(store),
  withCursor(),
  withSelection(),

  // Rich text — each adds state + commands + apply() interception
  withBold(),
  withItalic(),
  withLists(),
  withCodeBlocks(),
  withTables(),

  // Cross-cutting
  withHistory(),          // undo — intercepts op(model) calls
  withCollaboration(),    // CRDT — wraps document ops

  // Surface
  withTerminal(<EditorView />, keymap),
)
```

## Open Questions

- **`op()` required vs opt-in.** For rich text editors, `op()` might be required for all mutations (undo needs to see everything). For simple apps, it's opt-in. Should the framework enforce this per-app, or is it convention?

- **`op()` granularity.** The proxy captures method calls. Should it also capture signal writes? (`op(model).chat.phase.value = "idle"`) Or should signal writes always be direct, with only method calls interceptable?

- **Plugin ordering.** Last plugin in `pipe` wraps `apply()` outermost — it intercepts first. Should the framework detect/enforce ordering, or is it convention?

- **Plugin identity.** Can a plugin be added twice? Should plugins have IDs for dedup/replacement?

- **Hot reloading.** Can plugins be added/removed at runtime? Rich text editing may need this (enable/disable formatting based on context). Or is composition static?

- **Package boundaries.** This doc describes in-process composition. The [universal-editor.md](../../docs/future/universal-editor.md) splits into packages (runly, docily, textily, termily). Roughly: runly = runtime + signals + `op()`, docily = editing models + plugins, termily = terminal surface.

## Appendix: Design Journey (2026-03-12)

How we got here, to avoid going in circles.

### v1: Four concerns

State, Events, Runtime, View — each a separate slot with its own `apply()`. Three wrappable pipelines (state.apply, runtime.apply, events.emit).

**Problem**: Too many boxes. Surfaces (keyboard, CLI, MCP) are bidirectional I/O channels — they ARE views. Commands are model methods, not a separate concern. "View" is just the rendering half of a surface plugin.

### v2: Two concerns + `op()`

Model (all state + behavior) and Runtime (all I/O + lifecycle). Commands are metadata over model methods. Surfaces are plugins that contribute to both. One `apply()` pipeline. `op()` proxy for opt-in interception.

**Key insights**:

- Surfaces are views (bidirectional I/O channels)
- Commands belong in the model (they're state updates that can trigger effects)
- Surface plugins have their own state (view model) — they're mini-models
- "All we have is model and runtime" — everything else is plugins
- `op()` proxy resolves the apply() tension: callers use natural methods, plugins intercept via apply(), the proxy bridges them
- Effects can go through `op(app.rt)` for interception or call providers directly — caller's choice per-call

**Informed by**: SlateJS (plugin wrapping), ProseMirror (state + commands + transactions), Redux middleware (interception pipeline), hexagonal architecture (surfaces as adapters), structured concurrency (runtime scope trees). See GPT-5.4 review (2026-03-12) for detailed analysis of prior art.
