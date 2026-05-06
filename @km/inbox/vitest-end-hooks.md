---
mentions:
  - km
  - claude
id: "@km/inbox/vitest-end-hooks"
aliases:
  - km-vitest-end-hooks
  - "@km/_orphan/vitest-end-hooks"
created_at: 2026-01-28T16:51:13Z
closed_at: 2026-01-28T16:55:57Z
assignee: claude:18380d7e
---

# [x] vitest onTestRunEnd/onFinished hooks not called with many specs @km/_orphan #bug #P1 @claude:18380d7e

## Findings

### Symptoms

- `onTestRunEnd` and `onFinished` hooks never called with 108+ specs
- Works fine with <10 specs
- Tests complete (2300+ results), but process exits before cleanup
- Affects both custom reporters (vitest-dotz, vitest-reporter)

### Debug tracing (patched vitest)

- `pool.runTests` starts with 108 specs
- `pool.runTests` never completes - process exits during execution
- The finally block that calls `_testRun.end()` is never reached

### Search results

- No known issue found for this specific problem
- vitest 4.0.18 available (we're on 3.2.4)
- onTestRunEnd is vitest 3+ feature replacing deprecated onFinished

### Next steps

- Update to vitest 4.x
- If still broken, file upstream issue

