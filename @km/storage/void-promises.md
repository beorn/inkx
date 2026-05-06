---
mentions:
  - km
id: "@km/storage/void-promises"
aliases:
  - km-storage.void-promises
  - km-storage-void-promises
created_by: Bjørn Stabell
created_at: 2026-04-02T20:51:14Z
closed_at: 2026-04-02T21:21:40Z
close_reason: "Fixed: removed 15 void prefixes from fsTarget calls. SyncManager
  implementation is synchronous — void was misleading. Commit 1542464b."
owner: bjorn@stabell.org
---

# [x] [bug] void this.fsTarget.writeFile() — 15+ fire-and-forget writes never awaited @km/storage #bug #P1

Found by /big review. EventHandlers has 15+ void this.fsTarget.writeFile() calls (lines 143, 190, 202, 205, 216, 245, 267, 292, 309, 340, 368, 375). FsWriteTarget returns void|Promise<void> but return is discarded. Writes can silently fail. Fix: collect promises, await in bulk, or make writeFile synchronous in the interface.

