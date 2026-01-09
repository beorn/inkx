# km Specifications

A local-first knowledge and task management system built on markdown files.

---

## Quick Start

**km** unifies folders, files, and markdown content into a queryable tree. Run `km tasks` in any directory with `.md` files — no setup required.

```bash
km tasks              # List all tasks
km board              # Kanban view
km tree               # Show structure
```

For full features (history, sync), initialize with `km init`.

---

## Reading Order

| # | Spec | Description |
|---|------|-------------|
| 1 | [Overview](km-overview.md) | Design principles, architecture, quick reference |
| 2 | [Data Model](km-data-model.md) | Nodes, events, storage schema |
| 3 | [Store](km-store.md) | Persisted vs in-memory modes |
| 4 | [Display](km-display.md) | Views, collapsing, formatting |
| 5 | [CLI](km-cli.md) | Commands and TUI |

### Supporting Specs

| Spec | Description | Status |
|------|-------------|--------|
| [Markdown](km-markdown.md) | Parsing, AST conversion | Implemented |
| [Watch](km-watch.md) | Bidirectional filesystem sync | Persisted mode |
| [Agents](km-agents.md) | AI agent orchestration | Future |

---

## Glossary

| Term | Definition |
|------|------------|
| **fs-tree** | Raw filesystem: folders, files, markdown content. Source of truth. |
| **km-tree** | Unified node hierarchy in SQLite. Queryable. |
| **display-tree** | Render-time transformation with collapsing and formatting. |
| **node** | Everything is a node: folder, file, section, task, paragraph, etc. |
| **collapsing** | Unifying same-named folder/file/section into one display line. |
| **persisted mode** | `.km/` exists. Full features: events, history, sync. |
| **in-memory mode** | No `.km/`. Zero setup. Read-write to `.md` files. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI / TUI                                                      │
│  km tasks, km board, km tree                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Display Layer              (km-display.md)                     │
│  Collapsing, type indicators, formatting                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Store Layer                (km-store.md)                       │
│  NodeStore interface → PersistedStore | MemoryStore             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  km-tree                    (km-data-model.md)                  │
│  Unified nodes in SQLite                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  fs-tree                    (km-markdown.md)                    │
│  Markdown files on disk                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

1. **Everything is a node** — folders, files, sections, tasks, paragraphs
2. **Zero setup** — works on any markdown directory
3. **Markdown-native** — files are the source of truth
4. **Git-friendly** — plain text, mergeable
5. **Progressive enhancement** — `km init` adds persistence when needed
