# Silvery Packages

Complete inventory of current and planned packages.

See also: [architecture.md](../design/v10-terminal/architecture.md) | [roadmap.md](roadmap.md)

Some packages are independently useful; most are internal to the silvery stack.

## Package Map

### The Engine (framework-agnostic core)

These packages have zero framework imports. Any reconciler can drive them.

| Package               | npm                 | Status   | Standalone? | What                                                            |
| --------------------- | ------------------- | -------- | ----------- | --------------------------------------------------------------- |
| **@silvery/ag**       | `@silvery/ag`       | Shipping | No          | AgNode tree — structure, props, children. The host tree.        |
| **flexily**           | `flexily`           | Shipping | No          | Pure JS flexbox layout. Yoga-compatible, 2.5x faster, no WASM.  |
| **@silvery/color**    | `@silvery/color`    | Shipping | No          | Color math — hex/RGB/HSL conversion, blending, contrast.        |
| **@silvery/theme**    | `@silvery/theme`    | Shipping | No          | Semantic color tokens, 38 palettes, typography presets.         |
| **@silvery/headless** | `@silvery/headless` | Shipping | Yes         | Pure state machines for UI components (no React, no rendering). |

### Layout Pipeline

Text measurement + display list generation. The bridge between the AgNode tree (with flexily bounds) and rendering targets.

| Package                | npm                  | Status                  | Standalone? | What                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------- | ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pretext**            | `pretext` (external) | Exists (Cheng Lou, MIT) | Yes         | Pure JS text measurement. Canvas measureText as ground truth. `usePretext()` hook for content-aware sizing in react-dom.                                                                                                                                                                                                                                                               |
| **@silvery/ag-layout** | —                    | Planned                 | No          | Silvery's layout pipeline. Internally three modules: (1) **text** -- TextLayoutService, font resolution, measurer backends; (2) **display-list** -- DisplayOp types, display list builder, op metadata, serialization; (3) **layout bridge** -- AgNode traversal, style resolution, Flexily integration, dirty tracking. One npm package initially, but must not become a god-package. |

### Framework Bindings

Reconciler-specific layer. Translates framework updates into AgNode tree mutations.

| Package                | npm                 | Status   | Standalone? | What                                                             |
| ---------------------- | ------------------- | -------- | ----------- | ---------------------------------------------------------------- |
| **@silvery/ag-react**  | `@silvery/ag-react` | Shipping | No          | React 19 reconciler host config. Hooks, concurrent features.     |
| **@silvery/ag-svelte** | —                   | Future   | No          | Svelte binding. Same AgNode mutations, different reactive model. |
| **@silvery/ag-solid**  | —                   | Future   | No          | Solid binding.                                                   |
| **@silvery/ag-vue**    | —                   | Future   | No          | Vue binding.                                                     |

### Rendering Targets (platforms)

Each consumes the display list (or today, the terminal buffer) to produce output.

| Package                 | npm                     | Status                  | Standalone? | What                                                                                                                                                                                                         |
| ----------------------- | ----------------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **@silvery/ag-term**    | `@silvery/ag-term`      | Shipping                | No          | Terminal — ANSI escape sequences, cell grid, incremental diff.                                                                                                                                               |
| **@silvery/ag-canvas**  | (in ag-react/ui/canvas) | Shipping (proportional) | No          | Canvas 2D — pixel rendering via CanvasRenderingContext2D. Pretext proportional text, HiDPI, keyboard/mouse input, 38 UI components. Proven at 1,013 nodes / 35ms.                                            |
| **@silvery/ag-dom-pos** | —                       | Internal/debug          | No          | Pretext-measured layout rendered as positioned DOM elements. Primarily for validating Flexily+Pretext layout and debugging. May serve niche use cases (document-like surfaces where text selection matters). |
| **@silvery/ag-dom**     | —                       | Future                  | No          | DOM standalone — real elements with CSS, browser-native text.                                                                                                                                                |
| **@silvery/ag-a11y**    | —                       | Planned                 | No          | DOM accessibility mirror — invisible semantic elements for canvas apps.                                                                                                                                      |
| **@silvery/ag-svg**     | —                       | Future                  | No          | SVG element output.                                                                                                                                                                                          |
| **@silvery/ag-pdf**     | —                       | Future                  | No          | PDF draw commands (via pdf-lib or similar).                                                                                                                                                                  |
| **@silvery/ag-image**   | —                       | Future                  | No          | OffscreenCanvas → PNG/JPEG for testing, thumbnails, social cards.                                                                                                                                            |
| **@silvery/ag-remote**  | —                       | Future                  | No          | Serialized display ops over WebSocket for remote display.                                                                                                                                                    |

Note: `@silvery/ag-canvas` currently lives inside `@silvery/ag-react` because it needs React for the component tree. Once the display list abstraction exists, it becomes framework-agnostic and gets its own package.

### State & Architecture (tea) — v1.5

App-level architecture on top of the rendering engine. Portable — works with ag, react-dom, or any framework. Design still settling; ships publicly at v1.5. Used internally by km now.

