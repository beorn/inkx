# Silvery Internal Docs

Development-only documentation for Silvery — vision, design, architecture deep dives, and reference material. These docs support the development process but aren't part of the published package or docs site.

Silvery's public docs live in [`vendor/silvery/docs/`](../silvery/docs/).

## Start Here

1. **[Horizons](horizons.md)** — What each version means, package evolution, strategy per horizon
2. **[Exploration](vision/exploration.md)** — How we think about silvery: composable architecture, ag evolution, drawing library relationship
3. **[Architecture](design/v10-terminal/architecture.md)** — Engineering reference for the current stack: three projections, layers, interaction

## Vision

Cross-horizon strategy and direction.

| File                                               | What                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [horizons.md](horizons.md)                         | Version definitions, package map, strategy per horizon                                                      |
| [vision/exploration.md](vision/exploration.md)     | What silvery is and could become — composable `pipe()` architecture, horizons, drawing library relationship |
| [vision/packages.md](vision/packages.md)           | Complete package inventory with status markers                                                              |
| [vision/roadmap.md](vision/roadmap.md)             | Phasing, positioning, prior art, naming                                                                     |
| [vision/app-explosion.md](vision/app-explosion.md) | Manifesto: what the architecture enables at scale                                                           |

## Design

Subsystem designs, organized by horizon.

### v0.5 — Flexily + Pretext

| File                                                                                 | What                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [design/v05-layout/pretext-integration.md](design/v05-layout/pretext-integration.md) | TextLayoutService API, caching, font resolution, measurement approaches |

### v1.0 — Terminal UI Framework (shipping)

| File                                                                         | What                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [design/v10-terminal/architecture.md](design/v10-terminal/architecture.md)   | Full stack reference — three projections, layers, interaction architecture |
| [design/v10-terminal/composability.md](design/v10-terminal/composability.md) | Framework x platform matrix, adapters                                      |
| [design/v10-terminal/design-system.md](design/v10-terminal/design-system.md) | **Sterling** — canonical design system (tokens, schemes, derivation, theming API, package layout) |
| [design/v10-terminal/sterling-preflight.md](design/v10-terminal/sterling-preflight.md) | Sterling pre-flight — D1-D6 decisions locked 2026-04-19 |
| [design/v10-terminal/sterling-2c-migration-spec.md](design/v10-terminal/sterling-2c-migration-spec.md) | km-tui migration spec for Sterling Phase 2c (batch-refactor commands, substitution map) |
| [design/v10-terminal/sterling-2d-release-checklist.md](design/v10-terminal/sterling-2d-release-checklist.md) | Sterling 2d release checklist — silvery 0.19.0 breaking release |
| [design/v10-terminal/storybook-design.md](design/v10-terminal/storybook-design.md) | Sterling Storybook — interactive 3-pane design-system explorer (MVP shipped) |
| [design/v10-terminal/backdrop-fade-plan.md](design/v10-terminal/backdrop-fade-plan.md) | Backdrop render-time cell transform (Phase 6 shipped + Kitty overlay for emoji) |
| [design/v10-terminal/color-inherit-plan.md](design/v10-terminal/color-inherit-plan.md) | `color="inherit"` / `currentColor` cascade primitive |

### v1.5 — App Architecture (tea)

| File                                                     | What                                                   |
| -------------------------------------------------------- | ------------------------------------------------------ |
| [design/v15-tea/signals.md](design/v15-tea/signals.md)   | Reactive data graph, progressive API, alien-signals    |
| [design/v15-tea/commands.md](design/v15-tea/commands.md) | Command tree, surface projection, availability         |
| [design/v15-tea/app.md](design/v15-tea/app.md)           | Plugin composition, domain plugins, op() proxy, scopes |
| [design/v15-tea/headless.md](design/v15-tea/headless.md) | Pure state machines for UI components                  |

### v2.0 — Canvas (proportional text shipping)

| File                                                                             | What                                                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [design/v20-canvas/rendering-targets.md](design/v20-canvas/rendering-targets.md) | Surface matrix, display list, DOM accessibility mirror, prior art |
| [design/v20-canvas/ag-canvas-status.md](design/v20-canvas/ag-canvas-status.md)   | Current ag-canvas status, capabilities, and pickup guide          |

### v3.0 — Graphics Engine

No design docs yet — see [horizons.md](horizons.md) for the vision.

