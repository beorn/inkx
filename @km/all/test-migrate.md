---
id: "@km/all/test-migrate"
aliases:
  - km-all.test-migrate
  - km-all-test-migrate
created_by: Bjørn Stabell
created_at: 2026-04-09T06:45:51Z
closed_at: 2026-04-15T19:24:55Z
close_reason: "Grooming 2026-04-15: duplicate of km-all.test-system.p2-migrate.
  Work tracked there."
---

# [x] Migrate ALL existing slow tests to createTestApp() @km/all #task #P0 @Bjørn Stabell

Migrate all existing .slow.test.ts and .slow.spec.ts files that use createBoardDriver/testEnv directly to use createTestApp() instead. This gives them automatic termless coverage via TEST_BACKEND=termless. Keep testEnv for fast .test.ts unit tests.