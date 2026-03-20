# Packaging Model

> **Partially superseded (2026-03-20).** The package naming has evolved. "Silver Platter" is now **Ag** (`@silvery/ag-*`). Package structure: `@silvery/create` + `@silvery/scope` + `@silvery/headless` + `@silvery/commands` + `@silvery/signals` (optional) + `@silvery/model`. `@silvery/tea` is gone (tea() is a utility in create). `@silvery/ag-ui` is gone (now `@silvery/ag-react/ui` subpath). Commands depend only on create. See [00-architecture.md](./00-architecture.md) § Dependency Graph for the current package structure.

_Status: draft (2026-03-16). How silvery decomposes into independent packages and recomposes for different use cases._

_See also: [00-architecture.md](./00-architecture.md) (THE reference), [composability.md](./composability.md) (tradeoffs, gap analysis)._

## What Is Silvery?

Silvery today is "Polished Terminal UIs in React" — a better Ink. Responsive layouts, scrollable containers, 100x+ faster incremental updates, 30+ components, pure TypeScript. Homepage: silvery.dev.

But the architecture decomposes into **Ag** (rendering) and **app-level packages** (model, commands, signals, scopes) — each with its own framework x platform matrix, enabling combinations that go far beyond React terminal apps.

The core idea: **separate what you render (components) from which framework creates them (React, Svelte, Solid), where they appear (terminal, web, canvas), and how you organize behavior (commands, keymaps, plugins).** Each choice is independent.

## Current Packages (v0.3.0)

| Package           | What                                            |
| ----------------- | ----------------------------------------------- |
| `silvery`         | Bundled convenience — re-exports @silvery/react |
| `@silvery/react`  | React reconciler and runtime                    |
| `@silvery/term`   | Terminal rendering target                       |
| `@silvery/ui`     | Component library (30+ React components)        |
| `@silvery/tea`    | TEA state machine store (zustand-based) — **being replaced by tea() in @silvery/create** |
| `@silvery/theme`  | Theming system (semantic tokens, 38 palettes)   |
| `@silvery/test`   | Testing utilities (virtual renderer, locators)  |
| `@silvery/compat` | Ink/Chalk compatibility layer (private)         |

Companion packages: **flexily** (layout engine), **loggily** (debug + tracing), **termless** (headless terminal testing).

## Future Package Architecture

### The package groups

Ag (rendering) and app-level packages are independent groups under one `@silvery/*` scope. Rendering uses `ag-*` prefix grouping. App-level packages use descriptive names (`model`, `commands`, `signal`, `scope`, `create`).

```
Ag — universal cross-framework, cross-platform rendering
"Your UI, served on a silver platter."
────────────────────────────────────────────────────────────────────
@silvery/ag                abstract nodes · focus system · pipeline interface
@silvery/ag-react          React adapter/reconciler + React component library
  /ui                      30+ React components (SelectList, TextInput, etc.)
@silvery/ag-term           terminal platform (ANSI, flexily)
@silvery/theme             theme tokens (semantic colors, palettes) — no ag dep

Experimental (future — log warning on use, API unstable):
@silvery/ag-exp-svelte     Svelte adapter + Svelte components
@silvery/ag-exp-web        web platform (CSS, DOM mapping)
@silvery/ag-exp-canvas     canvas platform (draw calls)

Headless (pure state machines, no rendering)
────────────────────────────────────────────
@silvery/headless          SelectListState, TextInputState, VirtualListState,
                           ToggleState, TabGroupState (create)

App-level packages (independent of ag rendering)
─────────────────────────────────────────────────
@silvery/create            dispatch · apply · pipe · tea() (zero deps)
@silvery/scope             structured concurrency (zero deps)
@silvery/signals           signal · computed · effect · batch (alien-signals) — optional
@silvery/model             model factories with explicit DI (signals — optional)
@silvery/commands          command system · keymaps (create only)

Impure (native framework bridges — no ag)
─────────────────────────────────────────
@silvery/impure
  /react-dom               react-dom rendered components + adapter  (future)
  /svelte                  Svelte adapter + Svelte components       (future)

Convenience bundle
──────────────────
silvery = create + scope + headless + commands + signals + model + ag + ag-react + ag-react/ui + ag-term + theme
```

### Why prefix grouping?

