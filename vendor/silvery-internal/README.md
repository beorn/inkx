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

### Design RFCs

| File                                                                 | Status                                         |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| [design/design.md](design/design.md)                                 | Historical — original Silvery RFC (early 2025) |
| [design/dom-api-design.md](design/dom-api-design.md)                 | RFC — DOM-like render API                      |
| [design/playground-design.md](design/playground-design.md)           | RFC — live Canvas playground                   |
| [design/viewport-architecture.md](design/viewport-architecture.md)   | Implemented — viewport + virtualization        |
| [design/virtual-columns-design.md](design/virtual-columns-design.md) | RFC — virtual columns component                |
| [design/mouse-events-design.md](design/mouse-events-design.md)       | Implemented — mouse event design rationale     |

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
