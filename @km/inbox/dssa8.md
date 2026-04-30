---
id: "@km/inbox/dssa8"
aliases:
  - km-dssa8
  - "@km/_orphan/dssa8"
created_by: claude:ceb7c9cb
created_at: 2026-03-27T15:10:02Z
closed_at: 2026-03-27T17:28:57Z
close_reason: "Completed test fixture audit and all improvements: added shared
  fixtures (item.simpleBoard/multiColBoard/nestedBoard), navigateTo helper,
  merged 7 tiny files into domain parents (112→105 files, -7), updated tests
  CLAUDE.md with best practices. All tests pass."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] task: review test fixture ergonomics and shared abstractions @km/_orphan #task #P3 @claude:ceb7c9cb

Review how @km/tui tests build fixtures (item(), testEnv, board.app DSL). Consider: shared fixture builders for common structures (kanban, nested, sections), playwright-style page objects for navigation patterns, combining related tests to reduce setup overhead. Check CLAUDE.md instructions on test consolidation. Audit existing patterns across the ~112 test files.