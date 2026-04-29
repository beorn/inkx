---
id: "@km/_orphan/1f5ti"
aliases:
  - km-1f5ti
created_by: claude:8fc35754
created_at: 2026-03-03T07:53:19Z
closed_at: 2026-03-03T08:01:23Z
owner: bjorn@stabell.org
assignee: claude:8fc35754
---

# [x] Update remaining tests to composable region API @km/_orphan #task #P2 @claude:8fc35754

Some inkx tests may still use old termless patterns. Audit all test files importing viterm/matchers and verify they use the new composable API (term.screen/term.cell/term.row instead of expect(term).toContainText etc). At minimum check scrollback-related tests.