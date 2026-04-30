---
id: "@km/inbox/test-output-2"
aliases:
  - km-test-output-2
  - "@km/_orphan/test-output-2"
created_at: 2026-01-27T22:01:24Z
closed_at: 2026-01-27T22:12:10Z
assignee: claude:8f1636c1
---

# [x] Blank lines in bun test:all output @km/_orphan #bug #P2 @claude:8f1636c1

Fixed by adding NO_COLOR=1 to test scripts. The 'blank lines' were actually empty ANSI color code sequences (yellow-reset) between dots in vitest's dot reporter. With NO_COLOR=1, these disappear.

There are 4 structural blank lines from vitest's reporter (around header/summary) which is standard formatting.