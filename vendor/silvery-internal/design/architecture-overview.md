# Silvery Architecture Overview

_Entry point for the Silvery design docs. Read this first, then dive into the linked docs._

## The Big Picture

Silvery apps are built from four concepts: **signals** (reactive state), **models** (state + behavior), **commands** (discoverable surface), and **plugins** (composition). Everything routes through one interception pipeline (`apply()`), and everything lives in one of two boxes: **model** (state + behavior) or **runtime** (I/O + lifecycle).

```
┌─────────────────────────────────────────────────────────────┐
│ App                                                         │
│                                                             │
│  ┌─ Model ──────────────────┐  ┌─ Runtime ────────────────┐ │
│  │ signals + methods        │  │ providers (I/O)          │ │
│  │                          │  │ scope tree (concurrency)  │ │
│  │ domain:  chat, todos     │  │ hooks (lifecycle)         │ │
│  │ surface: term, browser   │  │                           │ │
│  └──────────────────────────┘  └───────────────────────────┘ │
│                                                             │
│  ┌─ Commands ─────────────────────────────────────────────┐ │
│  │ { fn, args? } objects, nested tree                     │ │
│  │ → keybindings, CLI, palette, MCP, tests, docs          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  apply(op)  ← plugins wrap this (undo, tracing, recording) │
│  invoke()   ← resolves args schema, calls fn               │
│  op(target) ← proxy that routes method calls → apply()     │
│                                                             │
│  Plugins: withChat, withTerminal, withHistory, withAI, ...  │
└─────────────────────────────────────────────────────────────┘
        │
   run(app) → lifecycle, rendering, event loop
```

## The Four Design Docs

### 1. State API → [state-api-redesign.md](./state-api-redesign.md)

The programming model. Eight progressive "sips" from `useState` to full apps.

- **Signals** are the state primitive — `signal<T>()` gives O(1) fine-grained reactivity
- **`createModel(factory)`** wraps a factory function into a typed hook with `.get()`, `.create()`, selector support
- **Selectors auto-unwrap signals** — `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`
- **Providers** are plain typed objects for I/O capabilities; models depend on them via `Pick<typeof providers, ...>`
- **Async generators** for content streaming — `async function*` yields chunks, signals trigger re-renders

### 2. App Composition → [app-composition.md](./app-composition.md)

How apps are assembled from plugins.

- **Two concerns**: model (all state + behavior) and runtime (all I/O + lifecycle)
- **`op()` proxy** routes method calls through `apply()` for opt-in interception — same types, same autocomplete
- **Plugins are `(app) => app`** — they add model state, register commands, contribute providers, or wrap `apply()`
- **Surface plugins** (terminal, browser) contribute to both model and runtime — they're just plugins, no special abstraction
- **Composition via `pipe()`**: `pipe(createApp(), withPersist(...), withChat(...), withHistory(), withTerminal(...))`

### 3. Commands → [command-centric.md](./command-centric.md)

Every user action is a discoverable command. The command tree auto-derives every surface.

- **Commands are `{ fn, args? }` objects** — `fn` is the behavior, `args` is an optional schema with `.parse()`
- **Tree structure** auto-generates CLI subcommands, menus, palette categories, MCP tools, TypeScript types
- **Same code path** — pressing `x` and calling `commands.task.toggle_done.fn()` run the same function
- **Complete by construction** — if the user can do it, there's a command for it
- **Keymaps** bind keys to commands with `when` predicates; **input sources** are async iterables — see [input-system.md](./input-system.md)

### 4. Scope Tree → [scope-tree.md](./scope-tree.md)

Structured concurrency, effects, observability, and lifecycle in one tree.

- **Scope = AbortController + DisposableStack + loggily span + children**
- **Effects are typed descriptors** (`AsyncEffect<T>`) that are `await`-able — they look up the current scope and delegate to providers
- **Cancellation cascades down** (parent → children), errors propagate up
- **Testing**: swap providers, use `withTestClock()` for timers, `collect()` to inspect effect descriptors

## How They Connect

```
State API (signals, models)
    ↓ models expose methods
App Composition (plugins, op(), apply())
    ↓ commands are { fn, args? } objects
Commands + Input (keymaps, surfaces)
    ↓ effects execute in scoped context
Scope Tree (concurrency, lifecycle)
```

