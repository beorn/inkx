# Packaging Model

_Status: draft (2026-03-15). How silvery decomposes into independent packages and recomposes for different use cases._

_See also: [composability.md](./composability.md) (tradeoffs, gap analysis, what's theoretically possible), [architecture-overview.md](./architecture-overview.md) (concepts, op spectrum), [app-composition.md](./app-composition.md) (plugins, op())._

## What Is Silvery?

Silvery today is "Polished Terminal UIs in React" — a better Ink. Responsive layouts, scrollable containers, 100x+ faster incremental updates, 30+ components, pure TypeScript. Homepage: silvery.dev.

But the architecture is designed to decompose along four orthogonal axes, enabling combinations that go far beyond React terminal apps.

The core idea: **separate what you render (components) from how you create them (engine), where they appear (platform), and how you organize behavior (app framework).** Each axis is an independent choice.

## Current Packages (v0.3.0)

| Package           | What                                            |
| ----------------- | ----------------------------------------------- |
| `silvery`         | Bundled convenience — re-exports @silvery/react |
| `@silvery/react`  | React reconciler and runtime                    |
| `@silvery/term`   | Terminal rendering target                       |
| `@silvery/ui`     | Component library (30+ React components)        |
| `@silvery/tea`    | TEA state machine store (zustand-based)         |
| `@silvery/theme`  | Theming system (semantic tokens, 38 palettes)   |
| `@silvery/test`   | Testing utilities (virtual renderer, locators)  |
| `@silvery/compat` | Ink/Chalk compatibility layer (private)         |

Companion packages: **flexily** (layout engine), **loggily** (debug + tracing), **termless** (headless terminal testing).

## Future Package Architecture

### The four axes

```
Engine (creates nodes)        Platform (renders nodes)
──────────────────────        ────────────────────────
@silvery/react                @silvery/term     (terminal + xterm.js)
@silvery/svelte  (future)     @silvery/web      (native web elements, future)
@silvery/solid   (future)     @silvery/canvas   (future)

              @silvery/core
              (abstract nodes · theme · pipeline interface)

              @silvery/kit
              (app framework: signals · commands · TEA · op())

              silvery
              (bundled convenience = core + react + term)
```

### @silvery/core — The Contract

Defines WHAT things are, independent of engine or platform. This is the contract that makes engine × platform composition work.

- **Abstract node types**: Box, Text — data descriptions of UI with typed props (flexDirection, color, overflow, gap, padding, etc.)
- **Theme system**: semantic tokens ($primary, $muted, $border), palette abstraction
- **Pipeline interface**: abstract phase definitions that platforms implement (see below)
- **Component specs**: abstract definitions for SelectList, TextInput, VirtualList, CommandPalette, etc.

**Rendering capabilities, not pipeline stages.** Core defines **rendering capabilities** that platforms provide: layout computation, mutation application, output generation, and measurement feedback. The terminal platform implements all capabilities (flexily for layout, ANSI buffer for output). The web platform delegates most to the browser (CSS for layout, DOM for mutations) and provides mapping/normalization:

- @silvery/term implements all capabilities: flexily for layout, ANSI buffer for diff/output
- @silvery/web provides mapping and normalization: node types → DOM elements, props → CSS, input → normalized events. Engines use their native DOM capabilities for reconciliation (react-dom, Svelte compiler, Solid runtime). No silvery-owned diff or layout phase — the browser handles both.
- @silvery/canvas implements layout via flexily, output via draw calls

This means core is thin — types, interfaces, theme tokens, and shared utilities. The heavy lifting is in the platform packages.

**Host protocol.** The minimal contract between engines and platforms for terminal rendering:

- `createNode(type, props) → NodeHandle` — create an abstract node
- `updateNode(handle, oldProps, newProps)` — update properties
- `removeNode(handle)` — remove from tree
- `insertChild(parent, child, index)` — tree structure
- `commitBatch()` — signal end of update (triggers layout + render)

This is what `react-reconciler` calls into on terminal. On web, engines use their native DOM operations instead, with `@silvery/web` providing the prop/style mapping layer.

**Component library challenge.** Today's components (SelectList, TextInput, etc.) are React components with hooks. Making them truly engine-agnostic requires either:

1. **Abstract specs + per-engine implementations**: core defines the behavior contract (props, callbacks, keyboard handling), each engine provides a framework-native implementation
2. **Headless logic + engine-specific rendering**: core provides headless component logic (state machines, keyboard handling), engines wrap it with framework-specific rendering

Option 2 is more practical — the component LOGIC (what happens on key j, how selection wraps, how text editing works) is engine-agnostic. Only the RENDERING (turning that logic into framework-specific component trees) varies. This aligns with the TEA vision: component logic is a pure state machine, rendering is a projection.

**Package boundary.** Headless component logic (state machines, keyboard handling, selection behavior) lives in `@silvery/headless`. Engine-specific rendering wrappers live in per-engine UI packages: `@silvery/react-ui` (today's `@silvery/ui`), future `@silvery/svelte-ui`, etc. This follows the React Aria / Headless UI pattern: behavior is framework-agnostic, rendering is framework-specific.

### @silvery/react — React Engine

React reconciler that creates silvery abstract nodes from JSX.

- Uses `react-reconciler` to bridge React → abstract nodes
- Provides React-specific hooks: `useContentRect()`, `useFocus()` (platform-specific hooks like `useTerminalFocused()` live in `@silvery/term`)
- Provides signal bridge: `useSignal()` (wraps `useSyncExternalStore`)
- Wraps abstract component specs into React components (Box, Text, SelectList, etc.)

Virtual DOM based — React diffs the component tree to determine what nodes changed.

### @silvery/svelte — Svelte Engine (future)

Svelte adapter that compiles to direct abstract node operations.

- No virtual DOM — Svelte knows at compile time which nodes to update
- More efficient than React path (no diffing step)
- Signal bridge: silvery signals ↔ Svelte 5 runes (both fine-grained reactive primitives)
- Wraps abstract component specs into Svelte components

### @silvery/term — Terminal Platform

Renders abstract silvery nodes to terminal output. This is today's primary (and only) platform.

- **Layout**: flexily (reimplements CSS flexbox for non-browser environments)
- **Output**: ANSI escape sequences (colors, positioning, cursor, incremental diff)
- **Input**: stdin parsing (escape sequences → abstract key/pointer events)
- **Backend**: real terminal (stdin/stdout), xterm.js (browser), headless (tests)
- **Theme**: OSC palette detection, 38 built-in palettes

Works in real terminals AND browsers (via xterm.js).

### @silvery/web — Web Platform (future)

Maps silvery abstractions to native DOM rendering. Unlike terminal (where the platform owns the full render pipeline), web leverages the browser's native layout, diffing, and rendering.

- **Node mapping**: Box → `<div>`, Text → `<span>` with CSS flex properties
- **Prop translation**: silvery props (flexDirection, gap, padding) → CSS styles; theme tokens → CSS custom properties
- **Input normalization**: DOM `KeyboardEvent`/`PointerEvent` → normalized key strings + typed input events
- **Theme**: CSS custom properties (`--silvery-primary`, etc.)
- **Accessibility**: semantic props (role, aria-\*) pass through to DOM attributes

**Architecture difference from terminal.** On terminal, all engines produce abstract nodes and the platform renders them through its own pipeline (flexily → ANSI). On web, engines use their native DOM capabilities — React uses react-dom, Svelte compiles to DOM operations, Solid uses fine-grained DOM updates. `@silvery/web` provides the mapping layer (which DOM elements, which CSS properties, which event normalization) but does not own a reconciler. This means web rendering requires an **engine-specific integration** — it is not fully orthogonal the way terminal is.

See [composability.md](./composability.md) for the full gap analysis and tradeoff discussion.

### @silvery/kit — App Framework

Replaces and expands `@silvery/tea`. Engine-agnostic, platform-agnostic.

- **signal()**, **derived()**, **computed()** — reactive state primitives
- **Command** `{ fn, args? }`, **invoke()**, **canInvoke()**, **available()** — command system
- **keymap()**, **when()**, **Mapping\<E\>** — declarative input mapping (generic over event type)
- **createModel()**, **ModelContext** — model factories with explicit DI
- **Scope** — structured concurrency (sleep, timeout, interval, dispose)
- **createApp()**, **pipe()**, **plugins** — app composition
- **op()**, **apply()** — op-as-data bridge for interception, undo, replay
- **Effects as data** — pure, testable side effects

**Zero dependencies on core, engines, or platforms.** Kit is pure state + behavior. This is what enables headless operation — an AI agent or test harness uses kit alone.

**Mapping\<E\> is generic.** `keymap()` returns `Mapping<string>` — the event type is just a normalized key string. Each platform's input parser converts platform-specific events (stdin escape sequences, DOM KeyboardEvent) to this normalized form BEFORE reaching the keymap. Kit never sees platform-specific types.

**Framework bindings live in engine packages.** `useSignal()` is in @silvery/react. A Svelte signal adapter would be in @silvery/svelte. Kit provides the signal primitive; engines provide the framework integration.

### silvery — Bundled Convenience

Re-exports `@silvery/core` + `@silvery/react` + `@silvery/term`. One install, one import:

```typescript
import { Box, Text, run } from "silvery"
```

Most users start here and never need the scoped packages directly.

### Input Flow: Platform → Kit

How platform-specific input reaches the abstract command system:

```
Platform-specific input
  stdin escape sequences (term)     DOM keydown events (web)
  ──────────────────────────        ──────────────────────────
           │                                  │
           ▼                                  ▼
  Platform input parser             Platform input parser
  (term: parseEscapeSequence)       (web: normalizeKeyboardEvent)
           │                                  │
           ▼                                  ▼
  Normalized string                 Normalized string
  "ctrl+d", "j", "escape"          "ctrl+d", "j", "escape"
  ──────────────────────────────────────────────────────────
                          │
                          ▼
                 Kit: keymap()(event)
                 → Invocation | null
                          │
                          ▼
                 Kit: invoke({ command, args })
                 → resolves schema, calls fn
```

Each platform normalizes its native events to a common string format. Kit's `keymap()` and `invoke()` work with these normalized strings — they never see platform-specific types. The normalization happens at the platform boundary.

**Beyond key strings.** Normalized key strings (`"ctrl+d"`, `"j"`) are the command dispatch vocabulary — sufficient for keymaps and shortcuts. But real input is richer: text insertion (IME/composition), pointer coordinates, wheel deltas, drag state. Platforms emit **typed input events** for these — `TextInputEvent`, `PointerEvent`, `WheelEvent` — which flow directly to components, not through the keymap. The keymap handles discrete commands; components handle continuous/rich input.

## Migration Path: tea → kit

| @silvery/tea (current) | @silvery/kit (future)            | Change                                              |
| ---------------------- | -------------------------------- | --------------------------------------------------- |
| `createSlice()`        | `createModel()`                  | Factory receives `ModelContext` with explicit scope |
| `store.apply({ op })`  | `op(model).method()`             | Proxy-based, same types/autocomplete                |
| `useStore(selector)`   | `useSignal(signal)`              | Fine-grained (per-signal) vs coarse (selector)      |
| Zustand store          | signals + methods                | No store wrapper — signals ARE the state            |
| `createEffects()`      | Same (kept in kit)               | —                                                   |
| —                      | `keymap()`, `when()`, `invoke()` | New: input mapping system                           |
| —                      | `Scope`, structured concurrency  | New: explicit lifecycle                             |
| —                      | `op()`, `apply()`                | New: interception pipeline                          |

## Dependency Graph

```
silvery (convenience re-export)
  ├── @silvery/core
  ├── @silvery/react  → @silvery/core
  ├── @silvery/ui     → @silvery/core, @silvery/react (React component wrappers)
  ├── @silvery/term   → @silvery/core
  └── @silvery/theme  → @silvery/core

@silvery/kit (standalone — zero dependencies on core, engines, or platforms)
@silvery/headless → @silvery/kit (state machines use signals)
@silvery/react-ui → @silvery/core, @silvery/react, @silvery/headless

@silvery/test    → @silvery/core, @silvery/term (headless terminal testing)
@silvery/web     → @silvery/core  (future)
@silvery/svelte  → @silvery/core  (future)
@silvery/canvas  → @silvery/core  (future)
@silvery/solid   → @silvery/core  (future)
@silvery/compat  → @silvery/react (Ink migration, private)
```

**Integration boundaries.** Surface plugins (e.g., `withTerminal()`) live in platform packages and accept kit types (Mapping, commands) as parameters — kit is a peer dependency, not a hard dependency. No separate bridge packages are needed because the integration is function parameters, not deep coupling. The surface plugin IS the bridge.

Where integrations live:

- `withTerminal()` → in `@silvery/term`, accepts `Mapping<KeyStroke>` from kit
- `withBrowser()` → in `@silvery/web`, accepts `Mapping<KeyboardEvent>` from kit
- `useSignal()` → in `@silvery/react`, reads kit signal type
- Engine-specific DOM rendering → in `@silvery/web` + engine package (e.g., react-dom)

## What Should I Use?

Two products, one gradient. Start with what you need, go deeper when the pain hits.

### The two products

**Silvery** (rendering) — The terminal pipeline, components, and theme. 100x+ faster than Ink. Responsive flexbox layouts, scrollable containers, 30+ components. This is what you install silvery for.

**Kit** (app framework) — Commands, keymaps, op(), plugins, structured concurrency. Scales complexity without ergonomic cost. Works with any signal-shaped state library. Add it when your app outgrows `useState`.

### Decision tree

```
"I want to build a terminal app"
  → @silvery/react + @silvery/term + @silvery/react-ui
  → Use useState, zustand, jotai, whatever you like for state.
  → Done. This is the 80% case.
  → (shortcut: `silvery` bundles react + term + core)

"My app's state is getting tangled across components"
  → Add @silvery/kit
  → Use signal() to share state outside React.
  → Or keep zustand — kit's commands work with any signal-shaped state.

"I want AI, tests, or CLI to drive my app without rendering"
  → @silvery/kit alone (no react, no term, no ui)
  → Add commands: { fn, args? } objects.
  → invoke() from anywhere — same code path as keyboard input.

"I want vim-style keybindings, modes, chords"
  → @silvery/kit: keymap() + when() on top of commands.
  → Keymaps are data — declarative bindings with mode predicates.

"I want undo/replay/recording"
  → @silvery/kit: route state changes through op().
  → op() captures method calls as serializable records for replay.

"My app has multiple subsystems that need to compose"
  → @silvery/kit: pipe() + plugins. Each plugin adds model state,
    commands, providers, or wraps the interception pipeline.

"I want the same app on terminal and web"
  → Add @silvery/web alongside @silvery/term.
  → Use silvery components (Box/Text), not platform-specific code.
  → Kit code doesn't change. Engine may need a web adapter.

"I want to swap React for Svelte"
  → Replace @silvery/react with @silvery/svelte.
  → Replace @silvery/react-ui with @silvery/svelte-ui.
  → Kit code doesn't change. Only view components need rewriting.
```

### The gradient within Kit

Each step builds on the previous. None requires the next. Stop when you have enough.

| Step         | What you add                | What you get                             | When to adopt                                         |
| ------------ | --------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **Signals**  | `signal()`, `derived()`     | Shared state outside React               | State needed in 2+ components, or outside rendering   |
| **Commands** | `{ fn, args? }`, `invoke()` | Testable, discoverable actions           | You want AI/CLI/tests to drive the app                |
| **Keymaps**  | `keymap()`, `when()`        | Declarative input binding with modes     | You have keyboard-heavy interaction                   |
| **Op**       | `op()`, `apply()`           | Interception, undo, replay               | You need undo, audit logging, or collaboration        |
| **Plugins**  | `pipe()`, `createApp()`     | Composable app architecture              | You have multiple subsystems or want reusable plugins |
| **Scopes**   | `Scope`, effects as data    | Structured concurrency, testable effects | You have complex async lifecycles                     |

**Signals are pluggable.** Kit depends on a `Readable<T>` interface (`{ value, subscribe }`), not its own implementation. Kit ships a simple zero-dep signal implementation, but you can use Preact signals, wrap Solid signals, or adapt anything with a synchronous `.value` and a `subscribe()`. The value of kit is what's built ON TOP of signals (commands, keymaps, op), not the signal primitive itself.

### Quick reference

#### Today

| Situation                   | Packages                                                 | Notes                                   |
| --------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Terminal app (better Ink)   | `@silvery/react` + `@silvery/term` + `@silvery/react-ui` | Or just `silvery` (convenience bundle)  |
| Terminal app + architecture | above + `@silvery/kit`                                   | Add kit when state/commands get complex |
| Headless model (AI/tests)   | `@silvery/kit`                                           | No rendering packages needed            |

#### Future

| Situation                     | Packages                                                             | Notes                         |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Terminal + web (shared model) | `@silvery/react` + `@silvery/term` + `@silvery/web` + `@silvery/kit` | Both platforms, one model     |
| Svelte terminal app           | `@silvery/svelte` + `@silvery/term` + `@silvery/svelte-ui`           | Swap engine, same platform    |
| React-dom app with kit state  | `@silvery/kit` + `react-dom`                                         | Kit only, own rendering       |
| Svelte web app                | `@silvery/svelte` + `@silvery/web` + `@silvery/svelte-ui`            | No silvery rendering pipeline |

#### Convenience bundles

| Bundle    | Contains                                             | For                                   |
| --------- | ---------------------------------------------------- | ------------------------------------- |
| `silvery` | `@silvery/core` + `@silvery/react` + `@silvery/term` | Quick start — one install, one import |

Additional bundles (e.g., `silvery-web`, `silvery-svelte`) can be added as new engines/platforms stabilize.

## The Operation Spectrum

Every piece of app behavior sits at one of three points. See [architecture-overview.md](./architecture-overview.md#the-operation-spectrum) for full details.

|                     | **op-call**        | **op-as-object**         | **op-as-data**                         |
| ------------------- | ------------------ | ------------------------ | -------------------------------------- |
| Shape               | `setState(n+1)`    | `{ fn() { n.value++ } }` | `{ op: "increment", args: { by: 1 } }` |
| Contains functions? | Is a function call | Yes — `fn` is a closure  | No — pure JSON                         |
| Serializable?       | No                 | No                       | Yes                                    |
| Established term    | Callbacks (React)  | Command pattern (GoF)    | Actions (Redux/Elm)                    |

**op-call** → imperative, locked in. **op-as-object** → decoupled (swap engine/runtime). **op-as-data** → serializable (undo/replay/persist).

The `op()` proxy bridges op-as-object to op-as-data transparently.

## Portability Dimensions

| Dimension          | What you can swap       | Cost of entry                                                  |
| ------------------ | ----------------------- | -------------------------------------------------------------- |
| **Multi-engine**   | React ↔ Svelte ↔ Solid  | State in kit signals, not framework hooks                      |
| **Multi-platform** | Terminal ↔ Web ↔ Canvas | Components using silvery abstractions, not platform primitives |
| **Multi-runtime**  | Real ↔ test ↔ AI agent  | Behavior in commands, not inline callbacks                     |
| **Multi-session**  | Undo, replay, persist   | State changes through op(), not direct mutation                |

### Bring-your-own state management

Any state library works with silvery rendering. The tradeoff is which kit features you can use:

| State library         | Works with kit commands? | Works with op()? | Multi-engine?    |
| --------------------- | ------------------------ | ---------------- | ---------------- |
| Kit signals (default) | Yes                      | Yes              | Yes              |
| Preact signals        | Yes (same shape)         | Yes              | Yes              |
| Zustand               | Via adapter              | No               | No (React hooks) |
| Jotai                 | Via adapter              | No               | No (React atoms) |
| Svelte stores         | Via adapter              | No               | No (Svelte-only) |
| useState              | No                       | No               | No               |

Kit commands need `Readable<T>` signals for args schema defaults and availability detection. If your state library exposes `{ value, subscribe }`, it works natively. If not, a thin adapter bridges the gap. `op()` requires kit signals (or compatible) because it intercepts signal mutations.

**Multi-platform** (terminal ↔ web) is orthogonal — all state libraries work on all platforms. The constraint is on behavioral portability: can non-UI consumers drive your state?
