# km-beads

`km bd` is a roughly CLI-compatible drop-in replacement for `bd` that backs all data with km's markdown nodes instead of the `.beads` database.

## Architecture

Issues are regular km tasks with an `@issue` link — there is no separate issue tracker database. The `@issues.md` board shows backlinks automatically. This means issues live alongside notes and tasks in the same markdown tree, benefit from the same sync/history infrastructure, and can be viewed in the TUI.

## Current State

- **Read queries work**: `ready`, `list`, `show` resolve issues from the km storage layer
- **Mutations are in-memory only**: `create`, `update`, `close` modify the in-memory tree but don't persist to disk yet
- **Key gap**: Write-path integration with km-storage (persisting changes back to markdown files)

## Why Not Proxy to `bd`?

`bd` operates on `.beads/beads.db` (a SQLite database). `km bd` should operate on km's markdown tree. They are different data sources with different storage models. Proxying to `bd` would bypass km's storage layer entirely, defeating the purpose of unified data.

## Design Reference

See [docs/future/beads.md](../../docs/future/beads.md) for the full spec including data model, CLI commands, dependency system, and migration plan.
