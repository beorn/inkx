# Silvery API Redesign

_Status: finalized. Bead: km-5kh9r. Implementation: km-silvery.api-impl._

## The Problem

Six overlapping entry points (`createApp`, `createSlice`, `createEffects`, `createStore`, `tea()`, `run()`), four render variants, and state management coupled to the runtime. Users don't know which to pick or how they combine.

## The API at a Glance

Eight sips from `useState` to multi-target apps. Each step adds one thing. Nothing rewrites.

```tsx
// ── Sip 1: Just React ──────────────────────────────────────
import { run } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((key) => {
    if (key === "j") setCount((c) => c + 1)
  })
  return <Text>Count: {count}</Text>
}

await run(<Counter />)

// ── Sip 2: Shared state via signals ────────────────────────
import { run, signal } from "silvery"

const count = signal(0)

function Counter() {
  useInput((key) => {
    if (key === "j") count.value++
  })
  return <Text>Count: {count.value}</Text>
}

await run(<Counter />)

// ── Sip 3: Model with updates-as-data ──────────────────────
import { run, createModel, signal } from "silvery"

const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },
    toggle(s, { index }) {
      s.items.value[index].done ^= 1
    },
  },
})

await run(<TodoView />, { model: Todo })

// ── Sip 4: Commands + keybindings (plugin) ─────────────────
await run(
  <TodoView />,
  pipe(
    { model: Todo },
    withCommands({
      cursor_down: { name: "Move Down", update: "moveCursor", args: { delta: 1 } },
      toggle: { name: "Toggle", update: "toggle" },
      help: { name: "Help", action: () => openOverlay("help") },
    }),
    withKeybindings({ j: "cursor_down", k: "cursor_up", x: "toggle" }),
  ),
)

// Or with an opinionated plugin:
await run(<TodoView />, withVim({ model: Todo }))

// ── Sip 5: Effects — pick your style ───────────────────────
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },

    // Direct — just works, not replayable
    async save(s) {
      await fs.writeFile("data.json", JSON.stringify(s.items.value))
    },

    // Return description — testable, replayable
    save(s) {
      return fx.persist({ data: s.items.value })
    },

    // Yield — sequential, testable
    *save(s) {
      yield fx.persist({ data: s.items.value })
      yield fx.toast({ message: "Saved!" })
    },
  },
})

// ── Sip 6: Explicit runtime — full control ─────────────────
import { createRuntime, createReactView, createTerm } from "silvery"

const term = createTerm()
const view = createReactView(<TodoApp />, term)
const { run, render } = createRuntime({ term, fs })

const app = pipe({ model: Todo, view }, withVim(), withUndo())

const handle = run(app)

handle.apply({ update: "moveCursor", delta: 1 }) // push update
handle.apply("toggle") // by command name
handle.state.cursor.value // read state
handle.exit() // shutdown

// ── Testing — swap providers, same app ─────────────────────
const { run } = createRuntime({ term: { width: 80 }, fs: mockFs })
const handle = run(app)

handle.apply("cursor_down")
expect(handle.state.cursor.value).toBe(1)

// Model-only — no runtime needed
const todo = Todo.create({ effects: "collect" })
todo.toggle({ index: 0 })
expect(todo.effects).toContainEqual({ type: "persist" })

// ── Different targets, same app ────────────────────────────
const app = pipe({ model: Todo }, withVim(), withUndo())

// Terminal
run({ ...app, view: createReactView(<TodoTUI />, term) })

// Browser xterm.js
run({ ...app, view: createReactView(<TodoTUI />, xterm) })

// Svelte
run({ ...app, view: createSvelteView(TodoSvelte, term) })

// Headless — no view, just ops
const handle = run(app)
for await (const op of websocket) handle.apply(op)
```

## Principles

1. **Runtime/App separation.** The runtime owns I/O and the event loop. The app is passive — pure state, pure update functions, pure views.
2. **React-native.** Your hooks, your state, your components work. Silvery adds terminal capabilities, not a new programming model.
3. **Native JS composition.** Plain objects, spread, function composition, async iterables. No framework-specific plugin/provider interfaces where JS already has the concept.
4. **State is optional and pluggable.** Use `useState`, `signal()`, Zustand, `createModel` — or nothing. The runtime doesn't care.
5. **The Silvery Way is opt-in.** The shiny path (updates-as-data, effects-as-data, commands) is always visible but never forced.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│ Runtime (active)                                         │
│   Drives the event loop. Executes effects. Owns I/O.    │
│   Created with providers: term, fs, http, ...            │
│                                                          │
│   events → updates → apply(state, update) → effects     │
│     ↑                                          │        │
│     └────────── more updates ──────────────────┘        │
├──────────────────────────────────────────────────────────┤
│ App (passive)                                            │
│   Pure state + update functions + view.                  │
│   Composed with plugins (plain functions).               │
│                                                          │
│   model: state + updates (pure)                          │
│   view: state → UI (pure)                                │
│   commands: named intents with metadata                  │
└──────────────────────────────────────────────────────────┘
```

Inspired by Roc's platform model: the runtime is the platform, the app is pure logic. The app never does I/O — it returns effect descriptions. The runtime decides how to execute them.

## Two Layers

### Layer 1: Convenience (most users)

```tsx
import { run, render } from "silvery"

