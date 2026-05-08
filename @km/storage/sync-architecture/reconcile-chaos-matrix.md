---
aliases:
  - km-storage.sync-architecture.reconcile-chaos-matrix
  - km-storage-sync-architecture-reconcile-chaos-matrix
created_at: 2026-05-08T20:45:35.267Z
---

# Storage reconcile chaos matrix for update rename delete and links @km/storage #task @agent/3 #P1

Extend the existing storage reconcile chaos/fuzz harness so the update path is covered across real corner cases, not just one markdown edit regression. Acceptance: matrix covers create, same-path update, delete, rename, collapsed/un-collapsed files, wikilink changes, same-size content changes, mtime-only changes, and mtime/hash disagreement; verifies node identity stability/freshness and link graph correctness; suite is either fast enough for targeted CI or documented under slow/fuzz with a clear command.
