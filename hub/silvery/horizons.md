# Silvery Horizons

Silvery is a suite of packages, not one library. What "Silvery" means evolves across horizons.

Two subsystems, both called Silvery:

- **Rendering engine**: flexily (layout) → pretext (text measurement) → ag (scene graph) → rendering targets (terminal, canvas, ...)
- **App architecture (tea)**: signals, commands, scopes, headless state machines — portable, works with ag OR react-dom OR anything

## v0.5 — Composable Layout Engine

> "The layout engine your canvas app is missing"

**Audience**: Konva, PixiJS, Two.js, tldraw developers — anyone doing custom rendering who needs layout + text.

**What ships**: Flexily becomes composable via `pipe()` plugin architecture. Pretext integration is a plugin. No silvery dependency required.

```typescript
import { createFlexily } from "flexily" // batteries-included (monospace)
import { createBareFlexily, pipe, withPretext } from "flexily" // compose your own

// Most users — just works
const flex = createFlexily()
const node = flex.createNode()
node.setTextContent("Hello world")

// Power user — compose plugins explicitly
const flex = pipe(createBareFlexily(), withPretext(pretext))

// Low-level — Yoga-compatible MeasureFunc always available
node.setMeasureFunc((width, widthMode, height, heightMode) => ({ width: 100, height: 20 }))
```

**Key packages**: flexily, pretext (external, Cheng Lou)

**Strategy**: Ship the composable architecture + a canvas prototype showing proportional text with shrinkwrap (content-aware sizing impossible in CSS). The prototype IS the outreach — runnable demo, blog post, proof that flexily+pretext works on canvas. Validates v2.0 before committing to the full engine.

**Status**: Code shipped, docs/launch remaining. Composable architecture shipped (v0.5.0). Canvas prototype working — proportional text via Pretext, 1,013 nodes in 35ms, full km kanban board rendering via WebSocket. `createFlexily`, `createBareFlexily`, `pipe`, `TextLayoutService` with MonospaceMeasurer + DeterministicTestMeasurer + PretextMeasurer adapter. FlexilyNode = Node + text mixin (no wrapper).

**Remaining for v0.5** (see [launch/launch-strategy.md](launch/launch-strategy.md)):

1. **Launch 1: Flexily standalone** — polish flexily.dev, docs, benchmarks, npm publish, HN "Show HN" (Yoga replacement story)
2. **Launch 2: Silvery + Pretext** — silvery canvas demo (same Board in terminal + canvas), blog post "The layout engine your canvas app is missing", silvery.dev interactive demos, Cheng Lou outreach, HN "Show HN" (multi-surface React story)
3. Standalone canvas examples (not km-dependent) for both launches

**Beads**: `bd list --label horizon:v0.5` — km-silvery.demos, km-silvery.docs-reorg

**Design docs**: [design/v05-layout/](design/v05-layout/)

## v1.0 — Terminal UI Framework (tealess)

> "React for terminals, done right"

**Audience**: CLI/TUI developers, Ink users migrating to a faster, more capable framework.

**What ships**: The renderer story, polished. 30+ React components, themes, focus management, virtualization, Flexily layout, keyboard interaction, Ink compatibility layer. No tea — use any React state management (useState, Zustand, Jotai, etc.).

```typescript
import { render, Box, Text, SelectList, TextInput } from "silvery"

render(<App />).run()  // that's it — no tea required
```

**Key packages**: @silvery/ag, @silvery/ag-react, @silvery/ag-term, silvery (components), @silvery/theme, @silvery/color, @silvery/ansi

**Strategy**: Polish what's shipping without tea. The renderer + components are excellent on their own. Extension to Svelte/Solid/Vue bindings (ag engine is framework-agnostic). ag incrementally refactored toward scene-ready shape. Tea design is still settling — don't ship it until it's right.

**Docs/launch**: silvery.dev guide (getting started, components, theme, hooks), npm publish, migration guide from Ink, example apps, README with before/after vs Ink.

**Beads**: `bd list --label horizon:v1.0` — 17 open (2 P1 bugs, 10 P2 features, 5 P3 infra)

**Design docs**: [design/v10-terminal/](design/v10-terminal/)

## v1.5 — App Architecture (tea)

> "State management and commands that work everywhere Silvery renders — and beyond"

**Audience**: Silvery app developers who want structured state, discoverable commands, and testable architecture. Also usable with react-dom — tea doesn't depend on ag.

**What ships**: Polished, documented app architecture layer. Signals for reactive state. Commands for discoverable, automatable actions. Scopes for structured concurrency. Headless state machines for framework-agnostic component logic. Plugin composition via `pipe()`.

