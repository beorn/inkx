---
mentions:
  - km
id: "@km/load-perf"
aliases:
  - km-load-perf
  - "@km/_orphan/load-perf"
created_at: 2026-01-23T15:03:29Z
closed_at: 2026-01-23T15:22:52Z
---

# [x] Vault loading performance optimizations @km/load-perf #epic #P2

Performance optimizations for loadVault pipeline. See analysis for details.

Key bottlenecks:

1. Double filesystem traversal (count, then scan)
2. Multiple regex passes per content string
3. Per-event database inserts
4. Query per rule + ancestor walks in materialization