A concrete flow — user presses Enter in the terminal:

1. **Scope Tree**: Terminal source yields keypress event via async iterable within its scope
2. **Input System**: Keymap maps Enter → `{ command: commands.chat.submit }` via `when` predicates; `invoke()` resolves args
3. **App Composition**: `fn()` calls `op(app.model).chat.submit()` → routes through `apply()` → plugins intercept (undo records, tracing logs)
4. **State API**: `chat.submit()` writes to `exchanges` signal → O(1) subscriber notification → React re-renders

## Plugin Composition: Type-Safe Accumulation

Plugins compose via **spread accumulation** — each plugin adds fields to the app object, and TypeScript's intersection types track the accumulation:

```typescript
// Each plugin returns App & { new fields }
// pipe() chains them: the output type is the intersection of all plugins

const app = pipe(
  createApp(),                    // App
  withPersist("./data"),          // App & { rt: { providers: { persist } } }
  withChat(script),               // ... & { model: { chat } }
  withHistory(),                  // ... (wraps apply(), adds commands)
  withTerminal(<View />, keys),   // ... & { model: { term }, rt: { providers: { term } } }
)
// TypeScript sees the full accumulated type — app.model.chat, app.rt.providers.persist, etc.
```

This is **generic accumulation via intersection types**, not a builder pattern. Each plugin is a standalone function that can be authored independently. The `pipe()` utility is just function composition — no framework-specific builder API. Type safety comes from TypeScript's natural type inference on function return types.

**Why not a builder pattern?** Builders require a central class that knows about all possible extensions. Intersection accumulation lets any package define a plugin without the core knowing about it. The plugin IS the extension — no registration ceremony.

**Safety**: Last-write-wins for same-name fields (standard JS). Dev mode warns on collisions. Plugins namespace their contributions (`chat.*`, `term.*`, `history.*`) to avoid conflicts.

## `op()` Ergonomics

The `op()` proxy wraps an object so that method calls route through `app.apply()` instead of executing directly. The caller's code looks identical — same methods, same types, same autocomplete:

```typescript
// These have the same type signature:
app.model.chat.submit({ text }) // direct — fast, no interception
op(app.model).chat.submit({ text }) // intercepted — undo, tracing, recording see it
```

**When to use `op()`**: For state mutations that need cross-cutting behavior (undo, collaboration, recording). Direct calls for internal bookkeeping, performance-critical paths, or when interception isn't needed. The app's conventions decide, not the framework.

**How it works**: `op()` returns a Proxy that accumulates property access into a path, then on method invocation creates an `Op` descriptor (`{ target, path, args, run }`) and passes it to `app.apply()`. Plugins wrap `apply()` to intercept. The `run` field holds the original method call — plugins that don't care just call `run()`.

**Command integration**: Command `fn()` functions use `op()` to route through the pipeline. `invoke({ command: commands.chat.submit, args })` → resolves signal defaults via `args.parse()` → `fn()` → `op(app.model).chat.submit()` → `apply()` → plugins → actual method. This means keybindings, CLI, MCP, and AI agents all go through the same interception pipeline.

## Design Principles

1. **Progressive disclosure.** Sip 1 is just React. Each sip adds one concept. Nothing rewrites.
2. **Two boxes.** Model and runtime. Everything else is a plugin that contributes to one or both.
3. **Signals for state, methods for behavior.** No discriminated unions, no switch-case dispatch.
4. **Same code path everywhere.** UI keypress, CLI invocation, AI agent, and test assertion all call the same `fn()`.
5. **Native JS composition.** Plain objects, function composition, `Pick` for dependencies. No framework-specific abstractions where JS already has the concept.
6. **Opt-in interception.** `op()` makes calls interceptable. Direct calls are always available. The app decides.
7. **Structured concurrency.** Every async operation lives in a scope. Cancellation flows down, errors flow up. Nothing outlives its parent.

---

_See also: [input-system.md](./input-system.md) (keymaps, sources, dispatch), [ai-mode.md](./ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](./app-explosion.md) (the vision)._
