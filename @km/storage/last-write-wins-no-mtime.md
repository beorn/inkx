---
id: "@km/storage/last-write-wins-no-mtime"
aliases:
  - km-storage.last-write-wins-no-mtime
  - km-storage-last-write-wins-no-mtime
created_by: Bjørn Stabell
created_at: 2026-04-06T20:49:00Z
closed_at: 2026-04-07T01:16:18Z
close_reason: "Fixed in acdc7db46: mtime baseline capture in repo write path,
  hash-based conflict detection in writequeue, conflict events emitted with
  backup paths. UI loop closed in 7b8cf46d1 (sync-conflict toast). 88 writequeue
  tests + storage-bugs.slow.test.ts coverage."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] P0: Concurrent external edits silently overwritten — last_write_wins never checks mtime @km/storage #bug #P0 @Bjørn Stabell

Repro: open km on a vault, enter edit mode, externally edit the file (echo >> file.md), confirm km edit. External edits gone, no warning, no backup.

@km/storage/src/watch/sync.ts conflictStrategy='last_write_wins' is really 'km_always_wins'. Never checks mtime/hash before write.

Fix: detect mtime/hash mismatch before write. On conflict: prompt resolution OR write .conflict backup OR refuse to write.