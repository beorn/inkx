# km Documentation

Knowledge Machine — a markdown-native task and knowledge management system.

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

### Core Concepts

| Doc                                      | Description                                |
| ---------------------------------------- | ------------------------------------------ |
| [01-concepts.md](01-concepts.md)         | Core concepts: nodes, modes, status, links |
| [02-architecture.md](02-architecture.md) | Package structure, layers, data flow       |
| [03-storage.md](03-storage.md)           | SQLite schema, modes, events               |

### Data & Sync

| Doc                              | Description                        |
| -------------------------------- | ---------------------------------- |
| [04-sync.md](04-sync.md)         | Bidirectional filesystem sync      |
| [05-markdown.md](05-markdown.md) | Markdown parsing and serialization |
| [06-query.md](06-query.md)       | Query language for filtering nodes |

### User Interface

| Doc                                  | Description                      |
| ------------------------------------ | -------------------------------- |
| [07-navigation.md](07-navigation.md) | Visual navigation model          |
| [08-ui.md](08-ui.md)                 | Views, collapsing, design system |
| [09-cli.md](09-cli.md)               | CLI commands and keybindings     |

### Task Management

| Doc                                | Description                           |
| ---------------------------------- | ------------------------------------- |
| [10-tasks.md](10-tasks.md)         | Task data model, boards, GTD workflow |
| [11-templates.md](11-templates.md) | GTD and other templates               |

### Future

| Doc                              | Description                          |
| -------------------------------- | ------------------------------------ |
| [12-agents.md](12-agents.md)     | AI agent orchestration (planned)     |
| [13-services.md](13-services.md) | CalDAV, CardDAV connectors (planned) |

### Developer Guides

| Doc                                  | Description                             |
| ------------------------------------ | --------------------------------------- |
| [dev/testing.md](dev/testing.md)     | Testing strategy and patterns           |
| [dev/prior-art.md](dev/prior-art.md) | Research on metadata syntax, recurrence |
| [dev/use-cases.md](dev/use-cases.md) | Test scenarios and workflows            |

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

## Architecture Overview

```
packages/                          # Shared libraries
  @km/storage    - DBNode, SQLite, queries, events
  @km/markdown   - Parser (markdown ↔ DBNode)
  @km/tree       - TNode, tree queries, display names
  @km/board      - BoardState, cursor, selection, fold

apps/
  km-cli/        → @km/cli-app     CLI commands
  km-sh/         → @km/sh-app      Shell application
  km-tui/        → @km/tui-app     TUI application
    packages/
      km-ink/    → @km/ink         React/Ink renderer
      km-opentui/→ @km/opentui     OpenTUI renderer
```

---

## See Also

- [CLAUDE.md](../CLAUDE.md) — Agent instructions
- [README.md](../README.md) — Project overview
