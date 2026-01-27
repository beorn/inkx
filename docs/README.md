# km Documentation

**km** is a PIM/PKM engine that turns markdown files into a semantic tree.

---

## What km Does

km transforms a directory of markdown files into a **unified node tree** that can be:

- Queried (find tasks, filter by status, search content)
- Navigated (board view, tree view, list view)
- Edited (changes sync bidirectionally to files)
- Extended (custom content types via frontmatter)

**Currently implements:** Task management with GTD workflow
**Planned:** Notes, contacts, calendar events, custom content types

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

| Doc                                | Description                            |
| ---------------------------------- | -------------------------------------- |
| [principles.md](principles.md)     | **Start here.** Why we build this way  |
| [concepts.md](concepts.md)         | Core concepts: nodes, modes, status    |
| [architecture.md](architecture.md) | System layers, data flow, event system |
| [storage.md](storage.md)           | SQLite schema, two modes, sync         |

### User Guides

| Doc                                        | Description                 |
| ------------------------------------------ | --------------------------- |
| [guides/tasks.md](guides/tasks.md)         | Tasks, boards, GTD workflow |
| [guides/cli.md](guides/cli.md)             | CLI commands                |
| [guides/use-cases.md](guides/use-cases.md) | Usage scenarios             |

### Reference

| Doc                                  | Description                 |
| ------------------------------------ | --------------------------- |
| [ref/ui.md](ref/ui.md)               | Views, navigation, design   |
| [ref/commands.md](ref/commands.md)   | Command system, keybindings |
| [ref/query.md](ref/query.md)         | Query language              |
| [ref/markdown.md](ref/markdown.md)   | Markdown parsing            |
| [ref/prior-art.md](ref/prior-art.md) | Research notes              |

### Developer Guides

| Doc                                        | Description                |
| ------------------------------------------ | -------------------------- |
| [dev/testing.md](dev/testing.md)           | Testing strategy           |
| [dev/debugging.md](dev/debugging.md)       | Debugging workflow         |
| [dev/ink-patterns.md](dev/ink-patterns.md) | Ink TUI framework patterns |
| [dev/releasing.md](dev/releasing.md)       | Versioning and releases    |

### Future

| Doc                                      | Description                          |
| ---------------------------------------- | ------------------------------------ |
| [future/agents.md](future/agents.md)     | AI agent orchestration (planned)     |
| [future/beads.md](future/beads.md)       | Beads issue tracking integration     |
| [future/services.md](future/services.md) | CalDAV, CardDAV connectors (planned) |

---

## Key Principles

See [principles.md](principles.md) for the full architectural philosophy. In brief:

**Product principles:**

- Everything is a node — folders, files, sections, tasks
- Zero setup — works on any markdown directory
- Markdown-native — files are the source of truth

**Engineering principles:**

- Domain objects via factory functions (not classes, not singletons)
- Explicit dependencies (pass them in, don't reach for globals)
- Fail fast (throw on programming errors, no defensive fallbacks)
- Fast tests (<5s feedback loop via in-memory infrastructure)

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