| Package               | npm                 | Status   | Standalone? | What                                                                                                   |
| --------------------- | ------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| **@silvery/tea**      | `@silvery/tea`      | Internal | Yes         | Zustand-based state containers with TEA-shaped updates. Works standalone with react-dom.               |
| **@silvery/signals**  | `@silvery/signals`  | Internal | No          | Reactive signals (alien-signals wrapper). Per-frame visual state.                                      |
| **@silvery/commands** | `@silvery/commands` | Internal | No          | Command registry, keymaps, invocation. Serializable intents.                                           |
| **@silvery/create**   | `@silvery/create`   | Internal | No          | App composition — createApp(), plugin registration, lifecycle.                                         |
| **@silvery/scope**    | `@silvery/scope`    | Internal | No          | Structured concurrency — cancellation, error boundaries, cleanup.                                      |
| **@silvery/model**    | `@silvery/model`    | Internal | No          | Optional DI model factories for silvery apps. Design TBD — see km-silvery.tea bead for open questions. |

### Editing (on top of silvery-tea)

Document and text editing built ON TOP of the state/command layer, not at the ag level. These packages use silvery-tea's commands, signals, and scope for undo, keybindings, and lifecycle. They consume TextLayoutService geometry for cursor positioning and text interaction, but don't know about rendering.

| Package     | npm       | Status | Standalone? | What                                                                                                                                                                      |
| ----------- | --------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **textily** | `textily` | Future | No          | Rich text editing — cursor, selection, IME, text operations. Uses ag-layout geometry for wrap-aware navigation.                                                           |
| **docily**  | `docily`  | Future | No          | Document editing engine — ID-based tree model, serializable ops (TreeOp, PlainTextOp), command system, undo/redo, CRDT-ready. Plugin composition via `.apply()` wrapping. |

textily is the character-level layer (what the cursor does). docily is the document-level layer (what the structure does). Both are platform-agnostic — the rendering stack draws the result, the silvery-tea layer handles commands and state.

```
     docily (document model, ops, undo)
        ↓ uses
     textily (cursor, selection, text ops)
        ↓ uses
     @silvery/ag-layout + pretext (measurement, hit-test, caret geometry)
        ↓ plugs into
     @silvery/commands + @silvery/signals + @silvery/scope (keybindings, reactive state, lifecycle)
```

### Components & UI

High-level components built with the engine and framework bindings.

| Package          | npm            | Status   | Standalone? | What                                                                                        |
| ---------------- | -------------- | -------- | ----------- | ------------------------------------------------------------------------------------------- |
| **silvery**      | `silvery`      | Shipping | Yes         | 30+ components: SelectList, TextInput, VirtualList, ProgressBar, Spinner, etc. React-based. |
| **@silvery/ink** | `@silvery/ink` | Shipping | No          | Ink + Chalk API compatibility layer. Migration path from Ink.                               |

### Terminal Primitives

| Package           | npm             | Status   | Standalone? | What                                                                           |
| ----------------- | --------------- | -------- | ----------- | ------------------------------------------------------------------------------ |
| **@silvery/ansi** | `@silvery/ansi` | Shipping | No          | Everything terminal — ANSI escape codes, SGR, color detection, grapheme width. |

### Infrastructure

| Package                | npm                  | Status   | Standalone? | What                                                             |
| ---------------------- | -------------------- | -------- | ----------- | ---------------------------------------------------------------- |
| **@silvery/test**      | `@silvery/test`      | Shipping | No          | Testing — virtual renderer, locators, DeterministicTestMeasurer. |
| **@silvery/examples**  | `@silvery/examples`  | Shipping | No          | Example apps and component demos (`bunx @silvery/examples`).     |
| **@silvery/commander** | `@silvery/commander` | Shipping | No          | Colorized Commander.js help output.                              |
| **loggily**            | `loggily`            | Shipping | No          | Structured logging with debug-style namespaces.                  |

### External Dependencies (key to the stack)

| Package                 | Role                    | Relationship                         |
| ----------------------- | ----------------------- | ------------------------------------ |
| **pretext** (Cheng Lou) | Text measurement oracle | Consumed by @silvery/ag-layout. MIT. |
| **alien-signals**       | Reactive primitives     | Wrapped by @silvery/signals.         |
| **zustand**             | State containers        | Used by @silvery/tea.                |
| **react-reconciler**    | React host config       | Used by @silvery/ag-react.           |

## Package Dependency Flow

```
     silvery (components)                docily → textily
        ↓                                    ↓
     @silvery/ag-react (reconciler)    @silvery/commands + signals + scope
        ↓                                    ↓
     @silvery/ag (node tree)           @silvery/tea (state)
        ↓                                    ↓
     @silvery/ag-layout ←── flexily    ag-layout ──→ pretext
     (measurers + display list)
        ↓
     ag-term | ag-canvas | ag-dom | ag-svg | ag-pdf | ...
```

Left side: rendering pipeline (framework -> engine -> surface).
Right side: editing pipeline (document -> text -> measurement).
They meet at ag-layout (text measurement + paint generation).
