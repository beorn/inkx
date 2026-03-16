# Silvery Internal Docs

Development-only documentation for Silvery — design RFCs, raw benchmarks, internal architecture deep dives, and draft content. These docs support the development process but aren't part of the published package or docs site.

Silvery's public docs live in [`vendor/silvery/docs/`](../silvery/docs/).

## Contents

| File                                     | What                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| [blog-launch.md](blog-launch.md)         | Draft launch blog post                                                 |
| [benchmarks.md](benchmarks.md)           | Raw benchmark data (reproduce with `bun run bench`)                    |
| [testing.md](testing.md)                 | Contributor testing strategy — golden spec, Ink compat, visual testing |
| [dimension-audit.md](dimension-audit.md) | Audit of manual dimension calculations in km-tui                       |

### Era 2 Design (implement now)

Progressive-disclosure docs — read in order. Each builds on the previous.

| File                                                                    | What                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| [design/era2/01-quick-start.md](design/era2/01-quick-start.md)         | Minimal app, idealized shapes, spike map       |
| [design/era2/02-signals.md](design/era2/02-signals.md)                 | Signals, derived, createModel, selectors       |
| [design/era2/03-commands.md](design/era2/03-commands.md)               | Command tree, `{ fn, args? }`, availability    |
| [design/era2/04-input.md](design/era2/04-input.md)                     | Keymaps, sources, dispatch pipeline            |
| [design/era2/05-app.md](design/era2/05-app.md)                         | App composition, plugins, op(), providers      |
| [design/era2/06-scopes.md](design/era2/06-scopes.md)                   | Structured concurrency, scope tree, effects    |
| [design/era2/composability.md](design/era2/composability.md)           | Cross-platform design, framework×platform      |
| [design/era2/packaging.md](design/era2/packaging.md)                   | Package structure, bundles, migration           |
| [design/era2/playground.md](design/era2/playground.md)                 | Live Canvas playground design                  |
| [design/era2/decisions.md](design/era2/decisions.md)                   | Numbered decision log                          |

### Era 3 Design (future)

| File                                                                    | What                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| [design/era3/ai-mode.md](design/era3/ai-mode.md)                       | AI agents driving apps                         |
| [design/era3/windowing.md](design/era3/windowing.md)                   | Focus, tabs, panes, overlays                   |
| [design/era3/text-selection.md](design/era3/text-selection.md)         | App-level text selection                       |
| [design/era3/app-explosion.md](design/era3/app-explosion.md)           | Vision / manifesto                             |

### Reference (pre-era2 explorations)

| File                                                                                     | What                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [design/reference/state-api-redesign.md](design/reference/state-api-redesign.md)         | Original 8-sip API design (superseded by era2/)|
| [design/reference/architecture-overview.md](design/reference/architecture-overview.md)   | Original hub doc (superseded by era2/01)       |
| [design/reference/design.md](design/reference/design.md)                                 | Historical — original Silvery RFC (early 2025) |
| [design/reference/dom-api-design.md](design/reference/dom-api-design.md)                 | RFC — DOM-like render API                      |
| [design/reference/viewport-architecture.md](design/reference/viewport-architecture.md)   | Implemented — viewport + virtualization        |
| [design/reference/virtual-columns-design.md](design/reference/virtual-columns-design.md) | RFC — virtual columns component                |
| [design/reference/mouse-events-design.md](design/reference/mouse-events-design.md)       | Implemented — mouse event design rationale     |

### Prototypes

| Directory                                   | What                                                                           | Bead                |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| [prototype/aichat-v2](prototype/aichat-v2/) | Era 2 API reference implementation (signals, async generators, factory models) | km-silvery.api-impl |

### Deep Dives

| File                                                                     | What                                         |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| [deep-dives/internals.md](deep-dives/internals.md)                       | How the reconciler works (contributor-level) |
| [deep-dives/scrollback-analysis.md](deep-dives/scrollback-analysis.md)   | Inline mode scrollback analysis              |
| [deep-dives/architecture-enables.md](deep-dives/architecture-enables.md) | Capabilities enabled by the TEA architecture |
