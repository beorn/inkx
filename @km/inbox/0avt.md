---
mentions:
  - km
id: "@km/inbox/0avt"
aliases:
  - km-0avt
  - "@km/_orphan/0avt"
created_at: 2026-01-20T07:43:33Z
closed_at: 2026-01-20T08:32:21Z
---

# [x] Fix layer violations: CLI commands bypass storage API @km/_orphan #bug #P1

## Problem

CLI commands directly access database via getDb() instead of using storage API.

## Files

- apps/@km/_orphan/cli/src/commands/list.ts:57,81 - raw SQL queries
- apps/@km/_orphan/cli/src/commands/tasks.ts:176,523-604 - multiple db.prepare() calls
- apps/@km/_orphan/cli/src/commands/move.ts:34-57 - direct db.query()

## Impact

- Breaks layering architecture (UI→Query→Model→Sync→Parser→FS)
- Couples CLI to database schema
- Makes schema changes harder

## Solution

Add appropriate query functions to @km/storage API and refactor CLI to use them.