### Undecided

| File                                                                           | What                                     | Likely Horizon                             |
| ------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| [design/v-undecided/text-selection.md](design/v-undecided/text-selection.md)   | App-level text selection                 | v1.x (terminal MVP) / v3.0 (cross-surface) |
| [design/v-undecided/windowing.md](design/v-undecided/windowing.md)             | Focus, tabs, panes, overlays             | v1.x–v2.0                                  |
| [design/v-undecided/virtual-columns.md](design/v-undecided/virtual-columns.md) | 2D virtualization for kanban/spreadsheet | v1.x                                       |
| [design/v-undecided/dom-api.md](design/v-undecided/dom-api.md)                 | DOM-like render API                      | v2.0                                       |
| [design/v-undecided/ai-mode.md](design/v-undecided/ai-mode.md)                 | AI agents driving apps via commands      | v3.0+                                      |

## Internals

How silvery works inside. Contributor-level implementation details.

| File                                                                 | What                                                |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| [internals/two-phase-rendering.md](internals/two-phase-rendering.md) | Core innovation: measure/arrange two-phase pipeline |
| [internals/reconciler.md](internals/reconciler.md)                   | React reconciler walkthrough, layout feedback       |
| [internals/performance.md](internals/performance.md)                 | 21 optimizations across 7 categories                |
| [internals/benchmarks.md](internals/benchmarks.md)                   | Raw benchmark data (`bun run bench`)                |
| [internals/containment.md](internals/containment.md)                 | Containment model and layout semantics              |
| [internals/scrollback.md](internals/scrollback.md)                   | Inline mode scrollback analysis                     |
| [internals/testing.md](internals/testing.md)                         | Test infrastructure and strategies                  |

## Reference

Research, decisions, reviews, and operational docs.

| File                                                                               | What                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [reference/era2-overview.md](reference/era2-overview.md)                           | Era 2 navigation hub — maps to v10-terminal design docs |
| [reference/decisions.md](reference/decisions.md)                                   | Numbered design decisions (append-only log)             |
| [reference/migration.md](reference/migration.md)                                   | Migration guide: render() -> createApp()                |
| [reference/signals-landscape.md](reference/signals-landscape.md)                   | JS signals ecosystem research                           |
| [reference/example-checklist.md](reference/example-checklist.md)                   | Example quality criteria                                |
| [reference/playground.md](reference/playground.md)                                 | Canvas playground architecture                          |
| [reference/npm-registry.md](reference/npm-registry.md)                             | npm package registry and naming inventory               |
| [reference/reviews/tealess-gpt-review.md](reference/reviews/tealess-gpt-review.md) | GPT 5.4 Pro review of TEA decoupling                    |

## Launch

| File                                                                                     | What                                                        |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [launch/launch-strategy.md](launch/launch-strategy.md)                                   | Two-launch plan: Flexily standalone, then Silvery + Pretext |
| [launch/blog-launch.md](launch/blog-launch.md)                                           | Draft launch blog post                                      |
| [launch/deep-research-marketing-critique.md](launch/deep-research-marketing-critique.md) | Deep research marketing critique                            |
| [launch/ink-issues-research.md](launch/ink-issues-research.md)                           | Research on Ink issues (positioning docs)                   |

## Prototypes

| Directory                                     | What                                                           | Bead                |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------- |
| [prototype/aichat-v2](prototype/aichat-v2/)   | Era 2 API reference implementation (signals, async generators) | km-silvery.api-impl |
| [prototype/headless](prototype/headless/)     | Headless state machine prototypes                              |                     |
| [prototype/typed-pipe](prototype/typed-pipe/) | Composable pipe type implementation                            |                     |

## Mockups

[mockups/](mockups/) — Experimental ANSI mockups for component design.

## Archive

All deprecated docs, consolidated in one place.

| Directory                                    | What                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| [archive/pre-era2/](archive/pre-era2/)       | Original founding RFC, old architecture docs, state API design |
| [archive/era2-drafts/](archive/era2-drafts/) | Superseded era2 architecture drafts                            |

## Related

- [km universal editor](../../docs/future/universal-editor.md) — docily + textily vision (builds on the rendering stack)
- [TEA state machines](../../docs/design/tea.md) — The architectural principle behind silvery-tea
- [silvery public docs](../silvery/docs/) — Published documentation on silvery.dev