```typescript
// With ag (terminal/canvas)
const app = pipe(createFlexily(), withFlexbox(), withPretext(), withAg(), withTea())

// With react-dom (web) — tea works without ag
const app = pipe(withSignals(), withCommands(), withScopes())
```

**Key packages**: @silvery/tea, @silvery/signals, @silvery/commands, @silvery/scope, @silvery/headless, @silvery/create

**Strategy**: Tea is the app architecture that makes silvery apps testable, automatable, and AI-native. It's independently useful — a react-dom app can use tea's signals and commands without ag. This is the bridge: tea proves the architecture is portable before v2 brings it to canvas.

**Docs/launch**: silvery.dev tea guide, API reference for signals/commands/scopes, example apps (standalone react-dom + silvery terminal), migration guide from useState/Zustand to tea.

**Beads**: `bd list --label horizon:v1.5` — km-silvery.tea (epic), virtual-terminal, zero-alloc, ai-apis

**Design docs**: [design/v15-tea/signals.md](design/v15-tea/signals.md), [design/v15-tea/commands.md](design/v15-tea/commands.md), [design/v15-tea/app.md](design/v15-tea/app.md), [design/v15-tea/headless.md](design/v15-tea/headless.md)

## v2.0 — Embeddable Layout + Text Engine

> "Yoga for 2D canvas"

**Audience**: Canvas app developers who need proportional text, layout, and multi-surface rendering.

**What ships**: Flexily+Pretext proven by external adoption (v0.5). Silvery gains proportional text on canvas — same components render with real typography. Display list abstraction enables multi-surface output.

**Key packages**: + @silvery/ag-canvas (proportional), @silvery/ag-layout (display list, measurers)

**Strategy**: The embedding story. Canvas apps adopt flexily for layout+text. Silvery components render on canvas with full typography. Display list enables rendering to Canvas2D, SVG, and other surfaces.

**Status**: Proportional canvas rendering works (shipped in ag-react/ui/canvas). `renderToCanvas()` renders React components to Canvas2D with Pretext proportional text, HiDPI scaling, keyboard/mouse input, focus management, and 38 re-exported UI components. Proven at scale with km (1,013 nodes, 35ms). Remaining: extract to standalone `@silvery/ag-canvas` package, display list abstraction, render-neutral component architecture (PlatformServices). See `km/docs/design/render-neutral-tui.md` for the detailed plan.

**What works now** (in `@silvery/ag-react/ui/canvas`):

- `renderToCanvas(element, canvas, options)` — full React component rendering on Canvas2D
- Pretext + DOM measurer for proportional text
- Keyboard input via hidden textarea (useInput works)
- Mouse events (click, hover, wheel) via CanvasMouseEvent
- Focus management (Tab/Shift+Tab/Escape cycling)
- HiDPI rendering via DPR scaling
- 38 of 40 silvery UI components canvas-safe (only ScrollbackList/ScrollbackView are terminal-only)

**What's next**:

- Render-neutral components: PlatformServices injection into createApp() so terminal and canvas share one component tree
- RectRegistry: shared hit testing for both keyboard spatial nav and mouse click
- DOM overlay for text editing (IME, clipboard, accessibility)
- Extract to standalone @silvery/ag-canvas package

**Docs/launch**: silvery.dev canvas guide, standalone canvas examples (not km-dependent), "Yoga for 2D canvas" blog post, flexily+pretext demo page, npm publish @silvery/ag-canvas.

**Speculative: signals engine** — if canvas profiling shows the tree-walk pipeline as bottleneck, the rendering engine itself could become signal-based (layout dimensions, cell content, output all as computed signals). Pattern proven by km's reactive-graph.ts. Design doc: [design/v20-canvas/signals-engine.md](design/v20-canvas/signals-engine.md). Bead: km-silvery.signals-engine (P4).

**Beads**: `bd list --label horizon:v2.0` — km-silvery.ag-canvas (epic), shared-components, ag-scene-ready, engine, km-silvery.signals-engine (speculative)

**Design docs**: [design/v20-canvas/](design/v20-canvas/)

## v3.0 — Graphics UI Engine

> "Build Google Docs-class apps"

**Audience**: Enterprise app builders, custom-rendered editor developers.

**What ships**: Own scene graph (ag-draw), own drawing, own interaction. Rich rendering: paths, gradients, shadows, connectors, compositing. Full surface matrix: Canvas2D, WebGL, SVG, PDF. DOM accessibility mirror. Owned interaction primitives: DnD, selection, focus, gestures.

```typescript
const app = pipe(
  createFlexily(),
  withFlexbox(),
  withPretext(),
  withAg(), // scene graph
  withDraw(), // paths, gradients, compositing, display list
  withTea(), // commands, signals, interaction
)
```

**Key packages**: + @silvery/ag-draw, @silvery/ag-a11y, @silvery/ag-svg, @silvery/ag-pdf, @silvery/ag-image, @silvery/ag-remote

