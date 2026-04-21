# Silvery Architecture Overview

> **Deprecated (2026-03-16).** Original hub document connecting all Era 2 design docs. Superseded by the progressive-disclosure sequence: [era2/01-quick-start.md](../era2/01-quick-start.md) through [era2/06-scopes.md](../era2/06-scopes.md). Cross-references have been updated to point to era2/ docs directly.

_Entry point for the Silvery design docs. Read this first, then dive into the linked docs._

## The Big Picture

Silvery apps are built from four concepts: **signals** (reactive state), **models** (state + behavior), **commands** (discoverable surface), and **plugins** (composition). Everything routes through one interception pipeline (`apply()`), and everything lives in one of two boxes: **model** (state + behavior) or **runtime** (I/O + lifecycle).

```
┌─────────────────────────────────────────────────────────────┐
│ App                                                         │
│                                                             │
│  ┌─ Model ──────────────────┐  ┌─ Runtime ────────────────┐ │
│  │ signals + methods        │  │ providers (I/O)          │ │
│  │                          │  │ scope tree (concurrency) │││
│  │ domain:  chat, todos     │  │ hooks (lifecycle)        │││
│  │ surface: term, browser   │  │                          │││
│  └──────────────────────────┘  └──────────────────────────┘┘│
│                                                             │
│  ┌─ Commands ─────────────────────────────────────────────┐ │
│  │ { fn, args? } objects, nested tree                     │ │
│  │ → keybindings, CLI, palette, MCP, tests, docs          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  apply(op)  ← plugins wrap this (undo, tracing, recording)  │
│  invoke()   ← resolves args schema, calls fn                │
│  op(target) ← proxy that routes method calls → apply()      │
│                                                             │
│  Plugins: withChat, withTerminal, withHistory, withAI, ...  │
└─────────────────────────────────────────────────────────────┘
        │
   run(app) → lifecycle, rendering, event loop
```

## Design Docs

Three tiers — core first, then packaging/rendering, then vision.

### Core (5 docs)

_This file_ (architecture-overview) is the entry point. The other four:

#### State API → [state-api-redesign.md](./state-api-redesign.md)

The programming model. Eight progressive "sips" from `useState` to full apps.

- **Signals** are the state primitive — `signal<T>()` gives O(1) fine-grained reactivity
- **`createModel(factory)`** wraps a factory function into a typed hook with `.get()`, `.create()`, selector support
- **Selectors auto-unwrap signals** — `useChat(m => m.phase)` returns `Phase`, not `Signal<Phase>`
- **Providers** are plain typed objects for I/O capabilities; models declare dependencies as **capability interfaces** (e.g., `{ persist: PersistProvider }`) rather than coupling to the app-global provider registry type
- **Async generators** for content streaming — `async function*` yields chunks, signals trigger re-renders

#### App Composition → [05-app.md](../era2/05-app.md)

How apps are assembled from plugins.

- **Two concerns**: model (all state + behavior) and runtime (all I/O + lifecycle)
- **`op()` proxy** routes method calls through `apply()` for opt-in interception — same types, same autocomplete
- **Plugins are `(app) => app`** — they add model state, register commands, contribute providers, or wrap `apply()`
- **Surface plugins** (terminal, browser) contribute to both model and runtime — they're just plugins, no special abstraction
- **Composition via `pipe()`**: `pipe(createApp(), withPersist(...), withChat(...), withHistory(), withTerminal(...))`

#### Commands + Input → [03-commands.md](../era2/03-commands.md), [04-input.md](../era2/04-input.md)

Every user action is a discoverable command. Commands are `{ fn, args? }` objects organized as a nested tree.

- **Commands** are `{ fn, args? }` objects — `fn` is the behavior, `args` is an optional schema with `.parse()`
- **Keymaps** bind keys to commands with `when` predicates — see [04-input.md](../era2/04-input.md)
- **Same code path** — pressing `x` and calling `commands.task.toggle_done.fn()` run the same function
- **Complete by construction** — if the user can do it, there's a command for it
- **Stable identity**: Commands are identified by their object path (e.g., `commands.chat.submit`). For external APIs (CLI, MCP, docs), paths are serialized as dot-separated strings with namespaced prefixes. Args schemas provide versioning — breaking changes are schema migrations.

