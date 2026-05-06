---
mentions:
  - km
  - Bjørn
id: "@km/storage/remove-setfssync"
aliases:
  - km-storage.remove-setfssync
  - km-storage-remove-setfssync
created_by: Bjørn Stabell
created_at: 2026-04-03T01:54:49Z
closed_at: 2026-04-03T02:31:05Z
close_reason: setFsSync/FsSync/save removed from Emitter. withSync and
  withFsWriter wrap apply() directly. Zero SyncManager refs.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Remove setFsSync/FsSync — withSync and withFsWriter wrap apply() directly @km/storage #task #P2 @Bjørn Stabell

setFsSync/FsSync are old callback wiring. Both sync paths should be decorators:

- withSync(config)(repo) — already exists, but still calls emitter.setFsSync internally
- withFsWriter(repo) — new, replaces FsWriter class for CLI mode

Change withSync to wrap repo.apply() directly (save-to-FS in the wrapped apply).
Convert FsWriter class to withFsWriter decorator (same pattern).
Delete setFsSync, getFsSync, FsSync from Emitter interface.
Also clean up ~22 SyncManager comment references.

