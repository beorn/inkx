---
mentions:
  - km
  - Bjørn
id: "@km/storage/private-emitter"
aliases:
  - km-storage.private-emitter
  - km-storage-private-emitter
created_by: Bjørn Stabell
created_at: 2026-04-01T06:10:53Z
closed_at: 2026-04-02T21:06:19Z
close_reason: "Fixed: SyncManager accepts injected emitter via SyncConfig. Added
  skipFsSync to EmitOptions + wrapEmitterForReconcile() for FS-origin events.
  TUI/daemon inject shared repo emitter. 5 new emitter tests. Commits
  69903bd9..649b7269."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] SyncManager creates private emitter instead of sharing repo's emitter @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/sync.ts:100-115, 348-387
Classification: P1

SyncManager creates its own Emitter with createEmitter(). Reconcile-generated fs-watch events go through this.emitter, which has no eventHub and no shared repo notification path. FS-origin DB changes can bypass normal UI broadcast/version-update path.

Suggested fix: Inject the repo's shared Emitter into SyncManager instead of constructing a second one. One emitter per repo.

