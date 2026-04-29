---
id: "@km/review-chaos/0-deletion-test-in-chaos-test-ts-is-broken-skipped"
aliases:
  - km-review-chaos.0
  - km-review-chaos-0
  - "@km/review-chaos/0"
created_at: 2026-01-23T09:01:28Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] Deletion test in chaos.test.ts is broken/skipped @km/review-chaos #bug #P1

chaos.test.ts:52-55 has a comment 'This will currently fail because we don't actually delete the file'. The mock watcher only sends events, doesn't modify filesystem. File deletion scenarios are not properly tested.