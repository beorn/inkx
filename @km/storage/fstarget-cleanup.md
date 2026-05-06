---
mentions:
  - km
id: "@km/storage/fstarget-cleanup"
aliases:
  - km-storage.fstarget-cleanup
  - km-storage-fstarget-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:18Z
owner: bjorn@stabell.org
---

# [ ] Clean up FsWriteTarget — too many optional methods (9) @km/storage #task #P3

From /big quality review: FsWriteTarget has 4 required + 6 optional methods (markInFlight, clearInFlight, recordWriteToken, renamePending, dropPending, renamePendingSubtree). The optionals couple EventHandlers to watcher/queue internals.

FIX: Group optional methods into a separate SyncCapabilities interface. EventHandlers takes FsWriteTarget (required methods only). SyncManager passes SyncCapabilities separately or as a wrapper.

