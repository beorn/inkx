---
aliases:
  - km-storage.cli-mutation-unified-with-view-path
  - km-storage-cli-mutation-unified-with-view-path
created_at: 2026-05-06T22:00:30.860Z
---

# Doctrine: CLI mutation = view mutation = MCP mutation = one path (repo.updateNode); sync handles FS both ways #P3

Codify and document the unified mutation pipeline.

## The rule

Every code path that changes node state — `km bd close`, `km task new`, `km set`, `km view` keypress (set_status_done, etc.), MCP tools, watcher reconciliation — converges on the same surface: `repo.updateNode` (and its lifecycle wrappers like `closeTaskLifecycle`).

No code path writes to .md files directly. FS writes happen exclusively through:
- `km sync --to-fs` (and the daemon equivalent) — projects DB state to markdown
- `km sync --from-fs` (and fs-watcher) — indexes user edits back into DB

The two writers (CLI/view/MCP through repo.updateNode, vs the user's editor on .md files) never compete for the same file because the CLI/view path owns the DB-side write while the editor owns the FS-side write; sync materializes the gap.

## Why this matters

- **No drift between surfaces.** `km view` setting status done and `km bd close` produce byte-identical state on disk. Property test pinnable.
- **No CLI-to-FS races.** CLI commands don't have to coordinate with fs-watcher writes.
- **Sync is the contract.** If the FS doesn't reflect what bd close did, that's a sync bug, not a close bug. Localizes responsibility.
- **Easier MCP exposure.** Future MCP tools call repo.updateNode; the FS materialization is automatic.

## Acceptance

- [ ] `packages/km-storage/CLAUDE.md` has a 'Mutation pipeline' section describing the unified rule
- [ ] `docs/architecture.md` adds the two-writer / two-indexer model to the layer description
- [ ] Lint or doctest blocks any new `fs.writeFile` / `Bun.write` for .md paths in apps/km-cli/src/commands/ — these must go through @km/storage
- [ ] Wave 4 generic km verbs (`km set`, `km move`, `km clear`) implement against repo.updateNode, not direct FS
- [ ] km view's TASK_SET_STATUS handler and bd close share the same lifecycle helper underneath (no duplicate close-side logic)
