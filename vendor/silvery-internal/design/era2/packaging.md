# Packaging Model

> **Partially superseded (2026-03-19).** The package naming has evolved. "Silver Platter" is now **Ag** (`@silvery/ag-*`). "Silvertea" package structure is now `@silvery/create` + `@silvery/scope` + `@silvery/signal` + `@silvery/model` + `@silvery/commands`. See [00-architecture.md](./00-architecture.md) § Dependency Graph for the current package structure.

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
| `@silvery/tea`    | TEA state machine store (zustand-based)         |
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
@silvery/ag                abstract nodes · headless state machines
@silvery/ag-react          React adapter/reconciler + React component library
@silvery/ag-svelte         Svelte adapter + Svelte components          (future)
@silvery/ag-term           terminal platform (ANSI, flexily)
@silvery/ag-web            web platform (CSS, DOM mapping)             (future)
@silvery/ag-canvas         canvas platform (draw calls)                (future)
@silvery/ag-ui             30+ React components (SelectList, TextInput, etc.)
@silvery/ag-theme          theme tokens (semantic colors, palettes)

App-level packages (independent of ag rendering)
─────────────────────────────────────────────────
@silvery/create            dispatch · apply · pipe (zero deps)
@silvery/scope             structured concurrency (zero deps)
@silvery/signal            signal · computed · effect · batch (alien-signals)
@silvery/model             model factories with explicit DI (signal)
@silvery/commands          command system · keymaps (create, signal, scope)

Impure (native framework bridges — no ag)
─────────────────────────────────────────
@silvery/impure
  /react-dom               react-dom rendered components + adapter  (future)
  /svelte                  Svelte adapter + Svelte components       (future)

Convenience bundle
──────────────────
silvery = create + scope + signal + model + commands + ag + ag-react + ag-term + ag-ui + ag-theme
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

The abstract rendering contract and headless component state machines. Independent of any framework or platform.

- **Abstract node types**: Box, Text — data descriptions of UI with typed props (flexDirection, color, overflow, gap, padding, etc.)
- **Headless component state machines**: SelectListState, TextInputState, VirtualListState — pure `(action, state) -> state` logic for keyboard handling, selection, scrolling
- **Signal primitives**: `signal()`, `computed()`, `effect()`, `batch()` via alien-signals + `createStore()`, `createResource()`, `Readable<T>` — shared substrate for both rendering and app-level packages. See `@silvery/signal` in [02-signals.md](./02-signals.md)
- **Pipeline interface**: rendering capabilities that platforms implement
- **Theme tokens**: semantic colors ($primary, $muted, $border), palette abstraction — in separate `@silvery/ag-theme`

**Rendering capabilities, not pipeline stages.** Ag defines **rendering capabilities** that platforms provide: layout computation, mutation application, output generation, and measurement feedback:

- @silvery/ag-term implements all capabilities: flexily for layout, ANSI buffer for diff/output
- @silvery/ag-web provides mapping and normalization: node types -> DOM elements, props -> CSS, input -> normalized events. Frameworks use their native DOM capabilities for reconciliation (react-dom, Svelte compiler, Solid runtime). No silvery-owned diff or layout phase — the browser handles both.
- @silvery/ag-canvas implements layout via flexily, output via draw calls

Ag is thin — types, interfaces, state machines, and shared utilities. Heavy lifting is in the platform packages.

**Host protocol.** The minimal contract between frameworks and platforms for terminal rendering:

- `createNode(type, props) -> NodeHandle` — create an abstract node
- `updateNode(handle, oldProps, newProps)` — update properties
- `removeNode(handle)` — remove from tree
- `insertChild(parent, child, index)` — tree structure
- `commitBatch()` — signal end of update (triggers layout + render)

This is what `react-reconciler` calls into on terminal. On web, frameworks use their native DOM operations instead, with `@silvery/ag-web` providing the prop/style mapping layer.

### The Component Story: Three Layers

Every component exists in up to three layers. Each layer is a separate package with a clear dependency direction.

**Layer 1 — Headless state machine** (pure JS, one per component, universal):

```
@silvery/ag         ->  SelectListState, TextInputState, VirtualListState
@silvery/commands   ->  CommandPaletteState, SheetState, ToastState
```

**Layer 2 — Framework bindings** (one per framework, renderer-agnostic):

```
@silvery/ag-react          ->  React adapter/reconciler: turns JSX into abstract nodes
@silvery/ag-svelte         ->  Svelte compiler adapter (future)
@silvery/commands/react    ->  useCommand, useCommandPalette hooks
@silvery/impure/svelte     ->  Svelte stores/runes for commands (future)
```

