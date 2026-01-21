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

### Understand (Start Here)

| Doc                                      | Description                                |
| ---------------------------------------- | ------------------------------------------ |
| [01-concepts.md](01-concepts.md)         | Core concepts: nodes, modes, status, links |
| [02-architecture.md](02-architecture.md) | Layers, data flow, event system            |

### Build (How It Works)

| Doc                              | Description                |
| -------------------------------- | -------------------------- |
| [03-storage.md](03-storage.md)   | SQLite schema, modes, sync |
| [04-markdown.md](04-markdown.md) | Markdown parsing           |
| [05-query.md](05-query.md)       | Query language             |

### Use (User-Facing)

| Doc                              | Description                         |
| -------------------------------- | ----------------------------------- |
| [06-ui.md](06-ui.md)             | Views, navigation, design system    |
| [07-tasks.md](07-tasks.md)       | Tasks, boards, GTD workflow         |
| [08-cli.md](08-cli.md)           | CLI commands                        |
| [09-commands.md](09-commands.md) | Unified command system, keybindings |

### Extend (Future)

| Doc                                      | Description                          |
| ---------------------------------------- | ------------------------------------ |
| [future/agents.md](future/agents.md)     | AI agent orchestration (planned)     |
| [future/beads.md](future/beads.md)       | Beads issue tracking integration     |
| [future/services.md](future/services.md) | CalDAV, CardDAV connectors (planned) |

### Developer Guides

| Doc                                        | Description                |
| ------------------------------------------ | -------------------------- |
| [dev/testing.md](dev/testing.md)           | Testing strategy           |
| [dev/ink-patterns.md](dev/ink-patterns.md) | Ink TUI framework patterns |
| [dev/prior-art.md](dev/prior-art.md)       | Research notes             |
| [dev/use-cases.md](dev/use-cases.md)       | Test scenarios             |

---

## Key Principles

1. **Everything is a node** — folders, files, sections, tasks, paragraphs
2. **Zero setup** — works on any markdown directory
3. **Markdown-native** — files are the source of truth
4. **Git-friendly** — plain text, mergeable
5. **Progressive enhancement** — `km init` adds persistence when needed

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
