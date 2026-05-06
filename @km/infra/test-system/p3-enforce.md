---
mentions:
  - km
  - Bjørn
id: "@km/infra/test-system/p3-enforce"
aliases:
  - @km/infra/test-system.p3-enforce
  - @km/infra/test-system-p3-enforce
created_by: Bjørn Stabell
created_at: 2026-04-10T08:22:58Z
closed_at: 2026-04-18T07:41:49Z
close_reason: "Phase 3 complete: testEnv exports already removed;
  check-test-patterns wired into test:ci; driver removed from TestApp interface
  (37 callsites migrated across 5 files in feat/test-system worktree, commit
  8f26c465a). Type-level lock achieved. All migrated tests pass (62 fast + 118
  slow)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 3: Delete testEnv/testEnvWithRepo + lint enforcement @km/all #task #P1 @Bjørn Stabell

Delete the testEnv and testEnvWithRepo functions from board-test.ts.
Remove driver/store from TestApp interface (type-level lock).
Wire check-test-patterns.sh into test:ci.

Delete: testEnv, testEnvWithRepo functions
/complete:

- grep -n 'export.*function testEnv' apps/@km/tui/tests/helpers/board-test.ts | wc -l → 0
- grep -n 'driver.*BoardDriver' apps/@km/tui/tests/helpers/test-app.ts | wc -l → 0 (type-level lock)

