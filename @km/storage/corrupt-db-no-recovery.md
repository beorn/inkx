---
id: "@km/storage/corrupt-db-no-recovery"
aliases:
  - km-storage.corrupt-db-no-recovery
  - km-storage-corrupt-db-no-recovery
created_by: Bjørn Stabell
created_at: 2026-04-06T20:49:02Z
closed_at: 2026-04-06T20:59:55Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Fatal crash on corrupt state.db — recovery exists but isn't wired @km/storage #bug #P1 @Bjørn Stabell

Corrupting .km/state.db crashes km in configurePragmas. But deleting state.db entirely (leaving changes.jsonl) WORKS — km rebuilds.

Fix: catch SQLiteError in configurePragmas, move corrupt db aside (state.db.corrupt), rebuild from changes.jsonl WAL. Recovery machinery exists, just needs wiring.