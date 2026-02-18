# km-beads

`km bd` is a CLI-compatible drop-in replacement for `bd` that backs all data with km's markdown nodes instead of the `.beads` database.

## Architecture

Issues are regular km tasks with an `@issue` link — there is no separate issue tracker database. The `@issues.md` board shows backlinks automatically. Issues live alongside notes and tasks in the same markdown tree, benefit from the same sync/history infrastructure, and can be viewed in the TUI.

### Unified Query Interface

`km bd list/query` and `km list/query` share the **same interface** — same DSL, same flags, same backend (`repo.query()`). The only differences:

- **Default filter**: `km bd` implicitly scopes to `@issue`-tagged nodes
- **Default output format**: `km bd` uses bd-style formatting (short IDs, priority badges, status labels)

If you know km's query DSL, you already know `km bd`'s.

### Detail View Metadata

The TUI detail pane shows all known fields (status, priority, due, assigned, tags, subtasks, backlinks). Any `node.data` field that doesn't map to a known UI field is rendered as a generic `key: value` line, so bd-style metadata (close_reason, design, notes, etc.) is always visible.

## Current State

- **Read queries work**: `ready`, `list`, `show` resolve issues from the km storage layer
- **Mutations are in-memory only**: `create`, `update`, `close` modify the in-memory tree but don't persist to disk yet
- **Key gap**: Write-path integration with km-storage (persisting changes back to markdown files)

## Tiered Roadmap

| Tier                 | Scope                                             | Status                              |
| -------------------- | ------------------------------------------------- | ----------------------------------- |
| 1. Core CRUD         | create, update, close, show, list, delete, rename | Reads work; writes need persistence |
| 2. Workflow          | ready, blocked, stale, defer/undefer, comments    | Partial (ready/blocked reads work)  |
| 3. Hierarchy         | children, epic, dep add/remove/list               | Not started                         |
| 4. Unified Query     | Shared query interface for km + km bd             | Design decided, not started         |
| 5. Proxy Passthrough | Advanced bd commands (agent, slot, gate, etc.)    | Blocked on decision                 |

## Why Not Proxy to `bd`?

`bd` operates on `.beads/beads.db` (a SQLite database). `km bd` operates on km's markdown tree. They are different data sources with different storage models. Proxying to `bd` bypasses km's storage layer entirely, defeating the purpose of unified data.

## Design Reference

See [docs/future/beads.md](../../docs/future/beads.md) for the full spec including data model, CLI commands, dependency system, and migration plan.