#### Scope Tree → [06-scopes.md](../era2/06-scopes.md)

Structured concurrency, effects, observability, and lifecycle in one tree.

- **Scope = AbortController + AbortSignal + DisposableStack + loggily span + children**
- **v1**: Direct provider calls + scope methods (`sleep`, `timeout`, `onDispose`, `signal`). Cancellation cascades down (parent → children), errors propagate up.
- _Future_: **Effects as typed descriptors** (`AsyncEffect<T>`) that are `await`-able — they look up the current scope via `AsyncLocalStorage` and delegate to providers. `collect()` to inspect effect descriptors, `withTestClock()` for deterministic timer testing. Context propagation via `AsyncLocalStorage` on Node.js/Bun; explicit `scope` parameter as portable fallback.

### Packaging & Rendering (3 docs)

- **[packaging.md](../era2/packaging.md)** — Package decomposition, framework x platform matrix
- **[composability.md](../era2/composability.md)** — Universal rendering tradeoffs, gap analysis
- **[windowing.md](../era3/windowing.md)** — Focus, tabs, panes, windows, overlays, responder chain

### Vision (2 docs)

- **[ai-mode.md](../era3/ai-mode.md)** — AI agents driving command-centric apps
- **[app-explosion.md](../era3/app-explosion.md)** — The vision: what this all enables

## How They Connect

```
State API (signals, models)
    ↓ model factories create state + commands
App Composition (plugins extend app via pipe())
    ↓ commands exist as live object refs; keymaps bind keys to them
Commands + Input (keymaps, dispatch)
    ↓ effects execute in scoped context
Scope Tree (concurrency, lifecycle)
```

**Setup order**: Model factories (e.g., `withChat`) create both the model state and command objects (`commands.chat.submit`) as live object refs. These exist before any surface plugin runs. `withTerminal` receives the already-created command refs and builds a keymap binding keys to them.

A concrete flow — user presses Enter in the terminal:

1. **Scope Tree**: Terminal source yields keypress event via async iterable within its scope
2. **Input System**: Keymap maps Enter → `{ command: commands.chat.submit }` (an existing object ref) via `when` predicates; `invoke()` resolves args
3. **App Composition**: `fn()` calls `op(app.model).chat.submit()` → routes through `apply()` → plugins intercept (undo records, tracing logs)
4. **State API**: `chat.submit()` writes to `exchanges` signal → O(1) subscriber notification → React re-renders

## Plugin Composition: Type-Safe Accumulation

Plugins are `(app) => app` functions. Each plugin receives the app and extends its namespaces directly — adding state to `app.model`, registering entries in `app.commands`, contributing I/O capabilities to `app.rt.providers`, or wrapping `app.apply()`. `pipe()` chains plugins left-to-right, threading the app through each one:

```typescript
// Each plugin extends app.model, app.commands, app.rt.providers directly
// pipe() chains plugins left-to-right

const app = pipe(
  createApp(),                    // App
  withPersist("./data"),          // App & { rt: { providers: { persist } } }
  withChat(script),               // ... & { model: { chat } }
  withHistory(),                  // ... (wraps apply(), adds commands)
  withTerminal(<View />, keys),   // ... & { model: { term }, rt: { providers: { term } } }
)
// TypeScript sees the full accumulated type — app.model.chat, app.rt.providers.persist, etc.
```

This is **generic accumulation via intersection types**, not a builder pattern. Each plugin is a standalone function that can be authored independently. It mutably extends the app's namespaces (model, providers, commands) and returns the widened type. Type safety comes from TypeScript's intersection types modeling the accumulated result type.

**Why not a builder pattern?** Builders require a central class that knows about all possible extensions. Intersection accumulation lets any package define a plugin without the core knowing about it. The plugin IS the extension — no registration ceremony.

**Namespace ownership**: Each plugin owns its namespace (`withChat` owns `model.chat`, `withPersist` owns `rt.providers.persist`). Wrappable slots like `apply()` are chained by successive plugins. Dev mode warns on namespace collisions.

## The Operation Spectrum

Every piece of app behavior exists on a spectrum from imperative to fully serializable. Each point unlocks different capabilities:

