---
id: "@km/storage/replay-continues-after-failure"
aliases:
  - km-storage.replay-continues-after-failure
  - km-storage-replay-continues-after-failure
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:27Z
closed_at: 2026-03-31T21:39:40Z
close_reason: "Fixed: all unexpected event failures now logged at WARN level.
  Cascade skip count tracked. Summary warning reports total unexpected failures
  + creation failures + skipped cascades."
---

# [x] P0: event replay continues after failure, breaking ordering @km/storage #bug #P0

applyEvents() in repo-loader.ts catches per-event errors and continues applying later events. For an ordered event log, this is unsafe — later events depend on earlier ones. The failedNodeIds mitigation only covers same-node events, not descendants or cross-node dependencies. Fix: abort replay on unexpected failures, fail the load loudly.