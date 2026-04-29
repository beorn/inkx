---
id: "@km/termless/generic-matchers"
aliases:
  - km-termless.generic-matchers
  - km-termless-generic-matchers
created_by: claude:8fc35754
created_at: 2026-03-03T00:34:59Z
closed_at: 2026-03-03T08:05:20Z
owner: bjorn@stabell.org
assignee: claude:8fc35754
---

# [x] Generic test runner matcher support @km/termless #feature #P3 @claude:8fc35754

viterm is currently vitest-only. Add a termless/matchers export that works with any expect() (Jest, Bun test, etc.) to widen adoption. The core matchers are pure functions — just need adapter wrappers for different test runners.