|                          | **op-call**         | **op-as-object**         | **op-as-data**                           |
| ------------------------ | ------------------- | ------------------------ | ---------------------------------------- |
| **Shape**                | `setState(n+1)`     | `{ fn() { n.value++ } }` | `{ op: "increment", args: { by: 1 } }`   |
| **Contains functions?**  | Is a function call  | Yes — `fn` is a closure  | No — pure JSON                           |
| **Serializable?**        | No                  | No                       | Yes                                      |
| **Where behavior lives** | Inline at call site | In the object's `fn`     | In the interpreter (reducer/handler map) |

**op-call**: Imperative. Behavior happens inline. Locked to one framework, one runtime, one session.

**op-as-object**: Command pattern (GoF). Behavior is encapsulated in an object — decoupled from the call site, but the `fn` closure captures live references, so it can't be serialized. Unlocks: swap view framework, test without rendering, AI/CLI can invoke commands.

**op-as-data**: Actions (Redux/Elm). Behavior is inert data — just a name + args. A separate interpreter maps the name to behavior. Unlocks everything op-as-object does, plus: undo/redo, replay, time travel, logging, cross-process communication, persistence.

The key difference between op-as-object and op-as-data: **who knows what "increment" does?** In op-as-object, the command itself knows (it has `fn`). In op-as-data, a separate interpreter knows — the data just describes the intention. That indirection is what makes serialization, undo, and replay possible.

**The `op()` proxy bridges op-as-object toward op-as-data.** You write what looks like a method call (op-as-object ergonomics), and `op()` captures an **`OpDescriptor`** (`{ target, path, args, run }`) — a local, in-process object containing a live object reference (`target`) and closure (`run`). Created by `op()`, not serializable. This descriptor is routed through `apply()`, where middleware can derive an **`OpRecord`** (`{ targetPath: string, method: string, args: Record<string, unknown> }`) — a serializable, pure-data form produced by resolving `target` to a stable model path. Only `OpRecord` is serializable/replayable. The `OpDescriptor` enables interception (undo, tracing); the `OpRecord` enables replay, persistence, and collaboration. Developers never write `{ op: "increment" }` by hand — they call `store.increment()` and the proxy does it.

Each concern can be at a different point on the spectrum independently:

| Concern      | op-call              | op-as-object        | op-as-data                      |
| ------------ | -------------------- | ------------------- | ------------------------------- |
| **State**    | `useState(n+1)`      | `count.value++`     | `op(model).increment()`         |
| **Input**    | `onKeyDown` callback | `Command { fn }`    | `{ command: "down", args: {} }` |
| **Effects**  | `fetch()` inline     | —                   | `[{ type: "http", url, body }]` |
| **Bindings** | `if (key === "j")`   | `keymap()` function | `{ "j": "down" }` JSON config   |

You don't have to go all-in. Move each concern along the spectrum when its specific pain point hits you.

## `op()` Ergonomics

The `op()` proxy wraps an object so that method calls route through `app.apply()` instead of executing directly. The caller's code looks identical — same methods, same types, same autocomplete:

```typescript
// These have the same type signature:
app.model.chat.submit({ text }) // direct — fast, no interception
op(app.model).chat.submit({ text }) // intercepted — undo, tracing, recording see it
```

**When to use `op()`**: For state mutations that need cross-cutting behavior (undo, collaboration, recording). Direct calls for internal bookkeeping, performance-critical paths, or when interception isn't needed. The app's conventions decide, not the framework. This means replay/undo coverage is a convention, not a guarantee. Apps that need strong guarantees can enforce op()-only mutation via lint rules, branded signal types that only accept writes through apply(), or a strict mode that throws on direct mutation during recording.

**How it works**: `op()` returns a Proxy that accumulates property access into a path, then on method invocation creates an **`OpDescriptor`** (`{ target, path, args, run }`) and passes it to `app.apply()`. The `target` is a live object reference and `run` is a closure — this is op-as-object with interception, not yet true op-as-data. Plugins wrap `apply()` to intercept: tracing and undo work directly with the `OpDescriptor`, while persistence/collaboration plugins resolve `target` to a stable model path to produce a fully serializable **`OpRecord`**. The `run` field holds the original method call — plugins that don't care just call `run()`.

