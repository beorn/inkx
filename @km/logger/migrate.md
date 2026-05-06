---
mentions:
  - km
  - claude
id: "@km/logger/migrate"
aliases:
  - km-logger.migrate
  - km-logger-migrate
created_at: 2026-02-02T15:24:42Z
closed_at: 2026-02-02T15:48:33Z
assignee: claude:76fda6b0
---

# [x] logger-migrate @km/logger #task #P3 @claude:76fda6b0

Migrate all km code from console.*/debug to @beorn/logger.

## Current State (Audit)

- **Already using @beorn/logger**: 81 files
- **Still using console.***: 166 files (but many are intentional)

## Console Usage Categories

### Keep as console.* (CLI User Output)

- apps/@km/_orphan/cli/src/commands/* - User-facing CLI output is intentional
- scripts/* - Script output acceptable

### Already Migrated

- apps/@km/tui/* - Most uses @beorn/logger via apps/@km/tui/src/log.ts
- packages/@km/storage/* - Partially migrated to @beorn/logger

### Needs Review

- packages/@km/_orphan/core/src/result.ts
- packages/@km/beads/src/sync.ts, migrate.ts
- Remaining test files with console.* for debugging

## Lint Rules (Future)

Add oxlint/ESLint rules to disallow:

- console.debug, console.info, console.warn (except in tests)
- import from 'debug' (migrate to @beorn/logger)

Allow:

- console.log in apps/@km/_orphan/cli/src/commands/* (CLI output)
- console.log in scripts/*
- console.error for CLI error messages
- process.stdout.write for raw output

## Note

Most km code already uses @beorn/logger. The remaining console.* calls are either intentional CLI output or in test infrastructure. Full lint enforcement deferred pending more careful audit.

