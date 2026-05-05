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
owner: bjorn@stabell.org
assignee: Bjørn Stabell
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

## Erratum (2026-05-05)

The 2026-04-03 close was premature on one criterion: "repo.emitter public access (consumers use repo.apply/commit)." Verification at the time was a grep for the string `repo.emitter`, but the field remained on the public `SyncableRepo` interface (and on `Repo` via extension). Three months later, `packages/km-fs-mount/src/watch/sync.ts:149` still had `const emitter = repo.emitter`, and the interface was still typed to allow it.

The actual L4 fix (compile-time invariant: `"emitter" extends keyof Repo` is `false`) shipped 2026-05-05 in commit `df353f2c7` — `refactor(km-storage,km-fs-mount): drop repo.emitter from public surface; pass via decorator (L4 plateau)`. New regression test `repo-emitter-not-public.test.ts` pins the invariant going forward. Consumers that legitimately need the emitter use the typed `getRepoEmitter(repo)` accessor (WeakMap-backed, registered at factory construction).

This bead stays closed (the original work shipped most of what was scoped), but future "is the legacy gone?" verification should grep for the COMPILE-TIME invariant, not just string matches in source. Lesson: closing on grep counts is L1; closing on a TS compilation invariant + pinning test is L4.