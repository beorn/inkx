---
id: "@km/storage/sync-refactor"
aliases:
  - km-storage.sync-refactor
  - km-storage-sync-refactor
created_by: Bjørn Stabell
created_at: 2026-04-02T20:46:24Z
closed_at: 2026-04-03T00:40:24Z
close_reason: All phases shipped. withSync(config)(repo) decorator pattern. 10 commits total.
owner: bjorn@stabell.org
---

# [x] [epic] Sync module refactor — class to factory, dedup, extract heartbeat+bulk @km/storage #epic #P2

Refactor packages/@km/storage/src/watch/ sync module.

## Approved Design

const repo = withSync(config)(createRepo(path, db))

createRepo — pure data + events. apply(event) does DB + journal + broadcast.
withSync — decorator. Wraps apply() at creation time to add FS save.
No event bus, no subscription API. Function composition at creation.

## Domain Vocabulary
- apply(event) — make event take effect (DB + journal + broadcast + save)
- save(node) — serialize node's file to disk
- reconcile(dir) — diff FS vs DB → events

## Completed
- Phase 1: dedup createBlockIdAssigner (36e775f1)
- Phase 2: extract heartbeat to createHeartbeat() factory (460bae4d)
- Phase 3: extract bulk sync to BulkSync namespace (287efe40)
- save(node) domain verb on EventHandlers (75c61141)
- Emitter.emit→apply + project→save rename (5faa26e0)

## In Progress
- Phase 4a: SyncManager class → createSync() factory (agent running)
- Phase 4b: Merge Emitter into Repo — repo.apply(event)
- Phase 4c: Convert createSync → withSync decorator

## Future
- Update Domain Object Inventory in docs/principles.md
- Remove Infrastructure Class Exception for SyncManager
- Update watch/README.md vocabulary
- Era2: run(view, { sync: withSync(...) }) provider model