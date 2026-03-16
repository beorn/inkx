# App Composition

_Status: finalized (v2, 2026-03-13). How apps are assembled from plugins._

_See also: [02-signals.md](./02-signals.md) (signals, models, createModel), [03-commands.md](./03-commands.md) (command shapes, availability), [04-input.md](./04-input.md) (keymaps, sources, dispatch), [06-scopes.md](./06-scopes.md) (structured concurrency, effects), [universal-editor.md](../../docs/future/universal-editor.md) (docily/textily/termily package split)._

## The Shape

An app has two concerns, a command tree, and an interception pipeline:

```typescript
interface App {
  model: Record<string, any> // all state — domain models + surface view models
  rt: Runtime // all I/O — providers, scope, lifecycle
  commands: Record<string, Command> // discoverable tree — fn typically delegates to op(app.model).*
  apply(o: Op): unknown // interception pipeline (wrappable by plugins)
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

**Two concerns.** Model holds all reactive state and behavior — both domain state (`chat.exchanges`) and surface state (`term.inputText`). Runtime holds all I/O capabilities and effect lifecycle. `app.commands` is the discoverable command tree — `{ fn, args? }` objects where `fn` typically delegates to model methods via `op()`. Model methods are the canonical behavior; commands are thin wrappers that make them discoverable, bindable, and schema-validated.

**Why only two?** We started with four (state, events, runtime, view) and simplified:

- "Events" (commands) are thin wrappers over model methods — command `fn` delegates to `op(app.model).*`, so the behavior lives in the model.
- "View" is the rendering half of a surface, and surfaces are plugins that contribute to both model and runtime.
- What's left: state+behavior (model) and I/O+lifecycle (runtime). Everything else composes into these two boxes.

## `op()` — The Interception Proxy

`op()` bridges the operation spectrum (see [architecture-overview.md](../reference/architecture-overview.md#the-operation-spectrum)): you write **op-as-object** code (method calls with closures), but `op()` captures it as **op-as-data** (serializable `{ target, path, args }` descriptors) and routes it through `apply()`. The ergonomic cost of going from op-as-object to op-as-data is near zero — same methods, same types, same autocomplete.

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
- `invoke()` is a standalone function that takes `Invocation` objects (`{ command, args }`) — not string-based dispatch
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
// 1. Terminal source yields keystroke via async iterable
// 2. for-await loop receives the keystroke
// 3. keymap checks when predicates, matches key → Invocation | null
// 4. invoke({ command, args })
//    → command.args?.parse(args ?? {}) merges overrides + signal defaults
//    → command.fn(resolved) executes
// 5. fn() writes signals directly:
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

    // Commands — { fn, args? } on the model
    app.commands.chat = {
      submit: { fn: (p) => op(app.model).chat.submit(p) },
      compact: { fn: () => op(app.model).chat.compact() },
    }

    return app
  }
}
```

