---
id: "@km/silvery/dirty-node-set"
aliases:
  - km-silvery.dirty-node-set
  - km-silvery-dirty-node-set
created_by: Bjørn Stabell
created_at: 2026-04-09T17:37:12Z
closed_at: 2026-04-09T23:47:41Z
close_reason: Shipped. O(1) hasLayoutDirty check via Set-based tracking in
  @silvery/ag/dirty-tracking. Commit 00e3df10.
---

# [x] Dirty node SET — pipeline phases iterate dirty nodes, not tree @km/silvery #feature #P2 @Bjørn Stabell

Phase 0a of signals engine. Add _dirtyNodes: Set<AgNode> to pipeline. Phases iterate dirty nodes, not whole tree. For 500-node kanban with 2 dirty nodes: content phase visits 2 not 500. No API change. ~2 days. Prerequisite for Phase 2 (style signals). See design/v20-canvas/signals-engine-architecture.md.