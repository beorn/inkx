---
id: "@km/inbox/1hpy"
aliases:
  - km-1hpy
  - "@km/_orphan/1hpy"
created_at: 2026-01-20T00:38:06Z
closed_at: 2026-01-20T00:53:30Z
---

# [x] CLI tests: km view state initialization tests failing @km/_orphan #bug #P2

Three tests in cli.slow.test.ts are failing: 'km view should work after km add modifies database', 'km view should find board after km sync and km add in sequence', and 'km view should work with filesystem path to board'. These appear to be pre-existing issues unrelated to recent testing library changes.