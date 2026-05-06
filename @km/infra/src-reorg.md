---
mentions:
  - km
  - Bjørn
id: "@km/infra/src-reorg"
aliases:
  - km-infra.src-reorg
  - km-infra-src-reorg
created_by: Bjørn Stabell
created_at: 2026-04-03T14:56:00Z
closed_at: 2026-04-03T15:16:40Z
close_reason: "All 3 packages reorganized: km-storage (43→12 root files, 5
  subdirs), km-tree (19→13 root files, ops/ subdir), km-tui (44→28 root files,
  state/ + navigation/ + board/ absorption). Commits b20f13bd, 4203d90a,
  f6312033."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Reorganize flat src/ dirs into subdirectories — km-storage, km-tui, km-tree @km/infra #task #P2 @Bjørn Stabell

43 files in @km/storage/src, 44 in @km/tui/src, 19 in @km/tree/src — all too flat.

Phase 1: @km/storage/src

- db/: db.ts, db-events.ts, db-insert.ts, db-links.ts, db-ops.ts, db-rules.ts, schema.ts + absorb db-queries/
- store/: store.ts, store-types.ts, store-base.ts, store-memory.ts, sqlite-store.ts, fs-store.ts, commit-types.ts, reactive.ts
- repo/: repo.ts, repo-loader.ts, repo-hooks.ts, repo-test.ts
- fs/: file-tree.ts, cas.ts, path-utils.ts, id-utils.ts, ignore.ts
- markdown/: markdown-processing.ts, pipeline.ts, deferred-parsing.ts, parse-pool.ts, parse-worker.ts, link-resolution.ts, link-resolver.ts
- Keep at root: config.ts, config-object.ts, emitter.ts, query.ts, recurrence.ts, data-store.ts, event-compaction.ts, watcher.ts, index.ts, item-helpers.ts, index-file-writer.ts, discovery.ts

Phase 2: @km/tui/src

- state/: board-app-store.ts, cursor-store.ts, ui-context.tsx, ui-reducer.ts, reactive.ts, store-context.tsx, raw-signals.ts, selection.ts, selection-engine.ts
- Absorb into board/: board-app.ts, board-types.ts, board-pills.ts, command-bridge.ts
- navigation/: navigate-to-node.ts, view-navigation.ts, path.ts, sibling-index.ts

Phase 3: @km/tree/src

- ops/: block-ops.ts, operations.ts, operation-log.ts, history.ts, normalize.ts, actions.ts

