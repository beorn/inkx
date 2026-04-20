# km Roadmap — holistic view

> Big-picture map across all tracks, with silvery horizons folded into Track 2.
> For the ordered near-term queue, see [`backlog.md`](backlog.md).
> For the vision informing direction, see [`km/design/vision.md`](km/design/vision.md).

km is becoming the environment for knowledge work with AI agents. See the [vision doc](km/design/vision.md) for the three-axis framing (Knowledge / Communication / Agents) that informs this roadmap.

## Five tracks

| Track | Scope | Horizon | Owner epic |
|---|---|---|---|
| **1. km TUI** | Interactive workspace, views, editing, omnibox, selection | 1-3 months | `km-tui` |
| **2. Silvery maturation** | TUI framework: v0.5 → v1.0 → v1.5 (tea) → v2.0 (canvas) → v3.0 (graphics) | 6-12+ months | `km-silvery` |
| **3. Knowledge layer** | km bd, recall, brain/ENGRAM, connectors, facets | ongoing | `km-infra`, `km-all` |
| **4. Communication (tribe-matrix)** | Matrix-based live wire for agent coordination | 2-3 weeks once started | `km-all.connector-matrix` |
| **5. Ecosystem** | Silvery marketing, terminfo.dev, bearly tools, vorg | parallel | `km-market`, `km-terminfo`, `km-bearly` |

Each track has its own chain of beads; see each epic for the phased detail.

## Near-term sequencing (summary)

The full ordered queue — with parallel work, deferred items, and done-log — lives in [`backlog.md`](backlog.md). This section is just the top-of-mind shape.

### Now

1. **W3 — Omnibox v1 finish** (`km-tui.omnibox-dialog`). Ship gate for the TUI.

### Queued (in order)

2. `km-infra.bd-v1-compat` — write-path persistence for `km bd`.
3. `km-all.connector-matrix` Phase 0 — Matrix homeserver + skeleton (4-5d).
4. W4 — TEA in silvery + aichat showcase (`km-silvery.tea`).
5. `km-all.connector-matrix` Phase 1 — full sync + personas + lease + sigil→transclusion (1-2w).
6. W5 — Theme system + aichat polish.
7. W6 — TEA in km + polish.
8. `km-all.connector-matrix` Phase 2 — chatlog view + DMs + bead linking (~1w).
9. W7 — Selection system (`km-all.unified-selection`).

### Future (committed direction, not scheduled)

- Silvery v2.0 canvas path — `km-silvery.ag-canvas`.
- Cross-framework reconcilers — ag-solid, ag-vue, ag-svelte.
- `km-infra.facet-system` — formalize once 2-3 concrete types land.
- Universal editor — `km-all.universal-editor`; needs runly/docily/textily/termily.
- Brain / ENGRAM — active design.
- Connectors expansion — GitHub, Linear, Slack (CalDAV/CardDAV already shipped).
- Virtual Org — `km-all.vorg`.
- tribe-matrix Phase 5+ — E2E encryption, OpenClaw bridge, Matrix federation.

## Track 1 — km TUI

Active: W3 omnibox finish. Next: TEA integration (W4/W6), theme upgrade (W5), unified selection (W7). Views expand with backlog-view (`km-tui.backlog-view`) and channel-view (connector-matrix Phase 2). Plus bug fixes and perf (cold-startup-block, vault-node-explosion, column-top-disappears).

## Track 2 — Silvery

Silvery is a suite of packages, not one library. What "Silvery" means evolves across horizons. Two subsystems, both called Silvery:

- **Rendering engine**: flexily (layout) → pretext (text measurement) → ag (scene graph) → rendering targets (terminal, canvas, ...)
- **App architecture (tea)**: signals, commands, scopes, headless state machines — portable, works with ag OR react-dom OR anything

**The rendering engine never depends on tea.** Tea is the opinionated app architecture — optional but recommended for full apps.

