---
id: "@km/_orphan/reporter-stream"
aliases:
  - km-reporter-stream
created_at: 2026-01-28T10:27:56Z
closed_at: 2026-01-28T10:32:46Z
assignee: claude:18380d7e
---

# [x] Reporter shows no streaming progress in terminal - all output at end @km/_orphan #bug #P2 @claude:18380d7e

When running 'bun test:all' in a terminal:
1. No progress shown during test run - all output appears at end
2. Need to show which grouping mode is being used and why (auto → files-only, etc.)

Expected: See dots streaming as tests complete
Actual: Blank screen until all tests finish, then full output appears