Note: `fn` uses `op()` so plugin-intercepted invocation goes through `apply()`. Direct calls (`app.model.chat.submit()`) bypass it — the app decides which is appropriate.

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
function withTerminal({
  view,
  keys,
  pointer,
}: {
  view: JSX.Element
  keys?: Mapping<string>
  pointer?: Mapping<PointerEvent>
}): Plugin {
  return (app) => {
    // View model — surface-specific state
    app.model.term = {
      inputText: signal(""),
      scrollOffset: signal(0),
      focused: signal(true),
    }

    // Runtime — terminal I/O + rendering
    const term = createTerminalProvider()
    app.rt.providers.term = term

    app.rt.hooks.onStart.push(async () => {
      // Rendering
      term.render(view, app)

      // Input — for-await loop IS the lifecycle
      ;(async () => {
        for await (const e of termKeySource(term.stdin)) {
          if (app.rt.scope.cancelled) break
          const inv = keys?.(e)
          if (inv) {
            const result = await invoke(inv) // invoke returns a promise for async commands
            if (result === false) bell()
          }
        }
      })()
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
    app.commands.history = {
      undo: {
        fn: () => {
          /* pop and invert */
        },
      },
      redo: {
        fn: () => {
          /* re-apply */
        },
      },
    }

    return app
  }
}
```

## Commands

Commands are `{ fn, args? }` objects — minimal shape where `fn` is the behavior and `args` is an optional schema with `.parse()`.

```typescript
// Direct model method — typed, autocomplete
app.model.chat.submit({ text: "hello" })

// Via invoke() — resolves signal defaults, validates schema
invoke({ command: commands.chat.submit, args: { text: "hello" } })
```

Model methods are the canonical behavior. `invoke()` additionally resolves signal defaults from the `args` schema and validates input before calling the command's `fn`, which typically delegates to `op(app.model).*`. See [03-commands.md](./03-commands.md) for the full command design and [04-input.md](./04-input.md) for keymaps and dispatch.

## The Runner

The app shape is inert. The runner connects everything and starts the event loop:

```typescript
async function run(app: App): Promise<RunHandle> {
  for (const fn of app.rt.hooks.onStart) await fn()

  return {
    async waitUntilExit() {
      await app.rt.exitPromise
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
  invoke({ command: intent.command, args: intent.params })
}

// CLI — single command
invoke({ command: parsedArgs.command, args: parsedArgs.params })
```

## Composition

Apps assemble via `pipe`:

```typescript
// ── Keymap ───────────────────────────────────────────
const keys = keymap(
  { "ctrl+c": commands.quit },
  when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }),
)

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
  withTerminal({ view: <ChatView />, keys }),
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
  withTerminal({ view: <EditorView />, keys: editorKeys }),
)
```

## Type-Safe Plugin Composition

**Decision: generic accumulation via intersection types** (not a builder pattern).

Each plugin is `(app: App) => App & { ... }`. When chained via `pipe()`, TypeScript infers the accumulated type as an intersection:

```typescript
const app = pipe(
  createApp(),                    // App
  withPersist("./data"),          // App & { rt: { providers: { persist: PersistAPI } } }
  withChat(script),               // ... & { model: { chat: ChatModel } }
  withHistory(),                  // ... (wraps apply(), registers commands — no new fields)
  withTerminal({ view: <View />, keys }), // ... & { model: { term: TermModel }, rt: { providers: { term: TermAPI } } }
)
// app.model.chat — fully typed
// app.rt.providers.persist — fully typed
```

**Why not a builder pattern?**

|                    | Generic accumulation                       | Builder pattern                        |
| ------------------ | ------------------------------------------ | -------------------------------------- |
| **Extension**      | Any package defines a plugin independently | Central class must know all extensions |
| **Type inference** | Automatic via return types                 | Manual generic params or overloads     |
| **Composition**    | Plain function composition (`pipe`)        | Method chaining on a mutable builder   |
| **Authoring**      | Write a function, return enriched app      | Extend/register with framework API     |

Accumulation is the natural fit because plugins are independently authored functions — no central coordinator needed. TypeScript's structural typing does the rest.

**Safety guarantees:**

- **Collision detection**: Last-write-wins for same-name fields (standard JS behavior). Dev mode emits a warning when two plugins contribute the same namespace.
- **Namespacing convention**: Plugins prefix their contributions — `chat.*`, `term.*`, `history.*`.
- **Ordering**: Plugins compose left-to-right in `pipe()`. For `apply()` wrapping, later plugins intercept first (outermost wrapper). Document ordering constraints in plugin docs, not enforced by the framework.

## `op()` Ergonomics

The `op()` proxy makes model method calls interceptable without changing the call site's type signature:

```typescript
// Identical types — the Proxy is invisible to TypeScript:
app.model.chat.submit({ text }) // direct call
op(app.model).chat.submit({ text }) // routed through apply()
```

### How it works

`op()` returns a recursive Proxy. Property access accumulates a path (`["chat", "submit"]`). When a function property is invoked, the proxy creates an `Op` descriptor and passes it to `app.apply()`:

```typescript
interface Op {
  target: "model" | "runtime"
  path: string[] // e.g., ["chat", "submit"]
  args: unknown[] // the method arguments
  run: () => unknown // the original method call (for pass-through)
}
```

Plugins wrap `apply()` to intercept ops. Plugins that don't care about a particular op call `o.run()` to pass through. The chain terminates at `o.run()`, which calls the actual method.

### Semantic contract

- **Method calls only** — `op()` does NOT intercept property reads or signal writes. The method call is the operation boundary.
- **One op per method call** — regardless of how many signals the method writes internally, plugins see one op.
- **Async and generator methods** work through `op()` — the proxy preserves `async function` and `async function*` return types.
- **Caching**: The proxy for a given object is cached — `op(app.model)` returns the same Proxy instance across calls. Nested proxies (`op(app.model).chat`) are also cached per path to avoid Proxy allocation on every call.

### Enforcement modes

Apps declare their interception policy:

- **Loose mode** (default): Direct calls and `op()` calls coexist. The app's conventions decide which to use.
- **Strict mode**: State-changing model methods must go through `op()` or `invoke()`. Direct calls in strict mode throw in dev (warn in prod). Useful for rich text editors where undo must see every mutation. `invoke()` is a standalone function taking `{ command, args }` — see [03-commands.md](./03-commands.md).

### Command integration

Command `fn` functions use `op()` to route through the pipeline:

```
invoke({ command: commands.chat.submit, args: { text } })
  → command.args?.parse(args) resolves signal defaults, validates
    → command.fn({ text })
      → op(app.model).chat.submit({ text })
        → app.apply({ target: "model", path: ["chat","submit"], args: [{ text }], run })
          → withHistory records the op
            → withTracing logs it
              → run() → chat.submit() → signal writes → re-render
```

Every surface (keymap, CLI, palette, MCP, AI agent, test) goes through the same path.

## Open Questions

- **Plugin ordering.** Last plugin in `pipe` wraps `apply()` outermost — it intercepts first. Should the framework detect/enforce ordering, or is it convention?

- **Plugin identity.** Can a plugin be added twice? Should plugins have IDs for dedup/replacement?

- **Hot reloading.** Can plugins be added/removed at runtime? Rich text editing may need this (enable/disable formatting based on context). Or is composition static?

- **Package boundaries.** This doc describes in-process composition. The [universal-editor.md](../../docs/future/universal-editor.md) splits into packages (runly, docily, textily, termily). Roughly: runly = runtime + signals + `op()`, docily = editing models + plugins, termily = terminal surface.

## The Progressive API (Sips 4-8)

The full API builds progressively from React basics (Sips 1-3 in [02-signals.md](./02-signals.md)) to full app composition. Each step adds one thing. Nothing rewrites.

### Sip 4: App composition + commands

An app has two concerns: model (state + behavior) and runtime (I/O + lifecycle). Commands are `{ fn, args? }` objects. Keymaps bind keys to commands with `when` predicates.

```typescript
const app = pipe(
  createApp(),
  withChat(), // adds app.model.chat — domain state + methods + commands
  withTerminal({
    view: <ChatView />,
    keys: keymap(when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }), {
      escape: commands.app.exit,
    }),
  }),
)
using handle = await run(app)
await handle.waitUntilExit()
```

### Sip 5: Providers -- typed I/O capabilities

Provider factories are plain functions returning typed APIs:

```typescript
// Provider factories — plain functions returning typed APIs
const createPersist = (dir: string) => ({
  async write(path: string, data: unknown) {
    await Bun.write(`${dir}/${path}`, JSON.stringify(data, null, 2))
  },
  async read(path: string) {
    return JSON.parse(await Bun.file(`${dir}/${path}`).text())
  },
})