### v0.5 — Composable Layout Engine

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
```

**Key packages**: flexily, pretext (external, Cheng Lou)

**Status**: Code shipped. Composable architecture shipped (v0.5.0). Canvas prototype working — proportional text via Pretext, 1,013 nodes in 35ms, full km kanban board rendering via WebSocket. Remaining: launch (flexily.dev polish, HN, benchmarks), standalone canvas examples.

**Beads**: `bd list --label horizon:v0.5` — `km-silvery.demos`, `km-silvery.docs-reorg`
**Design docs**: [silvery/design/v05-layout/](silvery/design/v05-layout/)

### v1.0 — Terminal UI Framework (tealess)

> "React for terminals, done right"

**Audience**: CLI/TUI developers, Ink users migrating to a faster, more capable framework.

**What ships**: The renderer story, polished. 30+ React components, themes, focus management, virtualization, Flexily layout, keyboard interaction, Ink compatibility layer. No tea — use any React state management (useState, Zustand, Jotai, etc.).

```typescript
import { render, Box, Text, SelectList, TextInput } from "silvery"
render(<App />).run() // that's it — no tea required
```

**Key packages**: @silvery/ag, @silvery/ag-react, @silvery/ag-term, silvery (components), @silvery/theme, @silvery/color, @silvery/ansi

**Strategy**: Polish what's shipping without tea. The renderer + components are excellent on their own. Tea design is still settling — don't ship it until it's right.

**Beads**: `bd list --label horizon:v1.0` — 17 open (2 P1 bugs, 10 P2 features, 5 P3 infra)
**Design docs**: [silvery/design/v10-terminal/](silvery/design/v10-terminal/)

### v1.5 — App Architecture (tea)

> "State management and commands that work everywhere Silvery renders — and beyond"

**Audience**: Silvery app developers who want structured state, discoverable commands, and testable architecture. Also usable with react-dom — tea doesn't depend on ag.

**What ships**: Polished, documented app architecture layer. Signals for reactive state. Commands for discoverable, automatable actions. Scopes for structured concurrency. Headless state machines for framework-agnostic component logic.

```typescript
// With ag (terminal/canvas)
const app = pipe(createFlexily(), withFlexbox(), withPretext(), withAg(), withTea())

