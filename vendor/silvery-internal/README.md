# Silvery Internal Docs

Development-only documentation for Silvery — design RFCs, raw benchmarks, internal architecture deep dives, and draft content. These docs support the development process but aren't part of the published package or docs site.

Silvery's public docs live in [`vendor/silvery/docs/`](../silvery/docs/).

## Contents

| File                               | What                       |
| ---------------------------------- | -------------------------- |
| [npm-registry.md](npm-registry.md) | npm package registry notes |

### Launch

| File                                                                                     | What                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| [launch/blog-launch.md](launch/blog-launch.md)                                           | Draft launch blog post                    |
| [launch/deep-research-marketing-critique.md](launch/deep-research-marketing-critique.md) | Deep research marketing critique          |
| [launch/ink-issues-research.md](launch/ink-issues-research.md)                           | Research on Ink issues (positioning docs) |

### Era 2 Design (implement now)

**Start here**: [architecture.md](design/era2/architecture.md) is the central reference. Deep-dives below expand on specific topics.

| File | What |
|---|---|
| [design/era2/00-architecture.md](design/era2/00-architecture.md) | **THE reference** — full architecture, code, flows, packages |
| [design/era2/01-quick-start.md](design/era2/01-quick-start.md) | Deep-dive: concrete app examples, migration paths |
| [design/era2/02-signals.md](design/era2/02-signals.md) | Deep-dive: signal research, progressive API, alien-signals rationale |
| [design/era2/03-commands.md](design/era2/03-commands.md) | Deep-dive: command-centric philosophy, surface projection |
| [design/era2/04-input.md](design/era2/04-input.md) | Deep-dive: chord engine, async iterables, key normalization |
| [design/era2/05-app.md](design/era2/05-app.md) | Deep-dive: op() proxy, Sips 4-8, plugin philosophy |
| [design/era2/06-scopes.md](design/era2/06-scopes.md) | Deep-dive: full scope API (sleep, timeout, onDispose), effects |
| [design/era2/composability.md](design/era2/composability.md) | Deep-dive: framework×platform matrix |
| [design/era2/packaging.md](design/era2/packaging.md) | Roadmap: package structure (needs update for ag-* naming) |
| [design/era2/playground.md](design/era2/playground.md) | RFC: Live Canvas playground |
| [design/era2/decisions.md](design/era2/decisions.md) | Log: numbered decisions (append-only) |
| [design/era2/signals-landscape-2026.md](design/era2/signals-landscape-2026.md) | Research: signals library comparison |

### Era 3 Design (future)

| File                                                                           | What                            |
| ------------------------------------------------------------------------------ | ------------------------------- |
| [design/era3/ai-mode.md](design/era3/ai-mode.md)                               | AI agents driving apps          |
| [design/era3/windowing.md](design/era3/windowing.md)                           | Focus, tabs, panes, overlays    |
| [design/era3/text-selection.md](design/era3/text-selection.md)                 | App-level text selection        |
| [design/era3/app-explosion.md](design/era3/app-explosion.md)                   | Vision / manifesto              |
| [design/era3/dom-api-design.md](design/era3/dom-api-design.md)                 | RFC — DOM-like render API       |
| [design/era3/virtual-columns-design.md](design/era3/virtual-columns-design.md) | RFC — virtual columns component |

### Archive (deprecated pre-era2 material)

| File                                                                               | What                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| [design/archive/state-api-redesign.md](design/archive/state-api-redesign.md)       | Original 8-sip API design (superseded by era2/)  |
| [design/archive/architecture-overview.md](design/archive/architecture-overview.md) | Original hub doc (superseded by era2/01)         |
| [design/archive/design.md](design/archive/design.md)                               | Historical — original Silvery RFC (early 2025)   |
| [design/archive/viewport-architecture.md](design/archive/viewport-architecture.md) | Implemented — viewport + virtualization          |
| [design/archive/mouse-events-design.md](design/archive/mouse-events-design.md)     | Implemented — mouse event design rationale       |
| [design/archive/architecture-enables.md](design/archive/architecture-enables.md)   | TEA architecture capabilities (deprecated)       |
| [design/archive/focus-routing.md](design/archive/focus-routing.md)                 | Focus-based input routing (deprecated)           |
| [design/archive/dimension-audit.md](design/archive/dimension-audit.md)             | Manual dimension calculations audit (deprecated) |

### Prototypes

| Directory                                   | What                                                                           | Bead                |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| [prototype/aichat-v2](prototype/aichat-v2/) | Era 2 API reference implementation (signals, async generators, factory models) | km-silvery.api-impl |

### Deep Dives

| File                                                                   | What                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [deep-dives/internals.md](deep-dives/internals.md)                     | How the reconciler works (contributor-level)                           |
| [deep-dives/scrollback-analysis.md](deep-dives/scrollback-analysis.md) | Inline mode scrollback analysis                                        |
| [deep-dives/architecture.md](deep-dives/architecture.md)               | Architecture overview                                                  |
| [deep-dives/containment.md](deep-dives/containment.md)                 | Containment model                                                      |
| [deep-dives/performance.md](deep-dives/performance.md)                 | Performance analysis and optimization catalog                          |
| [deep-dives/benchmarks.md](deep-dives/benchmarks.md)                   | Raw benchmark data (reproduce with `bun run bench`)                    |
| [deep-dives/testing.md](deep-dives/testing.md)                         | Contributor testing strategy — golden spec, Ink compat, visual testing |
