---
mentions:
  - km
  - claude
id: "@km/inbox/v9frt"
aliases:
  - km-v9frt
  - "@km/_orphan/v9frt"
created_at: 2026-01-27T17:27:55Z
closed_at: 2026-01-27T17:36:49Z
assignee: claude:9892b704
---

# [x] Fix test failures: import.meta.dir and help text mismatches @km/_orphan #bug #P1 @claude:9892b704

12 test files failing:

1. Import errors: cli.slow.test.ts uses import.meta.dir (Bun-only) - should use fileURLToPath(import.meta.url) pattern
2. Help text mismatches: agent.test.md expects compact help text but actual has expanded format
3. Multiple sh-tests failing with ReferenceError on Vite imports

Need to:

- Fix import.meta.dir usage in cli.slow.test.ts
- Update help text expectations in agent.test.md
- Investigate Vite import errors in @km/_orphan/repl and sh-tests