// One-shot output — sync, returns string
render(<Table data={rows} />)
render(<Table data={rows} />, { width: 80 })

// Interactive — zero config
await run(<Counter />)

// Interactive — with model and plugins
await run(<TodoApp />, withVim({ model: Todo }))
```

`run()` and `render()` are convenience wrappers that internally create a runtime, a React view, and wire everything together.

### Layer 2: Explicit (power users)

```tsx
import { createRuntime, createReactView, createModel } from "silvery"

// 1. Term — I/O target
const term = createTerm()

// 2. View — framework + target, self-contained
const view = createReactView(<TodoApp />, term)

// 3. Model — pure state + updates
const Todo = createModel({
  state: () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  updates: {
    moveCursor(s, { delta }) {
      s.cursor.value += delta
    },
    toggle(s, { index }) {
      s.items.value[index].done ^= 1
    },
  },
})

// 4. App — compose with plugins (plain functions)
const app = pipe(
  { model: Todo, view },
  withCommands({
    cursor_down: { name: "Move Down", update: "moveCursor", args: { delta: 1 } },
    toggle: { name: "Toggle Done", update: "toggle" },
  }),
  withKeybindings({ j: "cursor_down", k: "cursor_up", x: "toggle" }),
  withUndo(),
)

// 5. Runtime — I/O providers
const { run, render } = createRuntime({ term, fs })

// 6. Run
const handle = run(app)
```

Three concepts, all composable:

- **Runtime** — I/O providers (term, fs, http). Created once, reused.
- **App** — pure logic (model, view, commands, keybindings). Composed with plugins.
- **View** — framework + render target. Self-contained. Runtime knows nothing about React.

## Key Mechanisms

### The inner loop

The runtime processes updates **synchronously**. Async only at the edges (waiting for events, executing I/O effects):

```typescript
while (running) {
  while (queue.length > 0) {
    const [newState, effects] = apply(state, queue.shift()!)
    state = newState
    for (const fx of effects) {
      if (fx.type === "dispatch")
        queue.push(fx) // sync cross-dispatch
      else providers[fx.target]?.[fx.action](fx.args) // I/O
    }
  }
  const event = await nextEvent() // only async point
  queue.push(eventToUpdate(event))
}
```

Matches Elm TEA, SolidJS sync signals, Svelte 5 runes. No microtask scheduling per update. High throughput for burst events (key repeat, paste).

### Plugins

`<T>(app: T) => T & NewStuff`. No plugin interface. Just functions that enrich objects:

```typescript
function withUndo<T extends { updates: Record<string, any> }>(app: T) {
  return {
    ...app,
    updates: { ...app.updates, undo(s) { ... }, redo(s) { ... } },
    keybindings: { ...app.keybindings, "ctrl+z": "undo", "ctrl+shift+z": "redo" },
  }
}
```

### Effects pipeline

Updates return effect descriptions. The runtime executes them. Swappable per environment:

```
update handler (pure, sync) → state change + effect descriptions
  → runtime routes to providers → providers[fx.target][fx.action](fx.args)