Without prefixes, `@silvery/react` and `@silvery/commands/react` look hierarchical — as if commands/react depends on @silvery/react. It doesn't. With prefixes, they're clearly parallel:

```
@silvery/ag-react          ← rendering: React adapter/reconciler
@silvery/commands/react    ← app framework: React hooks for commands
```

Two independent product groups, each with a React binding. The naming makes this obvious.

**Naming**: "Ag" = the chemical symbol for silver — short, distinctive, and thematically consistent with Silvery. The `ag-*` prefix groups all rendering packages visually.

### @silvery/ag — The Rendering Foundation

The abstract rendering contract. Independent of any framework or platform.

- **Abstract node types**: Box, Text — data descriptions of UI with typed props (flexDirection, color, overflow, gap, padding, etc.)
- **Focus system**: focus tree, focus scopes, focus navigation
- **Pipeline interface**: rendering capabilities that platforms implement
- **Theme tokens**: semantic colors ($primary, $muted, $border), palette abstraction — in separate `@silvery/theme` (not an ag dependency)

**Rendering capabilities, not pipeline stages.** Ag defines **rendering capabilities** that platforms provide: layout computation, mutation application, output generation, and measurement feedback:

- @silvery/ag-term implements all capabilities: flexily for layout, ANSI buffer for diff/output
- @silvery/ag-exp-web provides mapping and normalization: node types -> DOM elements, props -> CSS, input -> normalized events. Frameworks use their native DOM capabilities for reconciliation (react-dom, Svelte compiler, Solid runtime). No silvery-owned diff or layout phase — the browser handles both.
- @silvery/ag-exp-canvas implements layout via flexily, output via draw calls

Ag is thin — types, interfaces, focus system, and shared utilities. Heavy lifting is in the platform packages.

**Host protocol.** The minimal contract between frameworks and platforms for terminal rendering:

- `createNode(type, props) -> NodeHandle` — create an abstract node
- `updateNode(handle, oldProps, newProps)` — update properties
- `removeNode(handle)` — remove from tree
- `insertChild(parent, child, index)` — tree structure
- `commitBatch()` — signal end of update (triggers layout + render)

This is what `react-reconciler` calls into on terminal. On web, frameworks use their native DOM operations instead, with `@silvery/ag-exp-web` providing the prop/style mapping layer.

### The Component Story: Three Layers

Every component exists in up to three layers. Each layer is a separate package with a clear dependency direction.

**Layer 1 — Headless state machine** (pure JS, one per component, universal):

```
@silvery/headless   ->  SelectListState, TextInputState, VirtualListState,
                        ToggleState, TabGroupState
@silvery/commands   ->  CommandPaletteState, SheetState, ToastState
```

**Layer 2 — Framework bindings** (one per framework, renderer-agnostic):

```
@silvery/ag-react          ->  React adapter/reconciler: turns JSX into abstract nodes
@silvery/ag-exp-svelte         ->  Svelte compiler adapter (future)
@silvery/commands/react    ->  useCommand, useCommandPalette hooks
@silvery/impure/svelte     ->  Svelte stores/runes for commands (future)
```

**Layer 3 — Rendered components** (one per framework x renderer):

```
                          Ag (abstract nodes)         DOM (native)
                          ─────────────────────────   ────────────
React                     ag-react / ag-react/ui      (react-dom — not ours)
                                                      impure/react-dom

Svelte                    ag-svelte                   (native Svelte — not ours)
                                                      impure/svelte (future)

Solid                     ag-solid (future)           (native Solid — not ours)
```

**Per-component count today: 2** — one headless state machine + one rendered React component. Not a combinatorial explosion. Rendered components target abstract nodes (Box, Text), which work on ALL platforms (terminal, web, canvas). The platform layer below handles output — components don't multiply per platform.

**What each rendered package contains:**

| Package              | Components                                           | Surface adapter          | Deps                                  |
| -------------------- | ---------------------------------------------------- | ------------------------ | ------------------------------------- |
| ag-react/ui          | SelectList, TextInput, VirtualList... using Box/Text | React adapter/reconciler | ag-react, headless, commands, theme   |
| impure/react-dom     | CommandPalette, Sheet, Toast... using div/input      | withBrowser()            | headless, commands, react, react-dom  |

