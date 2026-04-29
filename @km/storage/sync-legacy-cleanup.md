---
id: "@km/storage/sync-legacy-cleanup"
aliases:
  - km-storage.sync-legacy-cleanup
  - km-storage-sync-legacy-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-03T00:58:10Z
closed_at: 2026-04-03T01:15:31Z
close_reason: 100% clean. Zero createSync, setFsSync, FsSync, repo.emitter,
  SyncManager in .ts files. Doc references fixed.
---

# [x] Eliminate createSync legacy wrapper + setFsSync + repo.emitter access @km/storage #task #P2 @Bjørn Stabell

Eliminate ALL legacy/dual paths from sync refactor. Zero backwards compat.

Delete:
- createSync() legacy wrapper
- LegacySyncConfig type
- setupSync() helper (setFsSync wiring)
- setFsSync() from Emitter interface
- FsSync interface (if unused after above)
- repo.emitter public access (consumers use repo.apply/commit)
- All ~22 "SyncManager" comment references

Target state:
- withSync(config)(repo) is the ONLY way to add sync
- repo.apply(event) is the ONLY way to apply events
- No setFsSync, no FsSync, no createSync, no SyncManager references
- Emitter is internal to Repo — not exposed

After this: zero dual paths, zero legacy wrappers, zero backwards compat shims.