// With react-dom (web) — tea works without ag
const app = pipe(withSignals(), withCommands(), withScopes())
```

**Key packages**: @silvery/tea, @silvery/signals, @silvery/commands, @silvery/scope, @silvery/headless, @silvery/create

**Beads**: `bd list --label horizon:v1.5` — `km-silvery.tea` (epic), virtual-terminal, zero-alloc, ai-apis
**Design docs**: [silvery/design/v15-tea/signals.md](silvery/design/v15-tea/signals.md), [silvery/design/v15-tea/commands.md](silvery/design/v15-tea/commands.md), [silvery/design/v15-tea/app.md](silvery/design/v15-tea/app.md), [silvery/design/v15-tea/headless.md](silvery/design/v15-tea/headless.md)

### v2.0 — Embeddable Layout + Text Engine

> "Yoga for 2D canvas"

**Audience**: Canvas app developers who need proportional text, layout, and multi-surface rendering.

**What ships**: Flexily+Pretext proven by external adoption (v0.5). Silvery gains proportional text on canvas — same components render with real typography. Display list abstraction enables multi-surface output.

**Key packages**: + @silvery/ag-canvas (proportional), @silvery/ag-layout (display list, measurers)

**Status**: Proportional canvas rendering works (shipped in ag-react/ui/canvas). `renderToCanvas()` renders React components to Canvas2D with Pretext proportional text, HiDPI scaling, keyboard/mouse input, focus management, and 38 re-exported UI components. Proven at scale with km (1,013 nodes, 35ms).

**What works now** (in `@silvery/ag-react/ui/canvas`):

- `renderToCanvas(element, canvas, options)` — full React component rendering on Canvas2D
- Pretext + DOM measurer for proportional text
- Keyboard input via hidden textarea (useInput works)
- Mouse events (click, hover, wheel) via CanvasMouseEvent
- Focus management (Tab/Shift+Tab/Escape cycling)
- HiDPI rendering via DPR scaling
- 38 of 40 silvery UI components canvas-safe (only ScrollbackList/ScrollbackView are terminal-only)

**What's next**: Render-neutral components (PlatformServices injection), RectRegistry (shared hit testing), DOM overlay for text editing, extract to standalone `@silvery/ag-canvas` package.

**Speculative: signals engine** — if canvas profiling shows the tree-walk pipeline as bottleneck, the rendering engine itself could become signal-based. Design doc: [silvery/design/v20-canvas/signals-engine.md](silvery/design/v20-canvas/signals-engine.md). Bead: `km-silvery.signals-engine` (P4).

**Beads**: `bd list --label horizon:v2.0` — `km-silvery.ag-canvas` (epic), shared-components, ag-scene-ready, engine, signals-engine (speculative)
**Design docs**: [silvery/design/v20-canvas/](silvery/design/v20-canvas/)

### v3.0 — Graphics UI Engine

> "Build Google Docs-class apps"

**Audience**: Enterprise app builders, custom-rendered editor developers.

**What ships**: Own scene graph (ag-draw), own drawing, own interaction. Rich rendering: paths, gradients, shadows, connectors, compositing. Full surface matrix: Canvas2D, WebGL, SVG, PDF. DOM accessibility mirror.

```typescript
const app = pipe(
  createFlexily(),
  withFlexbox(),
  withPretext(),
  withAg(),     // scene graph
  withDraw(),   // paths, gradients, compositing, display list
  withTea(),    // commands, signals, interaction
)
```

**Key packages**: + @silvery/ag-draw, @silvery/ag-a11y, @silvery/ag-svg, @silvery/ag-pdf, @silvery/ag-image, @silvery/ag-remote

**Strategy**: Three approaches, all compatible:
- **A. Own scene graph, target drawing libs as backends.** Display list → Canvas2D / PixiJS / WebGL.
- **B. API familiar to existing drawing libs.** Ink++ pattern — similar API to Konva/PixiJS, better engine.
- **C. Embeddable in existing drawing libs.** Konva/Pixi apps embed silvery layout+text as a node.

**Beads**: none yet (future)
**Design docs**: [silvery/design/v30-graphics/](silvery/design/v30-graphics/)

### Undecided (silvery)

Features with designs but no assigned horizon yet.

| Feature | Doc | Likely Horizon |
|---|---|---|
| Windowing (focus, tabs, panes, overlays) | [silvery/design/v-undecided/windowing.md](silvery/design/v-undecided/windowing.md) | v1.x–v2.0 |
| Virtual columns (2D virtualization) | [silvery/design/v-undecided/virtual-columns.md](silvery/design/v-undecided/virtual-columns.md) | v1.x |
| DOM-like render API | [silvery/design/v-undecided/dom-api.md](silvery/design/v-undecided/dom-api.md) | v2.0 |
| AI mode (agents driving apps) | [silvery/design/v-undecided/ai-mode.md](silvery/design/v-undecided/ai-mode.md) | v3.0+ |

### Package Evolution (silvery)

| Package | v0.5 | v1.0 | v1.5 (tea) | v2.0 | v3.0 |
|---|---|---|---|---|---|
| **flexily** | Composable plugins | Layout engine | — | Proven | Proven |
| **pretext** | Peer dep | Text measurement | — | Proportional | Proportional |
| **@silvery/ag** | — | Scene graph (terminal) | — | Scene graph (canvas) | Scene graph (graphics) |
| **@silvery/ag-react** | — | React reconciler | — | React reconciler | React reconciler |
| **@silvery/ag-term** | — | ANSI rendering | — | ANSI rendering | ANSI rendering |
| **@silvery/ag-canvas** | — | Proportional (shipped) | — | Standalone package | Full graphics |
| **@silvery/ag-layout** | — | — | — | Display list, measurers | Display list |
| **@silvery/ag-draw** | — | — | — | — | Paths, gradients, compositing |
| **@silvery/ag-a11y** | — | — | — | — | DOM accessibility mirror |
| **@silvery/tea** | — | Internal (design settling) | Ships | Same | Same |
| **@silvery/signals** | — | Internal | Ships | Same | Same |
| **@silvery/commands** | — | Internal | Ships | Same | Same |
| **@silvery/scope** | — | Internal | Ships | Same | Same |
| **@silvery/headless** | — | Internal | Ships | Same | Same |
| **@silvery/create** | — | Internal | Ships | Same | Same |
| **silvery** (components) | — | 30+ components (38 canvas-safe) | — | Render-neutral | + graphics components |

See [silvery/vision/packages.md](silvery/vision/packages.md) for the complete package inventory with current status.

### Tea and the Rendering Engine (principle)

**The rendering engine never depends on tea.** The pipeline (flexily → ag → display list → rendering targets) is pure — input in, pixels out. Tea (signals, commands, scopes) is about _what_ happens in the app, not _how_ it renders.

**Interaction primitives are scene-graph level, not tea level.** DnD, selection, focus state machines consume pointer events and produce commands — they're surface-agnostic state machines that live at the ag/ag-draw layer.

**Tea is optional but recommended for full apps.** For v2.0 (canvas devs embedding layout), tea is optional. For v3.0 (Google Docs-class apps), tea is the recommended path. But the rendering engine works without it at every horizon.

## Track 3 — Knowledge layer

Already shipped: CalDAV/CardDAV connectors, `@km/agent` + `km agent` CLI, `km bd` (read path). In progress: bd write path (`km-infra.bd-v1-compat`), vault-node-explosion investigation. Planned: facet system formalization (`km-infra.facet-system`), brain/ENGRAM integration, more connectors (GitHub/Linear/Slack).

## Track 4 — Communication (tribe-matrix)

Design captured in [`km/design/tribe-matrix.md`](km/design/tribe-matrix.md) (simplified 2026-04-20 to reuse km primitives). Three phases tracked under `km-all.connector-matrix`:

- **Phase 0** — Matrix homeserver install + `@km/connector-matrix` skeleton (4-5d)
- **Phase 1** — full bidirectional sync + personas + lease pattern + save-time sigil→transclusion (1-2w)
- **Phase 2** — silvery chatlog view + durable/ephemeral split + DMs + bead linking (~1w)
- Phase 3+ deferred (E2E, Matrix federation, additional connectors)

Retired 2026-04-20: old `@bearly/tribe` daemon (8300 LOC custom wire) will retire after Phase 1 ships.

## Track 5 — Ecosystem / side products

`km-market` covers silvery marketing, SEO, positioning. `km-terminfo` runs terminfo.dev as a side-product. `km-bearly` is the `@bearly/*` tool monorepo (tribe, recall, llm, refactor, tty). `km-all.vorg` is the Virtual Org skill framework. These proceed in parallel with the main four tracks; no hard coupling.

## Cross-cutting policies

- **`km-all.surface-freeze`** — no new view modes, no new node types during W1-W7. Lifts when W3 ships AND W7 closes. Facet system respects this — formalize AFTER W7.
- **Bug rule**: fix inline if scoped (<1h); otherwise bead and schedule.
- **No P-values on new beads** — ordering is position in [`backlog.md`](backlog.md).
- **Short IDs** — `name` is the identity; short IDs ARE names (no separate `data.short_id`). Names are minted per-parent via `km-beads` generator. Area-scoped forms (`TUI-47` etc.) are optional conventions; existing `km-xxxx` names stay valid.

## How to use this doc

- **New task?** Find the right track; check whether the work belongs in [`backlog.md`](backlog.md) (ordered queue) or in Future here.
- **What's next right now?** Top of [`backlog.md`](backlog.md) Now section.
- **Vision question?** → [`km/design/vision.md`](km/design/vision.md).
- **Tribe implementation detail?** → [`km/design/tribe-matrix.md`](km/design/tribe-matrix.md).
- **Silvery horizon detail?** → sections above under Track 2.

This doc is the map. Update when a track shifts materially; don't track every bead here.
