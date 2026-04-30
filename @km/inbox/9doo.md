---
id: "@km/inbox/9doo"
aliases:
  - km-9doo
  - "@km/_orphan/9doo"
created_at: 2026-01-16T11:50:30Z
closed_at: 2026-01-16T11:54:58Z
---

# [x] Layer violation: km-watch uses raw SQLite queries @km/_orphan #bug #P1

**Architecture violation**: @km/_orphan/watch uses raw SQLite queries via getDb().prepare() instead of @km/_orphan/store abstractions.

Files affected:
- packages/@km/_orphan/watch/src/reconcile.ts:45,51-59,265,312,321
- packages/@km/_orphan/watch/src/sync.ts:209

Pattern: `const db = getDb(); db.prepare('SELECT...').all()`

Expected: Use @km/_orphan/store query functions like getNodeByPath(), getChildren(), etc.

Fix: Identify all raw SQL queries in @km/_orphan/watch, replace with @km/_orphan/store API calls.