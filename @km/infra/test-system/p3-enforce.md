---
mentions:
  - km
  - Bjørn
---

# [x] Phase 3: Delete testEnv/testEnvWithRepo + lint enforcement @km/all #task #P1 @Bjørn Stabell

Delete the testEnv and testEnvWithRepo functions from board-test.ts.
Remove driver/store from TestApp interface (type-level lock).
Wire check-test-patterns.sh into test:ci.

Delete: testEnv, testEnvWithRepo functions
/complete:

- grep -n 'export.*function testEnv' apps/@km/tui/tests/helpers/board-test.ts | wc -l → 0
- grep -n 'driver.*BoardDriver' apps/@km/tui/tests/helpers/test-app.ts | wc -l → 0 (type-level lock)

