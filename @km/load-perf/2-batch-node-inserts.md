---
id: "@km/load-perf/2-batch-node-inserts"
aliases:
  - km-load-perf.2
  - km-load-perf-2
  - "@km/load-perf/2"
created_at: 2026-01-23T15:03:42Z
closed_at: 2026-01-23T15:22:47Z
---

# [x] Batch node INSERTs @km/load-perf #task #P2

Apply same batch INSERT pattern used for links to node creation.
Currently individual db.run() per event.

File: packages/@km/storage/src/db-events.ts
Lines: 76-120 (applyNodeCreated)

Expected impact: 5-10x faster apply phase