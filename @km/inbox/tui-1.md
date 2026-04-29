---
id: "@km/_orphan/tui-1"
aliases:
  - km-tui-1
created_at: 2026-01-27T09:52:45Z
closed_at: 2026-01-27T17:28:11Z
assignee: claude:279f285c
---

# [x] Columns View tests fail when run in full suite (test isolation) @km/_orphan #bug #P1 @claude:279f285c

8 tests in apps/@km/tui/tests/view-modes/columns-view.test.ts fail when running bun run test:fast but pass individually. Error: Elements like #1a[data-cursor] don't exist. Passes alone, fails with packages/ + apps/@km/tui/tests/. Partial fix: added afterEach to toast.test.ts. Suspected: global state pollution.