const createAI = (config: { model: string }) => ({
  async *stream(messages: Exchange[]) {
    const stream = new Anthropic().messages.stream({
      model: config.model,
      max_tokens: 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    })
    for await (const event of stream) {
      if (event.type === "content_block_delta") yield event.delta.text
    }
  },
})

// All providers in one typed object
const providers = createProviders({
  persist: createPersist("./data"),
  ai: createAI({ model: "claude-sonnet-4-20250514" }),
})

// Models with provider deps — createModel defers instantiation until bind:
const useChat = createModel((rt: Pick<typeof providers, "persist" | "ai">) => {
  const exchanges = signal<Exchange[]>([])
  const streaming = signal(false)
  return {
    exchanges,
    streaming,
    submit({ text }: { text: string }) {
      exchanges.value = [...exchanges.value, { role: "user", text }]
    },
    async save() {
      await rt.persist.write("chat.json", exchanges.value)
    },
    async *respond() {
      streaming.value = true
      const exchange: Exchange = { role: "assistant", text: "" }
      exchanges.value = [...exchanges.value, exchange]
      for await (const chunk of rt.ai.stream(exchanges.value)) {
        exchange.text += chunk
        yield // re-render with accumulated content
      }
      streaming.value = false
    },
  }
})

// createApp binds model factories to providers automatically:
const app = createApp(<ChatView />, { providers, models: { chat: useChat } })
using handle = await run(app)
await handle.waitUntilExit()
```

### Sip 6: Cross-cutting plugins

Plugins wrap `app.apply()` to intercept operations routed through `op()`. `op(app.model).chat.submit()` goes through the `apply()` pipeline; direct calls (`app.model.chat.submit()`) bypass it.

```typescript
const app = pipe(
  createApp(),
  withPersist("./data"),
  withAI({ model: "claude-sonnet-4-20250514" }),
  withChat(),
  withUndo(), // wraps apply() — records model ops for undo
  withTracing(), // wraps apply() — logs all ops
  withRecording(), // wraps apply() — captures ops for replay
  withTerminal({
    view: <ChatView />,
    keys: keymap(when(isNormal, { enter: commands.chat.submit, "ctrl+l": commands.chat.compact }), {
      escape: commands.app.exit,
    }),
  }),
)