**"Native framework without silvery" users** (Svelte, Solid developers who don't want ag rendering) get headless state machines + framework bindings. They bring their own visual layer. We pre-build rendered components for ag and react-dom targets.

This follows the React Aria / Headless UI pattern: behavior is framework-agnostic, rendering is framework-specific.

### @silvery/ag-react — React Framework Adapter

React framework adapter that creates silvery abstract nodes from JSX. The `/ui` subpath provides the full React component library.

- Uses `react-reconciler` to bridge React -> abstract nodes
- Provides React-specific hooks: `useContentRect()`, `useFocus()` (platform-specific hooks like `useTerminalFocused()` live in `@silvery/ag-term`)
- Provides signal bridge: `useSignal()` (wraps `useSyncExternalStore`)
- **`@silvery/ag-react/ui`**: SelectList, TextInput, VirtualList, ProgressBar, ScrollView, etc. — React wrappers around headless state machines from @silvery/headless. Depends on ag-react, headless, commands, theme.

Virtual DOM based — React diffs the component tree to determine what nodes changed.

### @silvery/ag-exp-svelte — Svelte Framework Adapter (experimental)

> **Experimental**: Logs a warning on import. API may change between minor versions.

Svelte framework adapter that compiles to direct abstract node operations, plus Svelte component library.

- No virtual DOM — Svelte knows at compile time which nodes to update
- More efficient than React path (no diffing step)
- Signal bridge: silvery signals <-> Svelte 5 runes (both fine-grained reactive primitives)
- Svelte component library: same components as ag-react, Svelte wrappers

### @silvery/ag-term — Terminal Platform

Renders abstract silvery nodes to terminal output. This is today's primary (and only) platform.

- **Layout**: flexily (reimplements CSS flexbox for non-browser environments)
- **Output**: ANSI escape sequences (colors, positioning, cursor, incremental diff)
- **Input**: stdin parsing (escape sequences -> abstract key/pointer events)
- **Backend**: real terminal (stdin/stdout), xterm.js (browser), headless (tests)
- **Theme**: OSC palette detection, 38 built-in palettes

Works in real terminals AND browsers (via xterm.js).

### @silvery/ag-exp-web — Web Platform (experimental)

> **Experimental**: Logs a warning on import. API may change between minor versions.

Maps silvery abstractions to native DOM rendering. Unlike terminal (where the platform owns the full render pipeline), web leverages the browser's native layout, diffing, and rendering.

- **Node mapping**: Box -> `<div>`, Text -> `<span>` with CSS flex properties
- **Prop translation**: silvery props (flexDirection, gap, padding) -> CSS styles; theme tokens -> CSS custom properties
- **Input normalization**: DOM `KeyboardEvent`/`PointerEvent` -> normalized key strings + typed input events
- **Theme**: CSS custom properties (`--silvery-primary`, etc.)
- **Accessibility**: semantic props (role, aria-\*) pass through to DOM attributes

**Architecture difference from terminal.** On terminal, all frameworks produce abstract nodes and the platform renders them through its own pipeline (flexily -> ANSI). On web, frameworks use their native DOM capabilities — React uses react-dom, Svelte compiles to DOM operations, Solid uses fine-grained DOM updates. `@silvery/ag-exp-web` provides the mapping layer (which DOM elements, which CSS properties, which event normalization) but does not own a reconciler. This means web rendering requires a **framework-specific integration** — it is not fully orthogonal the way terminal is.

See [composability.md](./composability.md) for the full gap analysis and tradeoff discussion.

### tea() — Backend-Agnostic State Machines (in @silvery/create)

`tea()` is a utility function in `@silvery/create`, not a separate package. It provides TEA (The Elm Architecture) state machines with a minimal state backend interface:

```typescript
interface StateBackend<S> {
  get(): S
  set(partial: Partial<S>): void
  subscribe(listener: () => void): () => void
}
```

Each backend is a ~10-line adapter: `zustandBackend(store)`, `signalBackend(signals)`, `valtioBackend(proxy)`. The reducer/effect/dispatch logic doesn't change. Users choose their state library; tea() provides the TEA architecture on top.

### App-Level Packages (@silvery/create, signals, scope, model, commands)

The app-level packages replace and expand the old `@silvery/tea`. Framework-agnostic, platform-agnostic. Split across focused packages:

- **@silvery/create** — `create()`, `dispatch()`, `apply()`, `pipe()`, `tea()` — zero-dep dispatch pipeline + TEA utility
- **@silvery/scope** — `createScope()`, `withScope()`, `currentScope()` — structured concurrency (zero deps)
- **@silvery/headless** — `SelectListState`, `TextInputState`, `VirtualListState`, `ToggleState`, `TabGroupState` — pure state machines (depends on create)
- **@silvery/signals** — `signal()`, `computed()`, `effect()`, `batch()` via alien-signals + `createStore()`, `createResource()`, subpath `/react` for `useSignal()` — optional, for reactive state
- **@silvery/model** — `createModel()`, `ModelContext` — model factories with explicit DI (depends on signals — optional)
- **@silvery/commands** — **Command** `{ fn, args? }`, **invoke()**, **canInvoke()**, **available()**, **keymap()**, **when()**, **Mapping\<E\>** — command system + declarative input mapping (depends on create only). Subpath `/react` for `useCommand()`, `useKeymap()` hooks.
- _Future_: **Effects as data** (`AsyncEffect<T>`) — pure, testable side effects via typed descriptors
- **Headless app component state machines**: CommandPaletteState, SheetState, ToastState (in @silvery/commands)

**Zero dependencies on silvery rendering.** App-level packages are pure state + behavior. This is what enables headless operation — an AI agent or test harness uses them alone, with no rendering packages.

**Commands are state-agnostic.** `when()` predicates are plain `() => boolean` functions. `canInvoke()` and `available()` evaluate on demand. For reactive availability (menu bars, toolbars), wrap with `computed()` from your signal library of choice. Commands depend only on `@silvery/create` — no signal or scope dependency.

**Mapping\<E\> is generic, but keymaps use `Mapping<string>`.** `keymap()` returns `Mapping<string>` — the event type is a normalized key string. Each surface adapter converts platform-specific events (terminal escape sequences, DOM `KeyboardEvent`s) to this normalized form BEFORE reaching the keymap. Commands never see platform-specific types.

### @silvery/commands/react — React Bindings for Commands

React-specific hooks and headless React wrappers for the command system. Framework binding layer — renderer-agnostic.

- `useCommand()`, `useKeymap()` — React hooks for command primitives
- Headless React component wrappers (useCommandPalette, etc.)

Used by BOTH ag-react/ui (silvery rendering) AND impure/react-dom (react-dom rendering). This is the shared React layer.

### @silvery/impure/react-dom — React-DOM Components (future)

App-level components rendered with native DOM elements for react-dom apps that don't use silvery rendering.

- **Rendered components**: CommandPalette, Sheet, Toast, etc. — built with div/input/ul
- **Surface adapter**: `withBrowser()` (DOM events -> keymap -> dispatch -> react-dom rendering)
- **Styles**: CSS for components
- Depends on: headless, commands, peer: react, react-dom

### @silvery/impure/svelte — Svelte Adapter (future)

Svelte bindings for signals and commands, plus Svelte component wrappers.

**Impure bridges connect app-level packages to framework+platforms.** Summary:

| Adapter                     | Surface plugin  | Rendered components | Rendering       |
| --------------------------- | --------------- | ------------------- | --------------- |
| `@silvery/impure/react-dom` | `withBrowser()` | DOM elements        | react-dom       |
| `@silvery/impure/svelte`    | `withBrowser()` | Svelte components   | Svelte compiler |

Silvery ag is one rendering option among many. The impure bridges serve users who want the app architecture without ag rendering.

### Convenience Bundle

All packages live under `@silvery/*`. One bare package is the user-facing product:

**`silvery`** — Ink replacement. Re-exports `@silvery/create` + `@silvery/scope` + `@silvery/headless` + `@silvery/commands` + `@silvery/signals` + `@silvery/model` + `@silvery/ag` + `@silvery/ag-react` + `@silvery/ag-react/ui` + `@silvery/ag-term` + `@silvery/theme`:

```typescript
import { Box, Text, SelectList, run } from "silvery"
```

Most users start with `silvery`. React-dom users install `@silvery/commands` + `@silvery/impure/react-dom` directly — no ag rendering dependency.

### Input Flow: Surface Adapter -> Commands

How platform-specific input reaches the command system. Each surface adapter owns this flow:

```
Surface adapter (e.g., withTerm in ag-term)
  +----------------------------------------------+
  | 1. Source input from platform                 |
  |    stdin escape sequences (ag-term)           |
  |    DOM keydown events (ag-web)                |
  |                                               |
  | 2. Normalize to command key format            |
  |    "ctrl+d", "j", "escape"                    |
  |                                               |
  | 3. Dispatch through command system            |
  |    keymap()(event) -> Invocation | null        |
  |    invoke({ command, args }) -> call fn        |
  |                                               |
  | 4. Bridge signals -> framework reactivity     |
  |    useSignal() from signal/react              |
  |    rune adapter from impure/svelte            |
  +----------------------------------------------+
```

The surface adapter is the integration point — it knows both the platform (where input comes from, how rendering works) and the command system (keymaps, commands, signals). Commands never see platform-specific types.

**Beyond key strings.** Normalized key strings (`"ctrl+d"`, `"j"`) are the command dispatch vocabulary — sufficient for keymaps and shortcuts. But real input is richer: text insertion (IME/composition), pointer coordinates, wheel deltas, drag state. Surface adapters emit **typed input events** for these — `TextInputEvent`, `PointerEvent`, `WheelEvent` — which flow directly to components, not through the keymap. The keymap handles discrete commands; components handle continuous/rich input.

## Migration Path: current tea -> new packages

| @silvery/tea (current, zustand) | New location                                         | Change                                              |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `createSlice()`                 | `createModel()` (@silvery/model)                     | Factory receives `ModelContext` with explicit scope |
| `store.apply({ op })`           | `op(model).method()`                                 | Proxy-based, same types/autocomplete                |
| `useStore(selector)`            | `useSignal(signal)`                                  | Fine-grained (per-signal) vs coarse (selector)      |
| Zustand store                   | signals + methods                                    | No store wrapper — signals ARE the state            |
| `createEffects()`               | Same (kept)                                          | —                                                   |
| `createStore()` (TEA runtime)   | `tea()` (@silvery/create)                            | Same TEA shape, now a utility in create             |
| —                               | `keymap()`, `when()`, `invoke()` (@silvery/commands) | New: input mapping system                           |
| —                               | `Scope`, structured concurrency (@silvery/scope)     | New: explicit lifecycle                             |
| —                               | `op()`, `apply()` (@silvery/commands)                | New: interception pipeline                          |

## Dependency Graph

```
Foundation:
  @silvery/create                         (zero deps — create, dispatch, apply, tea())
  @silvery/scope                          (zero deps — withScope, createScope, currentScope)
  @silvery/signals                        (alien-signals + alien-deepsignals — optional)
    +-- core: signal, computed, effect, batch  (re-export alien-signals, ~1.8KB)
    +-- createStore()                     deep reactive proxy (alien-deepsignals, ~2.7KB)
    +-- createResource()                  async signal bridge (scope-integrated)
    +-- /react                            useSignal(), model selectors (peer: react)

Headless:
  @silvery/headless                       (create — pure state machines)
    +-- SelectListState, TextInputState, VirtualListState
    +-- ToggleState, TabGroupState

App (app architecture):
  @silvery/commands                       (create only)
    +-- /react                            (peer: react)
  @silvery/model                          (signals — optional)
    +-- /react                            (signals/react, peer: react)

Ag (rendering):
  @silvery/ag                             (create — withAg, node tree, focus system)
  @silvery/ag-react                       (ag, peer: react — adapter/reconciler)
    +-- /ui                               (ag-react, headless, commands, theme — 30+ React components)
  @silvery/ag-term                        (ag, scope, flexily — renderer)
  @silvery/theme                          (no deps — tokens, palettes)

Ag experimental (future — log warning on import):
  @silvery/ag-exp-svelte                  (ag, peer: svelte)
  @silvery/ag-exp-web                     (ag)
  @silvery/ag-exp-canvas                  (ag, flexily)

Impure (native framework bridges — no ag):
  @silvery/impure
    +-- /react-dom                        (headless, commands, peer: react, react-dom)
    +-- /svelte                           (headless, commands, peer: svelte — future)

Bundles:
  silvery                                 create + scope + headless + commands + signals + model
                                          + ag + ag-react + ag-react/ui + ag-term + theme
```

**Commands are state-agnostic — no `Readable<T>` dependency.** Commands use plain `() => boolean` predicates for `when()`, and `canInvoke()`/`available()` evaluate eagerly. For reactive availability in menu bars or toolbars, wrap predicates with `computed()` from whatever signal library you use. `@silvery/signals` is the default choice but is entirely optional — commands work with any state management or none at all.

**Impure bridges are the integration points.** Each impure package bridges the command system to a specific framework+renderer:

| Package                     | Surface adapter | Rendered components | Deps                              |
| --------------------------- | --------------- | ------------------- | --------------------------------- |
| `@silvery/impure/react-dom` | `withBrowser()` | DOM elements        | headless, commands, react-dom     |
| `@silvery/impure/svelte`    | `withBrowser()` | Svelte components   | headless, commands, svelte        |

## What Should I Use?

Two product groups, one gradient. Start with what you need, go deeper when the pain hits.

### The two product groups

**Silvery** (`silvery`) — Polished terminal UIs in React. Cross-framework, cross-platform rendering via abstract nodes. 100x+ faster than Ink. Responsive flexbox layouts, scrollable containers, 30+ components.

**App-level packages** (`@silvery/model`, `@silvery/commands`, etc.) — App framework for command-centric apps. Commands, keymaps, op(), plugins, structured concurrency. Works with silvery ag, react-dom, Svelte, React Native, or headless — ag is one rendering option among many.

### Decision tree

```
"I want to build a terminal app"
  -> `silvery` (bundles create + scope + headless + commands + signals + model
     + ag + ag-react + ag-react/ui + ag-term + theme)
  -> Use useState, zustand, jotai, whatever you like for state.
  -> Done. This is the 80% case.

"My app's state is getting tangled across components"
  -> The `silvery` bundle already includes model + commands.
  -> Use signal() to share state outside React — signals are optional but useful here.
  -> Or keep zustand — commands are state-agnostic, they work with anything.

"I want AI, tests, or CLI to drive my app without rendering"
  -> @silvery/commands alone (no rendering packages, no signal dependency)
  -> Add commands: { fn, args? } objects.
  -> invoke() from anywhere — same code path as keyboard input.

"I want vim-style keybindings, modes, chords"
  -> @silvery/commands: keymap() + when() on top of commands.
  -> Keymaps are data — declarative bindings with plain () => boolean predicates.

"I want undo/replay/recording"
  -> Route state changes through op().
  -> op() captures method calls as serializable records for replay.

"My app has multiple subsystems that need to compose"
  -> pipe() + plugins. Each plugin adds model state,
    commands, providers, or wraps the interception pipeline.

"I want the same app on terminal and web"
  -> Add @silvery/ag-exp-web alongside @silvery/ag-term.       (experimental)
  -> Use silvery components (Box/Text), not platform-specific code.
  -> Command code doesn't change.

"I want commands with react-dom (no silvery rendering)"
  -> @silvery/commands + @silvery/impure/react-dom.            (experimental)
  -> Use react-dom for rendering, commands for keymaps/op.
  -> Your own React components, silvery's app architecture.

"I want to swap React for Svelte"
  -> Replace @silvery/ag-react with @silvery/ag-exp-svelte.    (experimental)
  -> Command code doesn't change. Only view components need rewriting.
```

### The gradient within app-level packages

Each step builds on the previous. None requires the next. Stop when you have enough.

| Step         | What you add                | What you get                             | When to adopt                                         |
| ------------ | --------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **Commands** | `{ fn, args? }`, `invoke()` | Testable, discoverable actions           | You want AI/CLI/tests to drive the app                |
| **Keymaps**  | `keymap()`, `when()`        | Declarative input binding with modes     | You have keyboard-heavy interaction                   |
| **Signals**  | `signal()`, `computed()`    | Shared reactive state outside React      | State needed in 2+ components, or outside rendering   |
| **Op**       | `op()`, `apply()`           | Interception, undo, replay               | You need undo, audit logging, or collaboration        |
| **Plugins**  | `pipe()`, `create()`        | Composable app architecture              | You have multiple subsystems or want reusable plugins |
| **Scopes**   | `Scope`, effects as data    | Structured concurrency, testable effects | You have complex async lifecycles                     |

**Signals are optional.** Commands depend only on `@silvery/create` — they work without any signal library. `when()` predicates are plain `() => boolean` functions, not reactive subscriptions. Add `@silvery/signals` when you need reactive state (shared across components, outside rendering, reactive availability in toolbars). The value of app-level packages is what's built on top of the dispatch pipeline (commands, keymaps, op), not any particular state primitive.

### Quick reference

#### Today

| Situation                   | Install                                | Notes                                                                                                                   |
| --------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Terminal app (better Ink)   | `silvery`                              | One install — bundles create + scope + headless + commands + signals + model + ag + ag-react + ag-react/ui + ag-term + theme |
| Terminal app + architecture | `silvery`                              | Already includes model + commands                                                                                       |
| Headless model (AI/tests)   | `@silvery/commands`                    | No rendering, no signal dependency needed. Add @silvery/model if you want model factories                               |

#### Future

| Situation                     | Install                                           | Notes                                 |
| ----------------------------- | ------------------------------------------------- | ------------------------------------- |
| Terminal + web (shared model) | `silvery` + `@silvery/ag-exp-web`                     | Both platforms, one model (experimental) |
| React-dom app with commands   | `@silvery/commands` + `@silvery/impure/react-dom` | Commands + react-dom, no ag (experimental) |
| Svelte web app with commands  | `@silvery/commands` + `@silvery/impure/svelte`    | Commands + svelte, no ag (experimental)    |
| Svelte terminal app           | `@silvery/ag-exp-svelte` + `@silvery/ag-term`     | Ag rendering, swap framework (experimental) |

#### Convenience bundle

| Bundle    | Contains                                                                                                                               | For                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `silvery` | `create` + `scope` + `headless` + `commands` + `signals` + `model` + `ag` + `ag-react` + `ag-react/ui` + `ag-term` + `theme`         | Everything — one install, one import |

## The Operation Spectrum

Every piece of app behavior sits at one of three points. See [architecture-overview.md](../archive/architecture-overview.md#the-operation-spectrum) for full details.

|                     | **op-call**        | **op-as-object**        | **op-as-data**                         |
| ------------------- | ------------------ | ----------------------- | -------------------------------------- |
| Shape               | `setState(n+1)`    | `{ fn() { n() + 1 } }`  | `{ op: "increment", args: { by: 1 } }` |
| Contains functions? | Is a function call | Yes — `fn` is a closure | No — pure JSON                         |
| Serializable?       | No                 | No                      | Yes                                    |
| Established term    | Callbacks (React)  | Command pattern (GoF)   | Actions (Redux/Elm)                    |

**op-call** -> imperative, locked in. **op-as-object** -> decoupled (swap framework/runtime). **op-as-data** -> serializable (undo/replay/persist).

The `op()` proxy bridges op-as-object to op-as-data transparently.

## Portability Dimensions

| Dimension           | What you can swap           | Cost of entry                                                  |
| ------------------- | --------------------------- | -------------------------------------------------------------- |
| **Multi-framework** | React <-> Svelte <-> Solid  | State in signals, not framework hooks                          |
| **Multi-platform**  | Terminal <-> Web <-> Canvas | Components using silvery abstractions, not platform primitives |
| **Multi-runtime**   | Real <-> test <-> AI agent  | Behavior in commands, not inline callbacks                     |
| **Multi-session**   | Undo, replay, persist       | State changes through op(), not direct mutation                |

### Bring-your-own state management

Any state library works with silvery rendering. The tradeoff is which app-level features you can use:

| State library             | Works with commands? | Works with op()? | Multi-framework? |
| ------------------------- | -------------------- | ---------------- | ---------------- |
| No state library          | Yes                  | No               | Yes              |
| Silvery signals (default) | Yes                  | Yes              | Yes              |
| Preact signals            | Yes                  | Yes              | Yes              |
| Zustand                   | Yes                  | No               | No (React hooks) |
| Jotai                     | Yes                  | No               | No (React atoms) |
| Svelte stores             | Yes                  | No               | No (Svelte-only) |
| useState                  | Yes                  | No               | No               |

Commands are fully state-agnostic — they work with any state library or none at all. `when()` predicates are plain `() => boolean` functions; no signal interface required. `op()` requires silvery-compatible signals because it intercepts signal mutations.

**Multi-platform** (terminal <-> web) is orthogonal — all state libraries work on all platforms. The constraint is on behavioral portability: can non-UI consumers drive your state?
