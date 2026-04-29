---
id: "@km/storage/delete-suppression"
aliases:
  - km-storage.delete-suppression
  - km-storage-delete-suppression
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:35Z
closed_at: 2026-04-03T02:31:07Z
close_reason: Tombstone tracking in WriteTokenMap. 10 tests.
owner: bjorn@stabell.org
---

# [x] Add delete/unlink ownership suppression — writes and renames covered, deletes not @km/storage #task #P2

From Pro review: WriteToken ownership covers writes and renames but NOT deletes/unlinks. When km deletes a file, the watcher sees the unlink and may try to reconcile it.

FIX: Add delete tracking to sync_state (tombstone entries). When km deletes a file, record in sync_state. Watcher checks before processing unlink events.