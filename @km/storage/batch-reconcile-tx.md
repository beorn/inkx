---
id: "@km/storage/batch-reconcile-tx"
aliases:
  - km-storage.batch-reconcile-tx
  - km-storage-batch-reconcile-tx
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:31Z
---

# [ ] Batch reconciliation events in a transaction — prevent flicker @km/storage #task #P3

From Pro review: Reconciling one file may emit many events (node_created, node_updated, etc.) with no transaction boundary. TUI observes them as individual events causing flicker and intermediate invalid state.

FIX: Add txId/reconcileId to batch events. DB applies in a single SQLite transaction. TUI batches rendering for events with same txId.