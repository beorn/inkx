---
id: "@km/_orphan/commands-1"
aliases:
  - km-commands-1
created_at: 2026-01-25T23:50:07Z
closed_at: 2026-01-27T20:38:07Z
assignee: claude:cacac722
---

# [x] Fix pre-existing TypeScript errors in CLI and tests @km/_orphan #chore #P3 @claude:cacac722

## Context
Pre-existing TypeScript errors discovered during ADR-002 refactor.

## Errors
1. CLI commands (add.ts, bd.ts, inbox.ts, move.ts, etc.) call functions like `queryTasks` with wrong arguments
2. query.test.ts has ~25+ function signature mismatches
3. cli-unit.test.ts has ~20+ `Expected 2 arguments, but got 1` errors
4. sync-safety.test.ts uses `getDb` which no longer exists

## Note
These errors existed before the @km/domain refactor started. They appear to be from a partial migration that was never completed.