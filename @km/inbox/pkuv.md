---
mentions:
  - km
id: "@km/inbox/pkuv"
aliases:
  - km-pkuv
  - "@km/_orphan/pkuv"
created_at: 2026-01-23T20:14:20Z
closed_at: 2026-01-23T22:01:42Z
---

# [x] Optimize test:fast to run significantly faster @km/_orphan #task #P2

Currently test:fast takes ~24 seconds. Investigate and implement optimizations to make it significantly faster.

Potential approaches:

1. Analyze which tests are slowest and optimize them
2. Check for unnecessary I/O or setup/teardown in tests
3. Consider parallelization improvements
4. Identify and eliminate redundant work

Acceptance criteria:

- test:fast completes in <15 seconds (ideally <10s)
- All tests still pass
- No reduction in test coverage

