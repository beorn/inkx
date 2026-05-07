---
mentions:
  - km
id: "@km/inbox/vitx"
aliases:
  - km-vitx
  - "@km/_orphan/vitx"
created_at: 2026-01-20T14:30:58Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Complete TODO tests in bun-integration.test.ts @km/_orphan #task #P3

Medium: bun-integration.test.ts has 3 test.todo items and 1 test.skip.

**Incomplete tests:**

1. Line 36: test.todo('error output should be clean without stack traces')
- Verify failed tests show diff, not stack trace
4. Line 96: test.skip('registered tests should be properly nested under headings')
- Can't call describe.serial() from test context
7. Line 111: test.todo('verify describe block nesting matches heading hierarchy')
- Verify heading structure preserved in test registration

**Impact:**
These tests document important behavior that isn't verified automatically.

**File:**

- vendor/beorn-mdtest/tests/bun-integration.test.ts

