# km Documentation

**km** is a plain brain — a headless knowledge engine that turns markdown files into a structured, queryable knowledge system for humans and AI agents.

## Start here — pick your lane

| If you want to… | Read |
|---|---|
| **Use km** | [Quick Start](#quick-start) below, then [guides/](guides/) |
| **Understand how km is built** | [architecture.md](architecture.md), then [design/](design/) for subsystems |
| **Build on km** (APIs, refs, internals) | [ref/](ref/) + [design/](design/) |
| **Contribute** (tests, debug, release) | [dev/](dev/) |
| **See what ships next** | [backlog.md](backlog.md) |
| **Look up a term** | [glossary.md](glossary.md) |
| **Find the canonical doc for a concept** | [dev/doc-map.md](dev/doc-map.md) |
| **Read principles / design stance** | [principles.md](principles.md) |

## Quick Start

```bash
cd ~/any-project           # Any folder with .md files
km tasks                   # See tasks from markdown files
km view                    # Kanban board TUI
km init                    # Enable persistence (stable IDs, history)
```

Your data stays in plain markdown. km adds queryability and navigation without lock-in.

## guides/ — using km

| Doc                                              | Description                                |
| ------------------------------------------------ | ------------------------------------------ |
| [guides/tasks.md](guides/tasks.md)               | Tasks, boards, GTD workflow                |
| [guides/cli.md](guides/cli.md)                   | CLI commands                               |
| [guides/markdown.md](guides/markdown.md)         | Markdown format km reads and writes        |
| [guides/query.md](guides/query.md)               | Query language — field:value, sigils, FTS  |
| [guides/use-cases.md](guides/use-cases.md)       | Scenarios: research, project mgmt, inbox   |
| [guides/benchmarking.md](guides/benchmarking.md) | Perf measurement                           |

## design/ — how km is shaped

**Start here:** [architecture.md](architecture.md), [principles.md](principles.md), [concepts.md](concepts.md).

### design/model/ — what km tracks

| Doc                                                | Description                                    |
| -------------------------------------------------- | ---------------------------------------------- |
| [design/model/knode.md](design/model/knode.md)     | Storage node: items vs blocks, visual roles    |
| [design/model/kast.md](design/model/kast.md)       | Parser AST: block+trait, inline, lowering      |
| [design/model/klink.md](design/model/klink.md)     | Link model — KLink, KLinkRef, resolver, sigils |
| [design/model/storage.md](design/model/storage.md) | SQLite schema, memory/disk modes, sync         |

### design/ui/ — how the user sees and drives km

| Doc                                                | Description                                       |
| -------------------------------------------------- | ------------------------------------------------- |
| [design/ui/visibility.md](design/ui/visibility.md) | Which nodes appear — folder/file/H1 collapse      |
| [design/ui/rendering.md](design/ui/rendering.md)   | Node visual spec, per-node signals, tree-reduce   |
| [design/ui/layout.md](design/ui/layout.md)         | Board + outliner layout, sticky columns           |
| [design/ui/selection.md](design/ui/selection.md)   | Cursor, anchor, 9 gestures, selecting kinds       |
| [design/ui/navigation.md](design/ui/navigation.md) | Movement, zoom, grid navigation                   |

### design/ — architecture

| Doc                                                                              | Description                             |
| -------------------------------------------------------------------------------- | --------------------------------------- |
| [design/tea.md](design/tea.md)                                                   | TEA state machines + phase roadmap      |
| [design/input.md](design/input.md)                                               | Keybindings, chord system, verb×location |
| [design/omnibox.md](design/omnibox.md)                                           | Command palette                          |
| [design/recurrence.md](design/recurrence.md)                                     | Task recurrence (RRULE + FROM)          |
| [design/phases.md](design/phases.md)                                             | TEA migration status                    |
| [design/terminal-integration-testing.md](design/terminal-integration-testing.md) | Headless TUI testing                    |
| [design/visual-navigation.md](design/visual-navigation.md)                       | Spatial navigation design               |
| [architecture/brain.md](architecture/brain.md)                                   | Future: memory graph, solidification    |

## ref/ — builder reference

| Doc                                                          | Description                             |
| ------------------------------------------------------------ | --------------------------------------- |
| [ref/ui.md](ref/ui.md)                                       | Views, navigation, colors, design system |
| [ref/commands.md](ref/commands.md)                           | Command registry, when clauses           |
| [ref/effects.md](ref/effects.md)                             | Effect catalog — TreeEffect + BoardEffect |
| [ref/changes.md](ref/changes.md)                             | Change-type taxonomy                     |
| [ref/task-fields.md](ref/task-fields.md)                     | Task fields + cross-system mapping       |
| [ref/tree-globs.md](ref/tree-globs.md)                       | Glob syntax                              |
| [ref/packages.md](ref/packages.md)                           | Package roster + dependencies            |
| [ref/dependencies.md](ref/dependencies.md)                   | Package dependency graph                 |
| [ref/pipelines.md](ref/pipelines.md)                         | Async generator pipelines                |
| [ref/ansi-color-detection.md](ref/ansi-color-detection.md)   | ANSI color capability detection          |
| [ref/prior-art.md](ref/prior-art.md)                         | Research notes on related tools          |

## dev/ — for contributors

| Doc                                                    | Description                          |
| ------------------------------------------------------ | ------------------------------------ |
| [dev/doc-map.md](dev/doc-map.md)                       | Canonical concept → doc map          |
| [dev/testing.md](dev/testing.md)                       | Test strategy, tiers, patterns       |
| [dev/test-system.md](dev/test-system.md)               | Vitest + Bun runner architecture     |
| [dev/test-fakes.md](dev/test-fakes.md)                 | Fake factories reference             |
| [dev/chaos-testing.md](dev/chaos-testing.md)           | Fuzz + chaos strategy                |
| [dev/debugging.md](dev/debugging.md)                   | Debugging TUI, storage, sync         |
| [dev/releasing.md](dev/releasing.md)                   | Versioning and releases              |
| [dev/vitest-ci.md](dev/vitest-ci.md)                   | Vitest CI integration details        |
| [dev/monorepo.md](dev/monorepo.md)                     | Module resolution + workspace layout |
| [dev/term-tui-migration.md](dev/term-tui-migration.md) | Ink → silvery migration history      |

## lessons/ — retrospectives (frozen)

Append-only case studies. See [lessons/](lessons/) for the full index. Highlights:
- [lessons/refactoring.md](lessons/refactoring.md) — delete-first discipline
- [lessons/reproduce-first.md](lessons/reproduce-first.md) — TDD for bugs
- [lessons/filetree-as-peer.md](lessons/filetree-as-peer.md) — peer vs representation
- [lessons/op-signal-boundary.md](lessons/op-signal-boundary.md) — one writer per signal

## Other

- [explorations/](explorations/) — active WIP investigations
- [future/](future/) — speculation (universal editor, agents, beads integration, services)
- [adr/](adr/) — architectural decision records
- [archive/](archive/) — retired docs (with forward pointers to replacements)
- [architecture-review-findings.md](architecture-review-findings.md) — point-in-time review notes
- [vs-decker.md](vs-decker.md) — architecture comparison with the Decker predecessor
- [content-marketing-strategy.md](content-marketing-strategy.md) — ecosystem marketing plan (silvery.dev, termless.dev, etc.)

## Key Principles

See [principles.md](principles.md) for the full philosophy. In brief:

**Product:** everything is a node; zero setup; markdown-native.
**Engineering:** composability (domain objects, async generators); quality enables fast feedback; readability first; built for LLMs.

## Two Modes

| Mode       | Trigger       | IDs       | History |
| ---------- | ------------- | --------- | ------- |
| **Memory** | No `.km/`     | Ephemeral | No      |
| **Disk**   | `.km/` exists | Stable    | Yes     |

Memory mode: SQLite in RAM, rebuilt each run. Disk mode: SQLite persisted, full event history. Enable with `km init`.

## See Also

- [../CLAUDE.md](../CLAUDE.md) — Agent instructions
- [../README.md](../README.md) — Project overview