using handle = await run(app)
await handle.waitUntilExit()
```

### Sip 7: Different targets, same app

```typescript
// Terminal
await run(<ChatTUI />)

// Browser xterm.js
await run(<ChatTUI />, { term: xtermBackend })

// Headless — no view, just call methods
useChat.get().submit({ text: "hello" })
```

### Sip 8: Testing -- isolated instances

Unit test -- `.create()` makes an isolated instance with mock providers:

```typescript
const chat = useChat.create({
  persist: { write: async () => {}, read: async () => ({}) },
  ai: {
    stream: async function* () {
      yield "Hello"
      yield " world"
    },
  },
})

chat.submit({ text: "hi" })
expect(chat.exchanges.value).toHaveLength(1)

// Test async behavior — consume the generator
const gen = chat.respond()
for await (const _ of gen) {
  /* consume chunks */
}
expect(chat.exchanges.value[1].text).toBe("Hello world")

// Selector assertions without React:
chat.submit({ text: "test" })
expect(chat.exchanges.value).toHaveLength(3)

// Integration test — real providers, test config
const testChat = useChat.create({
  persist: createPersist("/tmp/test"),
  ai: createAI({ model: "claude-haiku-4-5-20251001" }),
})
```

## Providers

Typed I/O capabilities. A plain frozen object whose types are inferred from the factory implementations.

```typescript
const createPersist = (dir: string) => ({
  async write(path: string, data: unknown) {
    /* ... */
  },
  async read(path: string) {
    /* ... */
  },
})

const createAI = (config: { model: string }) => ({
  async *stream(messages: Exchange[]) {
    /* ... */
  },
})

const providers = createProviders({
  persist: createPersist("./data"),
  ai: createAI({ model: "claude-sonnet-4-20250514" }),
  fs: await import("node:fs"),
})

// Shape: plain object, types inferred from factory return types
// typeof providers = {
//   persist: { write(path, data): Promise<void>; read(path): Promise<unknown> },
//   ai: { stream(messages): AsyncGenerator<string> },
//   fs: typeof import("node:fs"),
// }
```

`createProviders` is essentially `Object.freeze` -- the value is in the type inference and the convention of collecting all I/O in one place.

## External Callers

Anything outside the model can call methods directly via `.get()`. No special API -- just code.

Three natural ways to run async code alongside an app:

### 1. App plugins (definition-time)

For automation known at app creation -- auto-advance, AI agent, recording:

```typescript
function withAutoAdvance(script): AppPlugin {
  return (app) => {
    const scope = app.rt.scope
    // Async work in the app's scope — scoped, cancellable, traced
    ;(async () => {
      for (const entry of script) {
        if (scope.cancelled) break
        useChat.get().submit({ text: entry.content })
        await useChat.get().streaming.waitFor(v => !v)
        await scope.sleep(400)
      }
    })()
    return app
  }
}

// Compose at definition time — no separate "driver" concept:
const app = pipe(
  createApp(<AIChat />, { providers, models: { chat: useChat } }),
  args.auto ? withAutoAdvance(SCRIPT) : identity,
)
using handle = await run(app)
await handle.waitUntilExit()
```

### 2. `run(app, fn)` (runtime callback)

The second argument to `run()` is an async callback that receives the app handle. `run(app)` alone runs the interactive loop (render view, listen for input). Adding a callback gives you programmatic access alongside -- or instead of -- the interactive loop:

```typescript
// Default — interactive (keybindings, view rendering)
await run(app)

// Automation — callback drives the app
await run(app, async (handle) => {
  while (true) {
    const action = await agent.decide(handle.screen.text)
    useChat.get().submit(action.args)
    await useChat.get().streaming.waitFor((v) => !v)
  }
})

