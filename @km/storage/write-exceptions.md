---
id: "@km/storage/write-exceptions"
aliases:
  - km-storage.write-exceptions
  - km-storage-write-exceptions
created_at: 2026-02-08T13:46:28Z
closed_at: 2026-02-08T21:03:53Z
assignee: claude:dffe6eeb
---

# [x] Write failures in SyncManager/WriteQueue must throw exceptions, not silently fail @km/storage #bug #P2 @claude:dffe6eeb

When SyncManager/WriteQueue fails to write a file (e.g. stale absolute path, permission error, missing directory), the failure is silently swallowed. The user sees their edit succeed in the TUI but the filesystem never changes.

Fix: Write failures should propagate as exceptions or at minimum emit visible error events that the TUI can display (e.g. toast notification). Currently notifyFs() returns void and errors in the writeQueue are only logged at debug level.