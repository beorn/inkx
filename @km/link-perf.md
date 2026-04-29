---
id: "@km/link-perf"
aliases:
  - km-link-perf
  - "@km/_orphan/link-perf"
created_at: 2026-01-23T14:49:13Z
closed_at: 2026-01-23T15:03:16Z
---

# [x] Optimize link resolution performance @km/link-perf #epic #P2

Link resolution is slow on large vaults. Implement optimizations:
1. ✅ Build file lookup map for O(1) resolution (done)
2. Batch INSERTs in a transaction
3. Defer resolution to after board renders (best UX)

Goal: Board appears instantly, links resolve in background.