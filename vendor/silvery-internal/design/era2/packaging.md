# Packaging Model

_Status: draft (2026-03-16). How silvery decomposes into independent packages and recomposes for different use cases._

_See also: [composability.md](./composability.md) (tradeoffs, gap analysis, what's theoretically possible), [architecture-overview.md](../archive/architecture-overview.md) (concepts, op spectrum), [05-app.md](./05-app.md) (plugins, op())._

## What Is Silvery?

Silvery today is "Polished Terminal UIs in React" — a better Ink. Responsive layouts, scrollable containers, 100x+ faster incremental updates, 30+ components, pure TypeScript. Homepage: silvery.dev.

But the architecture decomposes into two independent products — **Silver Platter** (rendering) and **Silvertea** (app framework) — each with its own framework × platform matrix, enabling combinations that go far beyond React terminal apps.

The core idea: **separate what you render (components) from which framework creates them (React, Svelte, Solid), where they appear (terminal, web, canvas), and how you organize behavior (commands, keymaps, plugins).** Each choice is independent.

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

### The two products

Silver Platter (rendering) and Silvertea (app framework) are independent products under one `@silvery/*` scope. Both use prefix-based grouping: `platter-*` for rendering packages, `tea-*` for app framework packages.

```
Silver Platter — universal cross-framework, cross-platform rendering
"Your UI, served on a silver platter."
────────────────────────────────────────────────────────────────────
@silvery/platter           abstract nodes · headless state machines · signals
@silvery/platter-react     React reconciler + React component library
@silvery/platter-svelte    Svelte adapter + Svelte components          (future)
@silvery/platter-solid     Solid adapter + Solid components            (future)
@silvery/platter-term      terminal platform (ANSI, flexily)
@silvery/platter-web       web platform (CSS, DOM mapping)             (future)
@silvery/platter-canvas    canvas platform (draw calls)                (future)
@silvery/theme             theme tokens (semantic colors, palettes)

Silvertea — app framework (independent of silver platter rendering)
──────────────────────────────────────────────────────────────────
@silvery/tea               commands · keymaps · op · plugins · scopes
                           + headless app component state machines
@silvery/tea-react         React hooks (useSignal, useCommand) + React wrappers
@silvery/tea-platter       silvery-rendered tea components + surface adapters
@silvery/tea-dom           react-dom rendered tea components + adapter  (future)
@silvery/tea-svelte        Svelte tea adapter + Svelte components      (future)

Convenience bundles
───────────────────
silvery      = @silvery/platter + platter-react + platter-term + theme
silvertea    = @silvery/tea + tea-react + tea-platter
```

### Why prefix grouping?

Without prefixes, `@silvery/react` and `@silvery/tea-react` look hierarchical — as if tea-react depends on @silvery/react. It doesn't. With prefixes, they're clearly parallel:

```
@silvery/platter-react   ← rendering: React reconciler
@silvery/tea-react       ← app framework: React hooks
```

Two independent products, each with a React adapter. The naming makes this obvious.

**Naming**: "Silver platter" = the well-known idiom meaning "presented beautifully, ready to use" — exactly what a renderer does. "Tea platter" = a serving tray for tea (@silvery/tea-platter = tea components served via silvery rendering).

### @silvery/platter — The Rendering Foundation

The abstract rendering contract, headless component state machines, and signal primitives. Independent of any framework or platform.

- **Abstract node types**: Box, Text — data descriptions of UI with typed props (flexDirection, color, overflow, gap, padding, etc.)
- **Headless component state machines**: SelectListState, TextInputState, VirtualListState — pure `(action, state) → state` logic for keyboard handling, selection, scrolling
- **Signal primitives**: `signal()`, `computed()`, `effect()`, `batch()` via alien-signals + `createStore()`, `createResource()`, `Readable<T>` — shared substrate for both rendering and tea. See `@silvery/signal` in [02-signals.md](./02-signals.md)
- **Pipeline interface**: rendering capabilities that platforms implement
- **Theme tokens**: semantic colors ($primary, $muted, $border), palette abstraction — may live in separate `@silvery/theme` or be part of platter

**Rendering capabilities, not pipeline stages.** Platter defines **rendering capabilities** that platforms provide: layout computation, mutation application, output generation, and measurement feedback:

- @silvery/platter-term implements all capabilities: flexily for layout, ANSI buffer for diff/output
- @silvery/platter-web provides mapping and normalization: node types → DOM elements, props → CSS, input → normalized events. Frameworks use their native DOM capabilities for reconciliation (react-dom, Svelte compiler, Solid runtime). No silvery-owned diff or layout phase — the browser handles both.
- @silvery/platter-canvas implements layout via flexily, output via draw calls

Platter is thin — types, interfaces, state machines, signals, and shared utilities. Heavy lifting is in the platform packages.

**Host protocol.** The minimal contract between frameworks and platforms for terminal rendering:

- `createNode(type, props) → NodeHandle` — create an abstract node
- `updateNode(handle, oldProps, newProps)` — update properties
- `removeNode(handle)` — remove from tree
- `insertChild(parent, child, index)` — tree structure
- `commitBatch()` — signal end of update (triggers layout + render)

This is what `react-reconciler` calls into on terminal. On web, frameworks use their native DOM operations instead, with `@silvery/platter-web` providing the prop/style mapping layer.

### The Component Story: Three Layers

Every component exists in up to three layers. Each layer is a separate package with a clear dependency direction.

**Layer 1 — Headless state machine** (pure JS, one per component, universal):

```
@silvery/platter    →  SelectListState, TextInputState, VirtualListState
@silvery/tea     →  CommandPaletteState, SheetState, ToastState
```

**Layer 2 — Framework bindings** (one per framework, renderer-agnostic):

```
@silvery/platter-react    →  React reconciler: turns JSX into abstract nodes
@silvery/platter-svelte   →  Svelte compiler adapter (future)
@silvery/tea-react     →  useSignal, useCommand, useCommandPalette hooks
@silvery/tea-svelte    →  Svelte stores/runes for tea (future)
```

**Layer 3 — Rendered components** (one per framework × renderer):

```
                          Silver Platter (abstract nodes)  DOM (native)
                          ─────────────────────────────   ────────────
React                     platter-react                   (react-dom — not ours)
                          tea-platter                     tea-dom

Svelte                    platter-svelte                  (native Svelte — not ours)
                          tea-platter-svelte (future)     ↑ use tea-svelte + build own

Solid                     platter-solid                   (native Solid — not ours)
                          tea-platter-solid (future)      ↑ use tea-solid + build own
```

**Per-component count today: 2** — one headless state machine + one rendered React component. Not a combinatorial explosion. Rendered components target abstract nodes (Box, Text), which work on ALL platforms (terminal, web, canvas). The platform layer below handles output — components don't multiply per platform.

**What each rendered package contains:**

| Package       | Components                                                     | Surface adapter               | Deps                     |
| ------------- | -------------------------------------------------------------- | ----------------------------- | ------------------------ |
| platter-react | SelectList, TextInput, VirtualList... using Box/Text           | React reconciler              | platter, react           |
| tea-platter   | CommandPalette, Sheet, Toast... using platter-react components | withTerminal(), withBrowser() | tea-react, platter-react |
| tea-dom       | CommandPalette, Sheet, Toast... using div/input                | withBrowser()                 | tea-react, react-dom     |

**"Native framework without silvery" users** (Svelte, Solid developers who don't want silver platter rendering) get headless state machines + framework bindings. They bring their own visual layer. We only pre-build rendered components for silver platter and react-dom targets.

This follows the React Aria / Headless UI pattern: behavior is framework-agnostic, rendering is framework-specific.

### @silvery/platter-react — React Framework Adapter

React framework adapter that creates silvery abstract nodes from JSX, plus the full React component library.

- Uses `react-reconciler` to bridge React → abstract nodes
- Provides React-specific hooks: `useContentRect()`, `useFocus()` (platform-specific hooks like `useTerminalFocused()` live in `@silvery/platter-term`)
- Provides signal bridge: `useSignal()` (wraps `useSyncExternalStore`)
- **React component library**: SelectList, TextInput, VirtualList, ProgressBar, ScrollView, etc. — React wrappers around headless state machines from @silvery/platter

Virtual DOM based — React diffs the component tree to determine what nodes changed.

### @silvery/platter-svelte — Svelte Framework Adapter (future)

Svelte framework adapter that compiles to direct abstract node operations, plus Svelte component library.

- No virtual DOM — Svelte knows at compile time which nodes to update
- More efficient than React path (no diffing step)
- Signal bridge: silvery signals ↔ Svelte 5 runes (both fine-grained reactive primitives)
- Svelte component library: same components as platter-react, Svelte wrappers

### @silvery/platter-term — Terminal Platform

Renders abstract silvery nodes to terminal output. This is today's primary (and only) platform.

- **Layout**: flexily (reimplements CSS flexbox for non-browser environments)
- **Output**: ANSI escape sequences (colors, positioning, cursor, incremental diff)
- **Input**: stdin parsing (escape sequences → abstract key/pointer events)
- **Backend**: real terminal (stdin/stdout), xterm.js (browser), headless (tests)
- **Theme**: OSC palette detection, 38 built-in palettes

Works in real terminals AND browsers (via xterm.js).

### @silvery/platter-web — Web Platform (future)

Maps silvery abstractions to native DOM rendering. Unlike terminal (where the platform owns the full render pipeline), web leverages the browser's native layout, diffing, and rendering.

- **Node mapping**: Box → `<div>`, Text → `<span>` with CSS flex properties
- **Prop translation**: silvery props (flexDirection, gap, padding) → CSS styles; theme tokens → CSS custom properties
- **Input normalization**: DOM `KeyboardEvent`/`PointerEvent` → normalized key strings + typed input events
- **Theme**: CSS custom properties (`--silvery-primary`, etc.)
- **Accessibility**: semantic props (role, aria-\*) pass through to DOM attributes

**Architecture difference from terminal.** On terminal, all frameworks produce abstract nodes and the platform renders them through its own pipeline (flexily → ANSI). On web, frameworks use their native DOM capabilities — React uses react-dom, Svelte compiles to DOM operations, Solid uses fine-grained DOM updates. `@silvery/platter-web` provides the mapping layer (which DOM elements, which CSS properties, which event normalization) but does not own a reconciler. This means web rendering requires a **framework-specific integration** — it is not fully orthogonal the way terminal is.

See [composability.md](./composability.md) for the full gap analysis and tradeoff discussion.

### @silvery/tea — App Framework (Silvertea)

Replaces and expands the current `@silvery/tea`. Framework-agnostic, platform-agnostic.

- **Command** `{ fn, args? }`, **invoke()**, **canInvoke()**, **available()** — command system
- **keymap()**, **when()**, **Mapping\<E\>** — declarative input mapping (generic over event type)
- **createModel()**, **ModelContext** — model factories with explicit DI
- **Scope** — structured concurrency (cancelled, signal, sleep, timeout, onDispose, dispose)
- **createApp()**, **pipe()**, **plugins** — app composition
- **op()**, **apply()** — op-as-data bridge for interception, undo, replay
- _Future_: **Effects as data** (`AsyncEffect<T>`) — pure, testable side effects via typed descriptors
- **Headless app component state machines**: CommandPaletteState, SheetState, ToastState, TabGroupState

**Zero dependencies on silvery rendering.** Tea is pure state + behavior. This is what enables headless operation — an AI agent or test harness uses tea alone, with no rendering packages.

**Depends on a `Readable<T>` interface (`{ value, subscribe }`)** — any signal library that matches this shape works. Platter ships one implementation; Preact signals match natively; others adapt via thin wrappers. Tea has zero package dependencies — the `Readable<T>` interface is the shared substrate between silvery rendering and silvertea, not any particular package.

**Mapping\<E\> is generic, but keymaps use `Mapping<string>`.** `keymap()` returns `Mapping<string>` — the event type is a normalized key string. Each surface adapter converts platform-specific events (terminal escape sequences, DOM `KeyboardEvent`s) to this normalized form BEFORE reaching the keymap. Tea never sees platform-specific types.

### @silvery/tea-react — React Bindings for Tea

React-specific hooks and headless React wrappers for tea. Framework binding layer — renderer-agnostic.

- `useSignal()` — bridge tea signals to React via `useSyncExternalStore`
- `useCommand()`, `useKeymap()` — React hooks for tea primitives
- Headless React component wrappers (useCommandPalette, etc.)

Used by BOTH tea-platter (silvery rendering) AND tea-dom (react-dom rendering). This is the shared React layer.

### @silvery/tea-platter — Silvery-Rendered Tea Components

Tea components rendered with silvery platter primitives, plus surface adapters. This is what makes tea work with silvery.

- **Rendered components**: CommandPalette, Sheet, Toast, TabGroup, etc. — built from platter-react components (SelectList, TextInput, Box, Text)
- **Surface adapters**: `withTerminal()` (stdin → keymap → dispatch → silvery rendering), `withBrowser()` (DOM events → keymap → dispatch → silvery rendering)
- Depends on: tea-react, platter-react, platter-term (or platter-web)

### @silvery/tea-dom — React-DOM Tea Components (future)

Tea components rendered with native DOM elements for react-dom apps that don't use silvery rendering.

- **Rendered components**: CommandPalette, Sheet, Toast, etc. — built with div/input/ul
- **Surface adapter**: `withBrowser()` (DOM events → keymap → dispatch → react-dom rendering)
- **Styles**: CSS for tea components
- Depends on: tea-react, react-dom

### @silvery/tea-svelte — Svelte Tea Adapter (future)

Svelte bindings for tea signals and commands, plus Svelte component wrappers.

**Surface adapters bridge tea to framework+platforms.** Summary:

| Adapter                | Surface plugin                    | Rendered components        | Rendering                        |
| ---------------------- | --------------------------------- | -------------------------- | -------------------------------- |
| `@silvery/tea-platter` | `withTerminal()`, `withBrowser()` | silvery platter components | platter-react + platter-term/web |
| `@silvery/tea-dom`     | `withBrowser()`                   | DOM elements               | react-dom                        |
| `@silvery/tea-svelte`  | `withBrowser()`                   | Svelte components          | Svelte compiler                  |

Silvery is treated as one rendering option among many. The platter adapter isn't special — it just uses silvery's rendering instead of react-dom or Svelte.

### Convenience Bundles

All packages live under `@silvery/*`. Two bare packages are the user-facing products:

**`silvery`** — Ink replacement. Re-exports `@silvery/platter` + `@silvery/platter-react` + `@silvery/platter-term` + `@silvery/theme`:

```typescript
import { Box, Text, SelectList, run } from "silvery"
```

**`silvertea`** — App framework. Re-exports `@silvery/tea` + `@silvery/tea-react` + `@silvery/tea-platter` + signals from `@silvery/platter` (convenience — `@silvery/tea` itself has zero package deps):

```typescript
import { signal, keymap, invoke, createApp, withTerminal } from "silvertea"
// signal comes from @silvery/platter, re-exported by the silvertea bundle for convenience
// @silvery/tea core depends only on the Readable<T> interface, not on platter
```

Most users start with `silvery` and add `silvertea` when they need commands/keymaps/op. React-dom users install `@silvery/tea` + `@silvery/tea-react` + `@silvery/tea-dom` directly — no silvery rendering dependency.

### Input Flow: Surface Adapter → Tea

How platform-specific input reaches tea's command system. Each surface adapter owns this flow:

```
Surface adapter (e.g., @silvery/tea-platter)
  ┌──────────────────────────────────────────────┐
  │ 1. Source input from platform                 │
  │    stdin escape sequences (platter-term)      │
  │    DOM keydown events (platter-web)           │
  │                                               │
  │ 2. Normalize to tea's key format              │
  │    "ctrl+d", "j", "escape"                    │
  │                                               │
  │ 3. Dispatch through tea                       │
  │    keymap()(event) → Invocation | null         │
  │    invoke({ command, args }) → call fn         │
  │                                               │
  │ 4. Bridge signals → framework reactivity      │
  │    useSignal() from tea-react                  │
  │    rune adapter from tea-svelte               │
  └──────────────────────────────────────────────┘
```

The surface adapter is the integration point — it knows both the platform (where input comes from, how rendering works) and tea (keymaps, commands, signals). Tea itself never sees platform-specific types.

**Beyond key strings.** Normalized key strings (`"ctrl+d"`, `"j"`) are the command dispatch vocabulary — sufficient for keymaps and shortcuts. But real input is richer: text insertion (IME/composition), pointer coordinates, wheel deltas, drag state. Surface adapters emit **typed input events** for these — `TextInputEvent`, `PointerEvent`, `WheelEvent` — which flow directly to components, not through the keymap. The keymap handles discrete commands; components handle continuous/rich input.

## Migration Path: current tea → new tea

| @silvery/tea (current, zustand) | @silvery/tea (new)               | Change                                              |
| ------------------------------- | -------------------------------- | --------------------------------------------------- |
| `createSlice()`                 | `createModel()`                  | Factory receives `ModelContext` with explicit scope |
| `store.apply({ op })`           | `op(model).method()`             | Proxy-based, same types/autocomplete                |
| `useStore(selector)`            | `useSignal(signal)`              | Fine-grained (per-signal) vs coarse (selector)      |
| Zustand store                   | signals + methods                | No store wrapper — signals ARE the state            |
| `createEffects()`               | Same (kept)                      | —                                                   |
| —                               | `keymap()`, `when()`, `invoke()` | New: input mapping system                           |
| —                               | `Scope`, structured concurrency  | New: explicit lifecycle                             |
| —                               | `op()`, `apply()`                | New: interception pipeline                          |

## Dependency Graph

```
Silver Platter (rendering)
──────────────────────────
silvery (convenience bundle)
  ├── @silvery/platter       (abstract nodes, headless state machines, signals)
  ├── @silvery/platter-react → platter  (React reconciler + component library)
  ├── @silvery/platter-term  → platter  (terminal platform)
  └── @silvery/theme         → platter

@silvery/platter-web    → platter  (future)
@silvery/platter-svelte → platter  (future)
@silvery/platter-canvas → platter  (future)
@silvery/platter-solid  → platter  (future)
@silvery/test           → platter, platter-term  (headless terminal testing)
@silvery/compat         → platter-react  (Ink migration, private)

Silvertea (app framework)
─────────────────────────
silvertea (convenience bundle)
  ├── @silvery/tea           (zero dependencies)
  ├── @silvery/tea-react     → tea, react
  └── @silvery/tea-platter   → tea-react, platter-react, platter-term

@silvery/tea             (commands, keymaps, op, plugins, scopes, headless app state machines)
  └── zero dependencies — depends on a Readable<T> interface, not a package

@silvery/tea-react       → tea, react  (React hooks: useSignal, useCommand)
@silvery/tea-platter     → tea-react, platter-react  (silvery-rendered tea components + surface adapters)
@silvery/tea-dom         → tea-react, react-dom       (future: DOM-rendered tea components)
@silvery/tea-svelte      → tea, svelte                (future: Svelte bindings + components)
```

**The `Readable<T>` interface is the shared substrate.** Both silvery rendering (`useSignal()` in platter-react) and silvertea (commands, keymaps, op) depend on the `Readable<T>` shape (`{ value, subscribe }`). `@silvery/platter` ships one implementation (`signal()`, `derived()`), but tea does not depend on platter — any signal library that matches the interface works (Preact signals natively, others via thin wrappers).

**Surface adapters are the integration points.** Each tea rendered package bridges tea to a specific framework+renderer:

| Package                | Surface adapter                   | Rendered components        | Deps                     |
| ---------------------- | --------------------------------- | -------------------------- | ------------------------ |
| `@silvery/tea-platter` | `withTerminal()`, `withBrowser()` | silvery platter components | tea-react, platter-react |
| `@silvery/tea-dom`     | `withBrowser()`                   | DOM elements               | tea-react, react-dom     |
| `@silvery/tea-svelte`  | `withBrowser()`                   | Svelte components          | tea, svelte              |

## What Should I Use?

Two products, one gradient. Start with what you need, go deeper when the pain hits.

### The two products

**Silvery** (`silvery`) — Polished terminal UIs in React. Cross-framework, cross-platform rendering via abstract nodes. 100x+ faster than Ink. Responsive flexbox layouts, scrollable containers, 30+ components.

**Silvertea** (`silvertea`) — App framework for command-centric apps. Commands, keymaps, op(), plugins, structured concurrency. Works with silvery, react-dom, Svelte, React Native, or headless — silvery is one framework+platform option among many.

### Decision tree

```
"I want to build a terminal app"
  → `silvery` (bundles platter + platter-react + platter-term + theme)
  → Use useState, zustand, jotai, whatever you like for state.
  → Done. This is the 80% case.

"My app's state is getting tangled across components"
  → Add `silvertea` (bundles tea + tea-react + tea-platter).
  → Use signal() to share state outside React.
  → Or keep zustand — silvertea's commands work with any signal-shaped state.

"I want AI, tests, or CLI to drive my app without rendering"
  → @silvery/tea alone (no rendering packages)
  → Add commands: { fn, args? } objects.
  → invoke() from anywhere — same code path as keyboard input.

"I want vim-style keybindings, modes, chords"
  → silvertea: keymap() + when() on top of commands.
  → Keymaps are data — declarative bindings with mode predicates.

"I want undo/replay/recording"
  → silvertea: route state changes through op().
  → op() captures method calls as serializable records for replay.

"My app has multiple subsystems that need to compose"
  → silvertea: pipe() + plugins. Each plugin adds model state,
    commands, providers, or wraps the interception pipeline.

"I want the same app on terminal and web"
  → Add @silvery/platter-web alongside @silvery/platter-term.
  → Use silvery components (Box/Text), not platform-specific code.
  → Tea code doesn't change.

"I want silvertea with react-dom (no silvery rendering)"
  → @silvery/tea + @silvery/tea-react + @silvery/tea-dom.
  → Use react-dom for rendering, tea for commands/keymaps/op.
  → Your own React components, tea's app architecture.

"I want to swap React for Svelte"
  → Replace @silvery/platter-react with @silvery/platter-svelte.
  → Tea code doesn't change. Only view components need rewriting.
```

### The gradient within Silvertea

Each step builds on the previous. None requires the next. Stop when you have enough.

| Step         | What you add                | What you get                             | When to adopt                                         |
| ------------ | --------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **Signals**  | `signal()`, `derived()`     | Shared state outside React               | State needed in 2+ components, or outside rendering   |
| **Commands** | `{ fn, args? }`, `invoke()` | Testable, discoverable actions           | You want AI/CLI/tests to drive the app                |
| **Keymaps**  | `keymap()`, `when()`        | Declarative input binding with modes     | You have keyboard-heavy interaction                   |
| **Op**       | `op()`, `apply()`           | Interception, undo, replay               | You need undo, audit logging, or collaboration        |
| **Plugins**  | `pipe()`, `createApp()`     | Composable app architecture              | You have multiple subsystems or want reusable plugins |
| **Scopes**   | `Scope`, effects as data    | Structured concurrency, testable effects | You have complex async lifecycles                     |

**Signals are pluggable.** Tea depends on a `Readable<T>` interface (`{ value, subscribe }`) — not on any package. `@silvery/platter` ships a default implementation, but you can use Preact signals, wrap Solid signals, or adapt anything with a synchronous `.value` and a `subscribe()`. The value of silvertea is what's built ON TOP of signals (commands, keymaps, op), not the signal primitive itself.

### Quick reference

#### Today

| Situation                   | Install                 | Notes                                                                |
| --------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Terminal app (better Ink)   | `silvery`               | One install — bundles platter + platter-react + platter-term + theme |
| Terminal app + architecture | `silvery` + `silvertea` | Add silvertea when state/commands get complex                        |
| Headless model (AI/tests)   | `@silvery/tea`          | No rendering, no surface adapter needed                              |

#### Future

| Situation                     | Install                                                    | Notes                                 |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| Terminal + web (shared model) | `silvery` + `@silvery/platter-web` + `silvertea`           | Both platforms, one model, one tea    |
| React-dom app with tea        | `@silvery/tea` + `@silvery/tea-react` + `@silvery/tea-dom` | Tea + react-dom, no silvery rendering |
| Svelte web app with tea       | `@silvery/tea` + `@silvery/tea-svelte`                     | Tea + svelte, no silvery rendering    |
| Svelte terminal app           | `@silvery/platter-svelte` + `@silvery/platter-term`        | Silvery rendering, swap framework     |

#### Convenience bundles

| Bundle      | Contains                                                                 | For                                                 |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `silvery`   | `@silvery/platter` + `platter-react` + `platter-term` + `@silvery/theme` | Rendering — one install, one import                 |
| `silvertea` | `@silvery/tea` + `tea-react` + `tea-platter`                             | App framework — tea + React hooks + silvery surface |

## The Operation Spectrum

Every piece of app behavior sits at one of three points. See [architecture-overview.md](../archive/architecture-overview.md#the-operation-spectrum) for full details.

|                     | **op-call**        | **op-as-object**         | **op-as-data**                         |
| ------------------- | ------------------ | ------------------------ | -------------------------------------- |
| Shape               | `setState(n+1)`    | `{ fn() { n.value++ } }` | `{ op: "increment", args: { by: 1 } }` |
| Contains functions? | Is a function call | Yes — `fn` is a closure  | No — pure JSON                         |
| Serializable?       | No                 | No                       | Yes                                    |
| Established term    | Callbacks (React)  | Command pattern (GoF)    | Actions (Redux/Elm)                    |

**op-call** → imperative, locked in. **op-as-object** → decoupled (swap framework/runtime). **op-as-data** → serializable (undo/replay/persist).

The `op()` proxy bridges op-as-object to op-as-data transparently.

## Portability Dimensions

| Dimension           | What you can swap       | Cost of entry                                                  |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| **Multi-framework** | React ↔ Svelte ↔ Solid  | State in tea signals, not framework hooks                      |
| **Multi-platform**  | Terminal ↔ Web ↔ Canvas | Components using silvery abstractions, not platform primitives |
| **Multi-runtime**   | Real ↔ test ↔ AI agent  | Behavior in commands, not inline callbacks                     |
| **Multi-session**   | Undo, replay, persist   | State changes through op(), not direct mutation                |

### Bring-your-own state management

Any state library works with silvery rendering. The tradeoff is which tea features you can use:

| State library         | Works with tea commands? | Works with op()? | Multi-framework? |
| --------------------- | ------------------------ | ---------------- | ---------------- |
| Tea signals (default) | Yes                      | Yes              | Yes              |
| Preact signals        | Yes (same shape)         | Yes              | Yes              |
| Zustand               | Via adapter              | No               | No (React hooks) |
| Jotai                 | Via adapter              | No               | No (React atoms) |
| Svelte stores         | Via adapter              | No               | No (Svelte-only) |
| useState              | No                       | No               | No               |

Tea commands need `Readable<T>` signals for args schema defaults and availability detection. If your state library exposes `{ value, subscribe }`, it works natively. If not, a thin adapter bridges the gap. `op()` requires tea-compatible signals because it intercepts signal mutations.

**Multi-platform** (terminal ↔ web) is orthogonal — all state libraries work on all platforms. The constraint is on behavioral portability: can non-UI consumers drive your state?
