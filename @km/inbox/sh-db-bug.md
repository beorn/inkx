---
mentions:
  - km
  - Claude
id: "@km/inbox/sh-db-bug"
aliases:
  - km-sh-db-bug
  - "@km/_orphan/sh-db-bug"
created_at: 2026-01-25T13:15:36Z
closed_at: 2026-01-25T20:57:25Z
assignee: Claude Sonnet 4.5
---

# [x] km sh fails with db initialization errors @km/_orphan #bug #P1 @Claude Sonnet 4.5

km sh command has similar db parameter bugs as km init/sync:

1. When called with a file path (km sh board.md), resolveNode gets undefined for query parameter
2. When called without arguments, getChildren receives null for db parameter

Both are likely due to missing db parameter passing after vault creation.

Blocking: mdtest-plugins.1 (cmd-mode.test.md requires km sh to work)

Fix: Similar to @km/_orphan/init-db-bug fix - pass getDb() to functions that need it after vault creation.

