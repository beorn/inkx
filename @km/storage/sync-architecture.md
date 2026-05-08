---
mentions:
  - km
id: "@km/storage/sync-architecture"
aliases:
  - km-storage.sync-architecture
  - km-storage-sync-architecture
created_by: Bjørn Stabell
created_at: 2026-03-31T21:42:54Z
owner: bjorn@stabell.org
---

# [ ] Sync architecture consolidation — centralize flows, clear layers, quality plateau @km/storage #task #P2 @agent/3

Bring the sync pipeline to a quality plateau. Currently spread across ~10 files with overlapping concerns. Goal: single entry point, clearly-named phases, uniform error handling, architectural documentation. Should be done AFTER P0/P1 fixes stabilize behavior. Includes: consolidate fs-writer + sync overlap, clear responsibility boundaries, inline flow documentation, sync/README.md with pipeline diagram.

## Plateau Closure Plan

This is the umbrella bead for getting storage sync/reconcile/materialization to
the quality plateau. The current plateau target is narrower than "clean every
storage file": the live read/write paths should have one owner per derived
state, no read-only command should mutate source markdown, and tests should
catch the known corner classes.

Work in this order:

1. ![[read-only-command-invariants]]
2. ![[reconcile-single-owner]]
3. ![[materialization-safety-invariants]]
4. ![[reconcile-chaos-matrix]]
5. ![[storage-test-harness-enforcement]]

Exit criteria:

- One canonical same-path file update/reconcile flow is shared by loader,
  post-frame reconcile, watcher, and sync.
- Read-only commands have source-file no-write invariants.
- `km.add` materialization is opt-in, item-only by default, bounded, and deduped.
- Storage reconcile has a matrix/chaos suite covering update, rename, delete,
  collapsed files, and link churn.
- Storage tests use canonical DI seams by default, with documented exceptions.