**Strategy**: Three approaches, all compatible:

- **A. Own scene graph, target drawing libs as backends.** Display list -> Canvas2D / PixiJS / WebGL. Maximum control.
- **B. API familiar to existing drawing libs.** Ink++ pattern — similar API to Konva/PixiJS, better engine.
- **C. Embeddable in existing drawing libs.** Konva/Pixi apps embed silvery layout+text as a node.

**Docs/launch**: Full silvery.dev rewrite, reference architecture guide, production app showcase (km web), comparison benchmarks vs Konva/PixiJS, accessibility guide.

**Beads**: `bd list --label horizon:v3.0` — none yet (future)

**Design docs**: [design/v30-graphics/](design/v30-graphics/)

## Tea and the Rendering Engine

**The rendering engine never depends on tea.** The pipeline (flexily → ag → display list → rendering targets) is pure — input in, pixels out. Tea (signals, commands, scopes) is about _what_ happens in the app, not _how_ it renders.

**Interaction primitives are scene-graph level, not tea level.** DnD, selection, focus state machines consume pointer events and produce commands — they're surface-agnostic state machines that live at the ag/ag-draw layer. Tea consumes their output (commands) but doesn't own their implementation.

**Tea is the opinionated app architecture — optional but recommended for full apps.** For v2.0 (canvas devs embedding layout), tea is optional — they have their own state. For v3.0 (building Google Docs-class apps), tea is the recommended path — commands, undo, AI mode all flow through it. But the rendering engine works without it at every horizon.

**Open question**: Should tea be pluggable (define interfaces that tea implements, allowing alternatives) or prescribed (tea IS the app layer, like React IS the reconciler)? The composable `pipe()` architecture suggests pluggable — `withTea()` is one plugin, someone could write `withMobX()` or `withRedux()`. But the value of tea is the integrated story (commands → AI mode → undo → collaboration), which only works if everyone speaks the same protocol.

## Undecided

Features with designs but no assigned horizon yet.

| Feature                                  | Doc                                                                            | Likely Horizon |
| ---------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| Windowing (focus, tabs, panes, overlays) | [design/v-undecided/windowing.md](design/v-undecided/windowing.md)             | v1.x–v2.0      |
| Virtual columns (2D virtualization)      | [design/v-undecided/virtual-columns.md](design/v-undecided/virtual-columns.md) | v1.x           |
| DOM-like render API                      | [design/v-undecided/dom-api.md](design/v-undecided/dom-api.md)                 | v2.0           |
| AI mode (agents driving apps)            | [design/v-undecided/ai-mode.md](design/v-undecided/ai-mode.md)                 | v3.0+          |

## Package Evolution

| Package                  | v0.5               | v1.0                            | v1.5 (tea) | v2.0                    | v3.0                          |
| ------------------------ | ------------------ | ------------------------------- | ---------- | ----------------------- | ----------------------------- |
| **flexily**              | Composable plugins | Layout engine                   | —          | Proven                  | Proven                        |
| **pretext**              | Peer dep           | Text measurement                | —          | Proportional            | Proportional                  |
| **@silvery/ag**          | —                  | Scene graph (terminal)          | —          | Scene graph (canvas)    | Scene graph (graphics)        |
| **@silvery/ag-react**    | —                  | React reconciler                | —          | React reconciler        | React reconciler              |
| **@silvery/ag-term**     | —                  | ANSI rendering                  | —          | ANSI rendering          | ANSI rendering                |
| **@silvery/ag-canvas**   | —                  | Proportional (shipped)          | —          | Standalone package      | Full graphics                 |
| **@silvery/ag-layout**   | —                  | —                               | —          | Display list, measurers | Display list                  |
| **@silvery/ag-draw**     | —                  | —                               | —          | —                       | Paths, gradients, compositing |
| **@silvery/ag-a11y**     | —                  | —                               | —          | —                       | DOM accessibility mirror      |
| **@silvery/tea**         | —                  | Internal (design settling)      | Ships      | Same                    | Same                          |
| **@silvery/signals**     | —                  | Internal                        | Ships      | Same                    | Same                          |
| **@silvery/commands**    | —                  | Internal                        | Ships      | Same                    | Same                          |
| **@silvery/scope**       | —                  | Internal                        | Ships      | Same                    | Same                          |
| **@silvery/headless**    | —                  | Internal                        | Ships      | Same                    | Same                          |
| **@silvery/create**      | —                  | Internal                        | Ships      | Same                    | Same                          |
| **silvery** (components) | —                  | 30+ components (38 canvas-safe) | —          | Render-neutral          | + graphics components         |

See [vision/packages.md](vision/packages.md) for the complete package inventory with current status.
