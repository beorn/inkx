---
mentions:
  - km
id: "@km/review-chaos/4-add-test-for-recovery-after-queue-overflow"
aliases:
  - km-review-chaos.4
  - km-review-chaos-4
  - "@km/review-chaos/4"
created_at: 2026-01-23T09:01:32Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] Add test for recovery after queue overflow @km/review-chaos #task #P2

Tests verify 'event drops don't cause duplicates' but not 'when watcher reconnects/recovers, replay doesn't create duplicates'. Add tests that simulate queue overflow followed by full recovery and resync.

