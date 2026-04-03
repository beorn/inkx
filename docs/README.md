# km Documentation

**km** is a plain brain — a headless knowledge engine that turns markdown files into a structured, queryable knowledge system for humans and AI agents.

---

## What km Does

km transforms a directory of markdown files into a **unified node tree** that can be:

- Queried (find tasks, filter by status, search content)
- Navigated (board view, tree view, list view)
- Edited (changes sync bidirectionally to files)
- Extended (custom content types via frontmatter)

**Currently implements:** Knowledge tree (task management with GTD workflow), CalDAV/CardDAV client, agent runtime
**Committed vision:** Memory graph (SPO triples), chats as event source, solidification, entity sync — see [architecture/brain.md](architecture/brain.md)

### Core Insight

```
File tree (folders, .md files)
       ↓ parse
Semantic tree (nodes with properties)
       ↓ render
Any UI (TUI, CLI, web)
       ↓ edit
Events → DB → File (bidirectional sync)
```

Your data stays in plain markdown. km adds queryability and navigation without lock-in.

---

## Quick Start

```bash
cd ~/any-project           # Any folder with .md files
km tasks                   # See tasks from markdown files
km view                    # Kanban board TUI
km init                    # Enable persistence (stable IDs, history)
```

---

## Documentation

### Understanding (Start Here)

| Doc                                | Description                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [principles.md](principles.md)     | **Start here.** How km works: composability, fast feedback, code for humans, governance, and AI agents |
| [glossary.md](glossary.md)         | **Terminology** — domain model, TEA, selection, rendering, storage                                     |
| [concepts.md](concepts.md)         | Core concepts: nodes, modes, status                                                                    |
| [architecture.md](architecture.md) | Building blocks, 5-layer stack, 4 data flows, ViewNode, composition model                              |
| [architecture/brain.md](architecture/brain.md) | Brain layer: chats, memory graph, knowledge tree, solidification                              |
| [storage.md](storage.md)           | SQLite schema, two modes, sync                                                                         |

### User Guides

| Doc                                        | Description                 |
| ------------------------------------------ | --------------------------- |
| [guides/tasks.md](guides/tasks.md)         | Tasks, boards, GTD workflow |
| [guides/cli.md](guides/cli.md)             | CLI commands                |
| [guides/use-cases.md](guides/use-cases.md) | Usage scenarios             |

### Reference

| Doc                                  | Description                          |
| ------------------------------------ | ------------------------------------ |
| [ref/ui.md](ref/ui.md)               | Views, navigation, design            |
| [ref/commands.md](ref/commands.md)   | Command system, keybindings          |
| [ref/query.md](ref/query.md)         | Query language                       |
| [ref/markdown.md](ref/markdown.md)   | Markdown parsing                     |
| [ref/task-fields.md](ref/task-fields.md) | Task fields, cross-system mapping |
| [ref/pipelines.md](ref/pipelines.md) | Async generator pipelines (complete) |
| [ref/prior-art.md](ref/prior-art.md) | Research notes                       |

### Lessons

| Doc                                                                  | Description                                   |
| -------------------------------------------------------------------- | --------------------------------------------- |
| [lessons/refactoring.md](lessons/refactoring.md)                     | Delete first, fix second (with examples)      |
| [lessons/filetree-as-peer.md](lessons/filetree-as-peer.md)           | Peer vs representation design                 |
| [lessons/km-me0n.md](lessons/km-me0n.md)                             | Test isolation after data corruption          |
| [lessons/incremental-rendering.md](lessons/incremental-rendering.md) | Debugging silvery fast-path bugs (build tooling) |

### Design

| Doc                                                                          | Description                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| [design/selection-model.md](design/selection-model.md)                       | Selection model — reactive signals, gestures, Selection.*/Selecting.* |
| [design/tea-state-machines.md](design/tea-state-machines.md)                 | TEA state machine architecture (`(state, op) -> [state, effects]`) |
| [design/phases.md](design/phases.md)                                         | TEA migration roadmap (phase status and key files)       |
| [design/data-model.md](design/data-model.md)                                 | Node tree (KNode, items vs blocks) and board hierarchy   |
| [design/outliner-spec.md](design/outliner-spec.md)                           | Outliner editing operations (split, indent, merge)       |
| [design/architecture-layers.md](design/architecture-layers.md)               | Four-layer architecture (Domain, Operations, Storage, Application) |
| [design/render-neutral-tui.md](design/render-neutral-tui.md)                 | Render-neutral TUI design                                |
| [design/terminal-integration-testing.md](design/terminal-integration-testing.md) | Terminal integration testing strategy                |
| [design/visual-navigation.md](design/visual-navigation.md)                   | Visual navigation design                                 |
| [architecture-review-findings.md](architecture-review-findings.md)           | Three-pass review: types, flows, composition, top 5 simplifications |

### Developer Guides

| Doc                                        | Description                         |
| ------------------------------------------ | ----------------------------------- |
| [dev/testing.md](dev/testing.md)           | Testing strategy and test types     |
| [dev/debugging.md](dev/debugging.md)       | Debugging TUI, storage, sync, tests |
| [dev/ink-patterns.md](dev/ink-patterns.md) | Ink TUI framework patterns          |
| [dev/releasing.md](dev/releasing.md)       | Versioning and releases             |

### Future

| Doc                                                              | Description                                         |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| [future/universal-editor.md](future/universal-editor.md)         | Universal editing platform (terminal + web, future) |
| [future/agents.md](future/agents.md)                             | AI agent orchestration (planned)                    |
| [future/beads.md](future/beads.md)                               | Beads issue tracking integration                    |
| [future/services.md](future/services.md)                         | CalDAV, CardDAV connectors (planned)                |

---

## Key Principles

See [principles.md](principles.md) for the full architectural philosophy. In brief:

**Product principles:**

- Everything is a node — folders, files, sections, tasks
- Zero setup — works on any markdown directory
- Markdown-native — files are the source of truth

**Engineering principles:**

- **Composability** — Domain objects and async generators make structures and flows composable
- **Quality enables fast feedback** — Fast tests (~11s) and fail-fast errors maintain the quality plateau
- **Readability matters** — Important logic first, implementation details after
- **Built for LLMs** — Delete legacy patterns (they're viral), maintain one obvious way to do things

---

## Two Modes

| Mode       | Trigger       | IDs       | History |
| ---------- | ------------- | --------- | ------- |
| **Memory** | No `.km/`     | Ephemeral | No      |
| **Disk**   | `.km/` exists | Stable    | Yes     |

Memory mode: SQLite in RAM, rebuilt each run. Great for quick access.
Disk mode: SQLite persisted, full event history. Enable with `km init`.

---

## See Also

- [CLAUDE.md](../CLAUDE.md) — Agent instructions
- [README.md](../README.md) — Project overview
