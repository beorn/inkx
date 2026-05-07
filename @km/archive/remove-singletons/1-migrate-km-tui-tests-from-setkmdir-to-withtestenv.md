---
mentions:
  - km
id: "@km/remove-singletons/1-migrate-km-tui-tests-from-setkmdir-to-withtestenv"
aliases:
  - km-remove-singletons.1
  - km-remove-singletons-1
  - "@km/remove-singletons/1"
created_at: 2026-01-23T20:59:05Z
closed_at: 2026-01-23T21:10:59Z
---

# [x] Migrate km-tui tests from setKmDir to withTestEnv @km/remove-singletons #task #P1

Files: board.slow.test.ts, detail-pane.test.ts, board-move-elaborate.test.ts
Pattern: Use withTestEnv helper instead of manual setKmDir

