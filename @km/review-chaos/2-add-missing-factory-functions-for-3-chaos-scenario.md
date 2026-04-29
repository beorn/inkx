---
id: "@km/review-chaos/2-add-missing-factory-functions-for-3-chaos-scenario"
aliases:
  - km-review-chaos.2
  - km-review-chaos-2
  - "@km/review-chaos/2"
created_at: 2026-01-23T09:01:30Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] Add missing factory functions for 3 chaos scenarios @km/review-chaos #task #P2

scenarios.ts has 11 scenarios but only 7 factory functions. Missing: partialWrites(), renameStorm(), initGap(). Add factories in vendor/beorn-watcher-chaos/src/scenarios.ts.