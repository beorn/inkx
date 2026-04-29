---
id: "@km/_orphan/remove-emit-fallback"
aliases:
  - km-remove-emit-fallback
created_at: 2026-01-25T08:30:38Z
closed_at: 2026-01-25T10:07:06Z
---

# [x] Remove global db fallback in emit() @km/_orphan #task #P2

Remove global singleton fallback from packages/@km/storage/src/emit.ts.

Current code (lines 141-152):
const contextDb = tryGetContextDb()
if (contextDb) {
  applyEventWithDb(contextDb, full)
} else if (db) {
  // Fall back to global db for production
  db.applyEvent(full)
}

Change to:
const contextDb = tryGetContextDb()
if (contextDb) {
  applyEventWithDb(contextDb, full)
}
// No fallback - require context db

This means:
1. All production code must use runWithDb() to set context
2. All tests already use withTestEnv() which sets context
3. No more global db variable needed

Also remove:
- Global db variable and setter (setDatabase)
- Any other global singleton state

Depends on: @km/_orphan/cli-tasks-vault, @km/_orphan/cli-main-vault (production code must use runWithDb)