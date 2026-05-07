---
mentions:
  - km
id: "@km/link-perf/0-batch-link-inserts-in-transaction"
aliases:
  - km-link-perf.0
  - km-link-perf-0
  - "@km/link-perf/0"
created_at: 2026-01-23T14:49:25Z
closed_at: 2026-01-23T15:02:58Z
---

# [x] Batch link INSERTs in transaction @km/link-perf #task #P2

Currently each addLink() is a separate INSERT.
Batch all links and insert in a single transaction for ~50% speedup.

File: packages/@km/storage/src/vault-loader.ts resolveLinks()