**Command integration**: Command `fn()` functions use `op()` to route through the pipeline. `invoke({ command: commands.chat.submit, args })` → resolves signal defaults via `args.parse()` → `fn()` → `op(app.model).chat.submit()` → `apply()` → plugins → actual method. This means keybindings, CLI, MCP, and AI agents all go through the same interception pipeline.

## Design Principles

1. **Progressive disclosure.** Sip 1 is just React. Each sip adds one concept. Nothing rewrites.
2. **Two boxes.** Model and runtime. Everything else is a plugin that contributes to one or both.
3. **Signals for state, methods for behavior.** No discriminated unions, no switch-case dispatch.
4. **Same code path everywhere.** UI keypress, CLI invocation, AI agent, and test assertion all call the same `fn()`.
5. **Native JS composition.** Plain objects, function composition, `Pick` for dependencies. No framework-specific abstractions where JS already has the concept.
6. **Opt-in interception.** `op()` makes calls interceptable. Direct calls are always available. The app decides.
7. **Structured concurrency.** Every async operation lives in a scope. Cancellation flows down, errors flow up. Nothing outlives its parent.

## Glossary

| Silvery Term | Prior Art Equivalent                                        |
| ------------ | ----------------------------------------------------------- |
| signal       | Solid signal, Vue ref, Svelte 5 rune, MobX observable       |
| derived      | Solid memo, Vue computed, Svelte $derived                   |
| op-call      | React callback, imperative setState                         |
| op-as-object | GoF Command pattern, VS Code command                        |
| op-as-data   | Redux action, Elm Msg, CRDT operation, event sourcing event |
| command      | VS Code command, Atom command                               |
| keymap       | VS Code keybinding, Vim mapping                             |
| plugin       | Redux middleware, Koa middleware, VS Code extension         |
| scope        | Go context, Kotlin CoroutineScope, Structured Concurrency   |
| model        | MobX store, Zustand slice, Elm Model                        |
| provider     | React context provider, Angular service                     |

## Windowing

Focus, tabs, panes, windows, and overlays as one coherent system. Six progressive sips from focus scopes to cross-platform windowing. One `ViewStore` manages the full view tree: `App → Window → Workspace → Pane → TabGroup → Tab`, plus overlays (Dialog, Popover, Toast).

The windowing model defines the responder chain (input routes from focused view up through the hierarchy), modality (Dialogs trap focus and inert the background), and platform mapping (same view tree renders to terminal, web, or native). The `withViews()` plugin wires it all together with commands and keybindings.

See [windowing.md](../era3/windowing.md) for the full design.

## Text Selection

App-level text selection operating on the render tree, not screen rows. Mouse drag, double/triple-click, clipboard via OSC 52. Selection walks `AgNode`s like browser `getSelection()` walks the DOM — producing clean semantic text without borders, padding, or ANSI codes.

See [text-selection.md](../era3/text-selection.md) for the full design.

## Open Questions

- How should `@silvery/web` reconcile abstract nodes to DOM — per-framework renderers or a universal DOM adapter? (See [composability.md](../era2/composability.md) for analysis.)
- ~~Should headless widget logic live in `@silvery/core` or a separate `@silvery/headless` package?~~ **Resolved**: headless state machines live in `@silvery/platter`. See [packaging.md](../era2/packaging.md) for the full package decomposition.
- What is the versioning/deprecation story for command IDs used by external consumers (CLI, MCP)?
- How does scope propagation work in browser environments without `AsyncLocalStorage`?
- Should `op()` enforcement be opt-in (lint rules) or built-in (strict mode)?

---

_See also: [packaging.md](../era2/packaging.md) (package decomposition, framework × platform matrix), [composability.md](../era2/composability.md) (universal rendering tradeoffs, gap analysis), [windowing.md](../era3/windowing.md) (windowing), [text-selection.md](../era3/text-selection.md) (text selection), [04-input.md](../era2/04-input.md) (keymaps, sources, dispatch), [ai-mode.md](../era3/ai-mode.md) (AI agents driving command-centric apps), [app-explosion.md](../era3/app-explosion.md) (the vision)._