// Testing — callback runs scenario, then exits
await run(app, async (handle) => {
  useChat.get().submit({ text: "fix the bug" })
  await useChat.get().streaming.waitFor((v) => !v)
})
```

### 3. Direct calls (tests)

No framework needed -- `.create()` makes an isolated instance with mock providers:

```typescript
const chat = useChat.create({
  persist: { write: async () => {}, read: async () => ({}) },
  ai: {
    stream: async function* () {
      yield "Hello"
      yield " world"
    },
  },
})

chat.submit({ text: "fix the bug" })
const gen = chat.respond()
for await (const _ of gen) {
  /* consume */
}
expect(chat.exchanges.value).toHaveLength(2)
expect(chat.exchanges.value[1].text).toBe("Hello world")
```

Three patterns, no special abstractions. Plugins compose at definition time; `run()` callbacks drive at runtime; tests create isolated instances directly.

## What Changes

| Current                                              | New                                                           | Why                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `render()` / `renderSync()` / `renderStatic()`       | `render(el, config?)` -- one function, returns string          | 4 -> 1                                 |
| `run(element)` + `createApp(config).run(element)`    | `run(app)` or `run(el, config?)`                              | 2 -> 1                                 |
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel(() => { signals + methods })` -> typed hook       | 2 -> one wrapper                       |
| `useApp(selector)`                                   | `useChat(m => m.phase)` -- per-model typed selector hook       | O(1) subscribe, no Provider           |
| `tea()`, `createStore()`                             | Removed                                                       | Internal, no longer needed            |
| Providers (DI with scoped contract)                  | `createProviders({...})` -- plain frozen object                | Types inferred, deps via `Pick`       |
| Runtime = monolith (event loop + I/O + effects)      | Providers (I/O) + behavioral plugins (tracing, recording)     | Data composition + behavioral plugins |
| Plugins add fields via spread only                   | Plugins wrap `apply()` (SlateJS-style) + add fields           | Behavioral composition, not just data |
| Handle = the control surface                         | Model IS the control surface, external code calls it directly | No separate Handle shape              |

## Migration from `useTea`

| `useTea` pattern                             | Factory function equivalent                   |
| -------------------------------------------- | --------------------------------------------- |
| `type Msg = { type: "start" } \| ...`        | Named methods on the model factory            |
| `function update(s, msg) { switch... }`      | `start() {}, tick() {}` (methods on object)   |
| `const [state, send] = useTea(init, update)` | `const useChat = createModel(() => { ... })`  |
| `send({ type: "start" })`                    | `useChat.get().submit()` (direct method call) |
| `[state, [fx.delay(...)]]` return            | `async start(s) { await scope.sleep(...) }`   |
| `streamPhase` / `revealFraction` / timers    | `async *respond(s) { yield }` (generator)     |
| `collect([state, effects])` on return value  | `await collect(() => state.chat.respond())`   |

The `collect()` helper survives unchanged. Timer effects migrate from `fx.delay`/`fx.interval` to scope methods (`scope.sleep`, `scope.timeout`). Only the wiring layer changes.

## Appendix: Design Journey (2026-03-12)

How we got here, to avoid going in circles.

### v1: Four concerns

State, Events, Runtime, View — each a separate slot with its own `apply()`. Three wrappable pipelines (state.apply, runtime.apply, events.emit).

**Problem**: Too many boxes. Surfaces (keyboard, CLI, MCP) are bidirectional I/O channels — they ARE views. Commands are model methods, not a separate concern. "View" is just the rendering half of a surface plugin.

### v2: Two concerns + `op()`

Model (all state + behavior) and Runtime (all I/O + lifecycle). Commands are `{ fn, args? }` objects alongside the model. Surfaces are plugins that contribute to both. One `apply()` pipeline. `op()` proxy for opt-in interception.

**Key insights**:

- Surfaces are views (bidirectional I/O channels)
- Commands belong in the model (they're `{ fn, args? }` objects — state updates that can trigger effects)
- Surface plugins have their own state (view model) — they're mini-models
- "All we have is model and runtime" — everything else is plugins
- `op()` proxy resolves the apply() tension: callers use natural methods, plugins intercept via apply(), the proxy bridges them
- Effects can go through `op(app.rt)` for interception or call providers directly — caller's choice per-call

**Informed by**: SlateJS (plugin wrapping), ProseMirror (state + commands + transactions), Redux middleware (interception pipeline), hexagonal architecture (surfaces as adapters), structured concurrency (runtime scope trees). See GPT-5.4 review (2026-03-12) for detailed analysis of prior art.