Todo.create()                         // production — real I/O
Todo.create({ effects: "collect" })   // tests — collect, don't execute
Todo.create({ effects: "skip" })      // replay — skip I/O entirely
```

### Cross-model dispatch

Models compose via typed op builders:

```typescript
confirm(s) {
  s.open.value = false
  return [Board.ops.addItem({ text: s.value.value })]
  // → { type: "dispatch", model: "board", update: "addItem", text: "..." }
}
```

Runtime routes dispatch effects to the target model. Type-safe — `Board.ops.addItem` only accepts Board's update params.

### Framework bindings

`@silvery/tea` is framework-agnostic. Thin bindings (~5-10 lines each):

```tsx
import { useModel } from "@silvery/tea/react" // useSyncExternalStore
import { useModel } from "@silvery/tea/svelte" // writable store bridge
import { useModel } from "@silvery/tea/vue" // ref() bridge
```

## How Silvery Compares

|               | Terminal          | State                                 | Events                 | Rendering                    |
| ------------- | ----------------- | ------------------------------------- | ---------------------- | ---------------------------- |
| **Ink**       | Hidden            | React hooks only                      | `useInput` hooks       | React (coupled to state)     |
| **Bubbletea** | Hidden            | Enforced TEA                          | Message dispatch       | Pure strings                 |
| **Ratatui**   | Explicit          | BYO                                   | Manual event loop      | Immediate mode               |
| **Textual**   | Hidden            | Reactive (auto)                       | Message queue          | Widget tree + CSS            |
| **Silvery**   | Explicit (`Term`) | BYO (signals, tea, Zustand, useState) | Commands + keybindings | React (decoupled from state) |

**From Bubbletea**: updates-as-data, effects-as-data, pure state machines — but opt-in, not enforced.
**From Ratatui**: explicit terminal, state decoupled from rendering — but with React's DX.
**From Ink**: React components, `run()` simplicity, hooks — but with a path out of the mess.
**From Roc**: pure app / I/O runtime separation — but in JS, not enforced by compiler.

The pitch: **Day 1, it's React for terminals. Day 30, when the pain hits, the Silvery Way is one sip away.**

## What Changes

| Current                                              | New                                                       | Why                             |
| ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| `render()` / `renderSync()` / `renderStatic()`       | `render(el, config?)` — one function, returns string      | 4 → 1                           |
| `run(element)` + `createApp(config).run(element)`    | `run(el, config?)` or `createRuntime(providers).run(app)` | 2 → 1 (convenience) or explicit |
| `createSlice(init, handlers)` + `createEffects(...)` | `createModel({ state, updates, effects? })`               | 2 → 1                           |
| `useApp(selector)`                                   | `useModel(model, selector)`                               | Framework-agnostic              |
| `tea()`, `createStore()`                             | Removed                                                   | Internal, no longer needed      |
| Providers (DI with scoped contract)                  | Runtime providers (term, fs) + app plugins (functions)    | Clear separation                |
| keybindings in `createApp`                           | Plugin or config field on app                             | Composable                      |

## Decisions

1. **App shape** — Plain object is canonical. No `createApp()` wrapper needed — TypeScript infers types from spread and pipe. Optional `createApp()` for validation/defaults can come later if needed.

2. **Plugin composition** — Into sub-objects via spread. `withUndo()` merges into `updates`, `keybindings`, etc. TypeScript intersection types accumulate at each step.

3. **Naming: "updates"** — Keep "updates" for model ops (matches TEA's Msg/Update). Document the distinction from React setState clearly in guides. "Effects" for I/O. "Commands" for user intents.

4. **Provider interface** — Just an object with capabilities (term, fs, http). No formal getState/subscribe contract. Effect routing via discriminated union on `effect.target`. Providers are the runtime's I/O surface, nothing more.

5. **`model` vs `models`** — Keep separate. `model` for the common case (one state machine), `models` map for composition. Internally unified handling.

6. **Auto-signaling** — Deferred (P4). Explore Valtio-style proxy wrapping later. For now, explicit `signal()` is clearer and more predictable. See km-silvery.auto-signals.

7. **React bridge** — `@silvery/tea/react` as separate entry point. Keeps the core framework-agnostic. Same pattern for `/svelte`, `/vue`.

8. **Migration** — Deprecated wrappers for `createSlice`, `createApp`, `useApp` for one release cycle. Clear deprecation warnings pointing to new APIs.

9. **`@silvery/tea` independence** — Keep as `@silvery/tea` for now. Evaluate standalone (`silvertea`) after Silvery 1.0 establishes credibility. See km-silvery.tea-standalone.

10. **Unification** — Confirmed: don't over-unify. Models, providers, and plugins serve different roles. Unified philosophy (message-passing, pure/impure boundary) but distinct types.

### Plugin safety (km-silvery.plugin-safety)

Plugins can collide — same command name, both modify `updates`, etc. Guidelines:

- **Last-write-wins** for spread composition (standard JS behavior). Document this.
- **Dev mode warning** when two plugins contribute the same command name or update handler.
- **Scoping convention**: plugin commands use `plugin.command` namespace (e.g., `vim.normal`, `undo.undo`).
- **Order matters**: document that plugins compose left-to-right in `pipe()`. Later plugins override earlier ones.
- **TypeScript enforces**: intersection types make most conflicts visible at compile time.

## Strategic Positioning (validated by deep research, 2026-03-11)

**Narrative**: "Day 1, it's React for terminals. Day 30, the Silvery Way is one sip away."

**Three winning angles**:

1. **AI-native terminal apps** — No competitor has command introspection + state query + screenshot APIs for agent control. Category-defining. (km-silvery.ai-demo, km-silvery.ai-apis)
2. **Performance + stability** — Per-node dirty rendering, no WASM memory leaks. Claude Code's 120GB Yoga leak is the cautionary tale. (km-silvery.benchmarks)
3. **Gradual adoption** — Sip progression means zero commitment up front, full power when needed. Ink devs can migrate with an import change. (km-silvery.ink-migration)

**First 1000 users**: JS/TS devs who outgrew Ink, AI coding agent builders, internal dev tool teams, Node.js library maintainers wanting polished CLIs.

**Killer features to build** (no competitor has these):

- HMR for TUIs — the "Vite moment" (km-silvery.hmr)
- AI-first APIs — screen model queries, command surfaces (km-silvery.ai-apis)
- Visual regression testing — buffer → image diffing (km-silvery.visual-regression)

**Ecosystem strategy**: @silvery/tea as standalone state library is a Trojan horse, but don't divert core resources. Stay focused on "best terminal UI framework" identity. (km-silvery.tea-standalone)

## Implementation

See km-silvery.api-impl (depends on this design doc being finalized).

Phased: Core (createModel, createRuntime, plugins) → Views (createReactView) → Ecosystem (framework bindings) → Migration (deprecated wrappers).
