---
mentions:
  - km
id: "@km/storage/configurable-timing"
aliases:
  - km-storage.configurable-timing
  - km-storage-configurable-timing
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:29Z
closed_at: 2026-04-02T22:21:03Z
close_reason: "Shipped: All 7 timing constants now configurable via SyncConfig
  (retry, clearInFlightDelayMs). Commit efba271c."
owner: bjorn@stabell.org
---

# [x] Move hardcoded timing constants to config @km/storage #task #P3

7 timing constants are hardcoded: debounceFs (5s), debounceApply (3s), heartbeat interval (60s), idleThreshold (30s), maxRetries (3), baseDelay (100ms), clearInFlight delay (1s). Move to .km/config.yaml or SyncConfig so they can be tuned per-repo without code changes.

