---
mentions:
  - km
id: "@km/storage/disk-reconcile"
aliases:
  - km-storage.disk-reconcile
  - km-storage-disk-reconcile
created_by: claude:550b034d
created_at: 2026-02-12T13:31:00Z
closed_at: 2026-02-12T13:54:05Z
owner: bjorn@stabell.org
---

# [x] Disk mode doesn't reconcile with filesystem on startup — new files invisible @km/storage #bug #P0

loadRepo disk mode trusts events.jsonl blindly. Files added to the repo (e.g. PDFs in inbox/) that aren't in events.jsonl are invisible until something triggers a watcher event in that directory. Need startup reconciliation: compare filesystem with DB state, create events for new/deleted files.

