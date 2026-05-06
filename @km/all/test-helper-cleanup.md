---
mentions:
  - km
  - claude
id: "@km/all/test-helper-cleanup"
aliases:
  - km-all.test-helper-cleanup
  - km-all-test-helper-cleanup
created_by: claude:aee18a0e
created_at: 2026-02-27T14:00:16Z
closed_at: 2026-02-27T14:25:02Z
owner: bjorn@stabell.org
assignee: claude:aee18a0e
---

# [x] Test helper cleanup: dead code, skipped tests, DRY, split board-test.ts @km/all #task #P1 @claude:aee18a0e

Comprehensive test helper cleanup from test audit findings:

1. Delete dead code from board-test.ts (523 lines: BoardTestImpl, old fixtures)
2. Remove 2 skipped tests for unimplemented view mode switching
3. Re-enable 5 skipped tests where infrastructure blockers resolved
4. Extract shared testEnv/testEnvWithRepo setup (fix 180-line copy-paste)
5. Move embed unit tests from embed.test.ts to @km/tree package
6. Consolidate embed display describes (merge 3 overlapping blocks)
7. Split board-test.ts into fixtures.ts + test-env.ts + assertions/* modules
8. Namespace assertion methods for better discoverability

