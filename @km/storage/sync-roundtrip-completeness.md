---
aliases:
  - km-storage.sync-roundtrip-completeness
  - km-storage-sync-roundtrip-completeness
created_at: 2026-05-06T21:59:41.696Z
---

# Sync roundtrip completeness — DB↔FS materialization is the single source of truth pipeline #epic #P2

Tracking epic for the doctrine that all mutation paths converge on repo.updateNode and sync handles materialization in both directions, with no path writing FS directly.

## The unified rule

```
        ┌──────────────────────────────────┐
        │            repo.updateNode        │  ← single mutation API
        └──────────────────────────────────┘
                      ▲           │
                      │           │
   km view ──────────┤           │   sync --to-fs / fs-watcher (sync side B)
   km bd  ───────────┤           ▼
   km task ──────────┤   ┌──────────────────┐
   km <verb> ────────┤   │   markdown files  │ ← user editor (the other writer)
   MCP tools ────────┘   └──────────────────┘
                                ▲
                                │
                       sync --from-fs / fs-watcher (sync side A)
                                │
                                ▼
                        ┌─────────────┐
                        │   .km/state.db (cache + index) │
                        └─────────────┘
```

- **CLI mutation = view mutation = MCP mutation = ONE path.** All produce/dispatch an Op (or call a lifecycle helper) that ends in repo.updateNode. No CLI command writes to .md files directly.
- **Sync materializes both directions.** DB → FS (project status markers, frontmatter, content). FS → DB (index user edits via fs-watcher and explicit `km sync --from-fs`).
- **Two writers, two indexers.** Writer 1: any code calling repo.updateNode. Writer 2: user's editor on .md files. Indexer 1: sync DB→FS. Indexer 2: sync FS→DB. No code path is both writer-and-FS-writer.

## Children

- @km/storage/sync-to-fs-projects-full-state — sync --to-fs doesn't project task_status / closed_at / close_reason / title markers
- @km/storage/safe-write-conflict-noise — watcher-vs-writer warnings spam every CLI mutation
- @km/storage/rename-updates-id-column — bd rename A B updates fs_path but DB id column stays at A
- @km/storage/cli-mutation-unified-with-view-path — doctrine doc + arch update making the rule canonical

## Acceptance

- [ ] @km/storage/CLAUDE.md and docs/architecture.md describe the unified pipeline + the two-writer / two-indexer model
- [ ] km bd close X then check git diff X.md — title is [x], frontmatter has closed_at + close_reason
- [ ] km view's set_status_done on the same node produces identical git diff to bd close
- [ ] km bd rename A B; km bd show A → 'not found' (B is canonical); km bd list --json shows id=B fs_path matches
- [ ] No 'safe-write conflict' warnings on routine CLI mutations
- [ ] CLI command source files contain zero direct fs.writeFile or path-write calls; all mutations go through @km/storage