**Layer 3 — Rendered components** (one per framework x renderer):

```
                          Ag (abstract nodes)         DOM (native)
                          ─────────────────────────   ────────────
React                     ag-react / ag-ui            (react-dom — not ours)
                                                      impure/react-dom

Svelte                    ag-svelte                   (native Svelte — not ours)
                                                      impure/svelte (future)

Solid                     ag-solid (future)           (native Solid — not ours)
```

**Per-component count today: 2** — one headless state machine + one rendered React component. Not a combinatorial explosion. Rendered components target abstract nodes (Box, Text), which work on ALL platforms (terminal, web, canvas). The platform layer below handles output — components don't multiply per platform.

**What each rendered package contains:**

| Package            | Components                                                     | Surface adapter               | Deps                        |
| ------------------ | -------------------------------------------------------------- | ----------------------------- | --------------------------- |
| ag-react / ag-ui   | SelectList, TextInput, VirtualList... using Box/Text           | React adapter/reconciler      | ag, react                   |
| impure/react-dom   | CommandPalette, Sheet, Toast... using div/input                | withBrowser()                 | commands/react, react-dom   |

**"Native framework without silvery" users** (Svelte, Solid developers who don't want ag rendering) get headless state machines + framework bindings. They bring their own visual layer. We pre-build rendered components for ag and react-dom targets.

This follows the React Aria / Headless UI pattern: behavior is framework-agnostic, rendering is framework-specific.

### @silvery/ag-react — React Framework Adapter

React framework adapter that creates silvery abstract nodes from JSX, plus the full React component library.

- Uses `react-reconciler` to bridge React -> abstract nodes
- Provides React-specific hooks: `useContentRect()`, `useFocus()` (platform-specific hooks like `useTerminalFocused()` live in `@silvery/ag-term`)
- Provides signal bridge: `useSignal()` (wraps `useSyncExternalStore`)
- **React component library**: SelectList, TextInput, VirtualList, ProgressBar, ScrollView, etc. — React wrappers around headless state machines from @silvery/ag

Virtual DOM based — React diffs the component tree to determine what nodes changed.

### @silvery/ag-svelte — Svelte Framework Adapter (future)

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

### @silvery/ag-web — Web Platform (future)

Maps silvery abstractions to native DOM rendering. Unlike terminal (where the platform owns the full render pipeline), web leverages the browser's native layout, diffing, and rendering.

- **Node mapping**: Box -> `<div>`, Text -> `<span>` with CSS flex properties
- **Prop translation**: silvery props (flexDirection, gap, padding) -> CSS styles; theme tokens -> CSS custom properties
- **Input normalization**: DOM `KeyboardEvent`/`PointerEvent` -> normalized key strings + typed input events
- **Theme**: CSS custom properties (`--silvery-primary`, etc.)
- **Accessibility**: semantic props (role, aria-\*) pass through to DOM attributes

**Architecture difference from terminal.** On terminal, all frameworks produce abstract nodes and the platform renders them through its own pipeline (flexily -> ANSI). On web, frameworks use their native DOM capabilities — React uses react-dom, Svelte compiles to DOM operations, Solid uses fine-grained DOM updates. `@silvery/ag-web` provides the mapping layer (which DOM elements, which CSS properties, which event normalization) but does not own a reconciler. This means web rendering requires a **framework-specific integration** — it is not fully orthogonal the way terminal is.

See [composability.md](./composability.md) for the full gap analysis and tradeoff discussion.

### App-Level Packages (@silvery/create, signal, scope, model, commands)

The app-level packages replace and expand the old `@silvery/tea`. Framework-agnostic, platform-agnostic. Split across focused packages:

- **@silvery/create** — `create()`, `dispatch()`, `apply()`, `pipe()` — zero-dep dispatch pipeline
- **@silvery/scope** — `createScope()`, `withScope()`, `currentScope()` — structured concurrency (zero deps)
- **@silvery/signal** — `signal()`, `computed()`, `effect()`, `batch()` via alien-signals + `createStore()`, `createResource()`, subpath `/react` for `useSignal()`
- **@silvery/model** — `createModel()`, `ModelContext` — model factories with explicit DI (depends on signal)
- **@silvery/commands** — **Command** `{ fn, args? }`, **invoke()**, **canInvoke()**, **available()**, **keymap()**, **when()**, **Mapping\<E\>** — command system + declarative input mapping (depends on create, signal, scope). Subpath `/react` for `useCommand()`, `useKeymap()` hooks.
- _Future_: **Effects as data** (`AsyncEffect<T>`) — pure, testable side effects via typed descriptors
- **Headless app component state machines**: CommandPaletteState, SheetState, ToastState, TabGroupState

**Zero dependencies on silvery rendering.** App-level packages are pure state + behavior. This is what enables headless operation — an AI agent or test harness uses them alone, with no rendering packages.

**Depends on a `Readable<T>` interface (`{ (): T, subscribe }`)** — any signal library that matches this shape works. `@silvery/signal` ships the default implementation; Preact signals match natively; others adapt via thin wrappers. The `Readable<T>` interface is the shared substrate between silvery rendering and app-level packages, not any particular package.

**Mapping\<E\> is generic, but keymaps use `Mapping<string>`.** `keymap()` returns `Mapping<string>` — the event type is a normalized key string. Each surface adapter converts platform-specific events (terminal escape sequences, DOM `KeyboardEvent`s) to this normalized form BEFORE reaching the keymap. Commands never see platform-specific types.

### @silvery/commands/react — React Bindings for Commands

React-specific hooks and headless React wrappers for the command system. Framework binding layer — renderer-agnostic.

- `useCommand()`, `useKeymap()` — React hooks for command primitives
- Headless React component wrappers (useCommandPalette, etc.)

Used by BOTH ag-ui (silvery rendering) AND impure/react-dom (react-dom rendering). This is the shared React layer.

### @silvery/impure/react-dom — React-DOM Components (future)

App-level components rendered with native DOM elements for react-dom apps that don't use silvery rendering.

- **Rendered components**: CommandPalette, Sheet, Toast, etc. — built with div/input/ul
- **Surface adapter**: `withBrowser()` (DOM events -> keymap -> dispatch -> react-dom rendering)
- **Styles**: CSS for components
- Depends on: commands/react, react-dom

### @silvery/impure/svelte — Svelte Adapter (future)

Svelte bindings for signals and commands, plus Svelte component wrappers.

**Impure bridges connect app-level packages to framework+platforms.** Summary:

| Adapter                    | Surface plugin    | Rendered components | Rendering       |
| -------------------------- | ----------------- | ------------------- | --------------- |
| `@silvery/impure/react-dom`| `withBrowser()`   | DOM elements        | react-dom       |
| `@silvery/impure/svelte`   | `withBrowser()`   | Svelte components   | Svelte compiler |

Silvery ag is one rendering option among many. The impure bridges serve users who want the app architecture without ag rendering.

### Convenience Bundle

All packages live under `@silvery/*`. One bare package is the user-facing product:

**`silvery`** — Ink replacement. Re-exports `@silvery/create` + `@silvery/scope` + `@silvery/signal` + `@silvery/model` + `@silvery/commands` + `@silvery/ag` + `@silvery/ag-react` + `@silvery/ag-term` + `@silvery/ag-ui` + `@silvery/ag-theme`:

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

| @silvery/tea (current, zustand) | New package                      | Change                                              |
| ------------------------------- | -------------------------------- | --------------------------------------------------- |
| `createSlice()`                 | `createModel()` (@silvery/model) | Factory receives `ModelContext` with explicit scope |
| `store.apply({ op })`           | `op(model).method()`             | Proxy-based, same types/autocomplete                |
| `useStore(selector)`            | `useSignal(signal)`              | Fine-grained (per-signal) vs coarse (selector)      |
| Zustand store                   | signals + methods                | No store wrapper — signals ARE the state            |
| `createEffects()`               | Same (kept)                      | —                                                   |
| —                               | `keymap()`, `when()`, `invoke()` (@silvery/commands) | New: input mapping system        |
| —                               | `Scope`, structured concurrency (@silvery/scope) | New: explicit lifecycle               |
| —                               | `op()`, `apply()` (@silvery/commands) | New: interception pipeline            |

## Dependency Graph

```
Foundation:
  @silvery/create                         (zero deps — create, dispatch, apply)
  @silvery/scope                          (zero deps — withScope, createScope, currentScope)
  @silvery/signal                         (alien-signals + alien-deepsignals)
    +-- core: signal, computed, effect, batch  (re-export alien-signals, ~1.8KB)
    +-- createStore()                     deep reactive proxy (alien-deepsignals, ~2.7KB)
    +-- createResource()                  async signal bridge (scope-integrated)
    +-- /react                            useSignal(), model selectors (peer: react)

App (app architecture):
  @silvery/model                          (signal)
    +-- /react                            (signal/react, peer: react)
  @silvery/commands                       (create, signal, scope)
    +-- /react                            (signal/react, peer: react)

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
    +-- /react-dom                        (create, scope, commands, peer: react, react-dom)
    +-- /svelte                           (create, scope, commands, peer: svelte — future)

Bundles:
  silvery                                 create + scope + signal + model + commands + ag + ag-react + ag-term + ag-ui + ag-theme
```

**The `Readable<T>` interface is the shared substrate.** Both silvery rendering (`useSignal()` in signal/react) and app-level packages (commands, keymaps, op) depend on the `Readable<T>` shape (`{ (): T, subscribe }`). `@silvery/signal` ships the default implementation (`signal()`, `computed()`), but commands do not depend on signal — any signal library that matches the interface works (Preact signals natively, others via thin wrappers).

**Impure bridges are the integration points.** Each impure package bridges the command system to a specific framework+renderer:

| Package                     | Surface adapter   | Rendered components | Deps                       |
| --------------------------- | ----------------- | ------------------- | -------------------------- |
| `@silvery/impure/react-dom` | `withBrowser()`   | DOM elements        | commands/react, react-dom  |
| `@silvery/impure/svelte`    | `withBrowser()`   | Svelte components   | commands, svelte           |

## What Should I Use?

Two product groups, one gradient. Start with what you need, go deeper when the pain hits.

### The two product groups

**Silvery** (`silvery`) — Polished terminal UIs in React. Cross-framework, cross-platform rendering via abstract nodes. 100x+ faster than Ink. Responsive flexbox layouts, scrollable containers, 30+ components.

**App-level packages** (`@silvery/model`, `@silvery/commands`, etc.) — App framework for command-centric apps. Commands, keymaps, op(), plugins, structured concurrency. Works with silvery ag, react-dom, Svelte, React Native, or headless — ag is one rendering option among many.

### Decision tree

```
"I want to build a terminal app"
  -> `silvery` (bundles create + scope + signal + model + commands + ag + ag-react + ag-term + ag-ui + ag-theme)
  -> Use useState, zustand, jotai, whatever you like for state.
  -> Done. This is the 80% case.

"My app's state is getting tangled across components"
  -> The `silvery` bundle already includes model + commands.
  -> Use signal() to share state outside React.
  -> Or keep zustand — commands work with any signal-shaped state.

"I want AI, tests, or CLI to drive my app without rendering"
  -> @silvery/commands + @silvery/model alone (no rendering packages)
  -> Add commands: { fn, args? } objects.
  -> invoke() from anywhere — same code path as keyboard input.

"I want vim-style keybindings, modes, chords"
  -> @silvery/commands: keymap() + when() on top of commands.
  -> Keymaps are data — declarative bindings with mode predicates.

"I want undo/replay/recording"
  -> Route state changes through op().
  -> op() captures method calls as serializable records for replay.

"My app has multiple subsystems that need to compose"
  -> pipe() + plugins. Each plugin adds model state,
    commands, providers, or wraps the interception pipeline.

"I want the same app on terminal and web"
  -> Add @silvery/ag-web alongside @silvery/ag-term.
  -> Use silvery components (Box/Text), not platform-specific code.
  -> Command code doesn't change.

"I want commands with react-dom (no silvery rendering)"
  -> @silvery/commands + @silvery/impure/react-dom.
  -> Use react-dom for rendering, commands for keymaps/op.
  -> Your own React components, silvery's app architecture.

"I want to swap React for Svelte"
  -> Replace @silvery/ag-react with @silvery/ag-svelte.
  -> Command code doesn't change. Only view components need rewriting.
```

### The gradient within app-level packages

Each step builds on the previous. None requires the next. Stop when you have enough.

| Step         | What you add                | What you get                             | When to adopt                                         |
| ------------ | --------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **Signals**  | `signal()`, `computed()`    | Shared state outside React               | State needed in 2+ components, or outside rendering   |
| **Commands** | `{ fn, args? }`, `invoke()` | Testable, discoverable actions           | You want AI/CLI/tests to drive the app                |
| **Keymaps**  | `keymap()`, `when()`        | Declarative input binding with modes     | You have keyboard-heavy interaction                   |
| **Op**       | `op()`, `apply()`           | Interception, undo, replay               | You need undo, audit logging, or collaboration        |
| **Plugins**  | `pipe()`, `create()`        | Composable app architecture              | You have multiple subsystems or want reusable plugins |
| **Scopes**   | `Scope`, effects as data    | Structured concurrency, testable effects | You have complex async lifecycles                     |

**Signals are pluggable.** The command system depends on a `Readable<T>` interface (`{ (): T, subscribe }`) — not on any package. `@silvery/signal` ships the default implementation, but you can use Preact signals, wrap Solid signals, or adapt anything with a synchronous `()` getter and a `subscribe()`. The value of app-level packages is what's built ON TOP of signals (commands, keymaps, op), not the signal primitive itself.

### Quick reference

#### Today

| Situation                   | Install                 | Notes                                                                              |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Terminal app (better Ink)   | `silvery`               | One install — bundles create + scope + signal + model + commands + ag + ag-react + ag-term + ag-ui + ag-theme |
| Terminal app + architecture | `silvery`               | Already includes model + commands                                                  |
| Headless model (AI/tests)   | `@silvery/commands` + `@silvery/model` | No rendering, no surface adapter needed                          |

#### Future

| Situation                     | Install                                                         | Notes                                 |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Terminal + web (shared model) | `silvery` + `@silvery/ag-web`                                   | Both platforms, one model             |
| React-dom app with commands   | `@silvery/commands` + `@silvery/impure/react-dom`               | Commands + react-dom, no ag rendering |
| Svelte web app with commands  | `@silvery/commands` + `@silvery/impure/svelte`                  | Commands + svelte, no ag rendering    |
| Svelte terminal app           | `@silvery/ag-svelte` + `@silvery/ag-term`                       | Ag rendering, swap framework          |

#### Convenience bundle

| Bundle      | Contains                                                                                                    | For                                |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `silvery`   | `create` + `scope` + `signal` + `model` + `commands` + `ag` + `ag-react` + `ag-term` + `ag-ui` + `ag-theme` | Everything — one install, one import |

## The Operation Spectrum

Every piece of app behavior sits at one of three points. See [architecture-overview.md](../archive/architecture-overview.md#the-operation-spectrum) for full details.

|                     | **op-call**        | **op-as-object**         | **op-as-data**                         |
| ------------------- | ------------------ | ------------------------ | -------------------------------------- |
| Shape               | `setState(n+1)`    | `{ fn() { n() + 1 } }`  | `{ op: "increment", args: { by: 1 } }` |
| Contains functions? | Is a function call | Yes — `fn` is a closure  | No — pure JSON                         |
| Serializable?       | No                 | No                       | Yes                                    |
| Established term    | Callbacks (React)  | Command pattern (GoF)    | Actions (Redux/Elm)                    |

**op-call** -> imperative, locked in. **op-as-object** -> decoupled (swap framework/runtime). **op-as-data** -> serializable (undo/replay/persist).

The `op()` proxy bridges op-as-object to op-as-data transparently.

## Portability Dimensions

| Dimension           | What you can swap       | Cost of entry                                                  |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| **Multi-framework** | React <-> Svelte <-> Solid  | State in signals, not framework hooks                      |
| **Multi-platform**  | Terminal <-> Web <-> Canvas | Components using silvery abstractions, not platform primitives |
| **Multi-runtime**   | Real <-> test <-> AI agent  | Behavior in commands, not inline callbacks                 |
| **Multi-session**   | Undo, replay, persist   | State changes through op(), not direct mutation                |

### Bring-your-own state management

Any state library works with silvery rendering. The tradeoff is which app-level features you can use:

| State library            | Works with commands? | Works with op()? | Multi-framework? |
| ------------------------ | -------------------- | ---------------- | ---------------- |
| Silvery signals (default)| Yes                  | Yes              | Yes              |
| Preact signals           | Yes (same shape)     | Yes              | Yes              |
| Zustand                  | Via adapter           | No               | No (React hooks) |
| Jotai                    | Via adapter           | No               | No (React atoms) |
| Svelte stores            | Via adapter           | No               | No (Svelte-only) |
| useState                 | No                   | No               | No               |

Commands need `Readable<T>` signals for args schema defaults and availability detection. If your state library exposes `{ (): T, subscribe }`, it works natively. If not, a thin adapter bridges the gap. `op()` requires silvery-compatible signals because it intercepts signal mutations.

**Multi-platform** (terminal <-> web) is orthogonal — all state libraries work on all platforms. The constraint is on behavioral portability: can non-UI consumers drive your state?
