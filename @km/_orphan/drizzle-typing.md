---
id: "@km/_orphan/drizzle-typing"
aliases:
  - km-drizzle-typing
created_at: 2026-01-25T12:20:04Z
closed_at: 2026-01-25T12:31:15Z
assignee: unimac
---

# [x] Evaluate Drizzle ORM for type-safe database queries @km/_orphan #task #P3 @unimac

Currently using raw SQLite with `as Record<string, unknown>` casts throughout @km/storage.

**Problem**: ~30+ unsafe casts on .all() and .get() results. Schema changes could silently introduce invalid data.

**Options**:
1. Drizzle ORM - type-safe query builder, generates types from schema
2. kysely - lightweight SQL builder with good TS support
3. Custom typed wrapper around bun:sqlite

**Files affected**: store.ts, db-queries/*.ts, db-events.ts

**Acceptance criteria**:
- [ ] Evaluate options (Drizzle vs kysely vs custom)
- [ ] Prototype with one query file
- [ ] Measure impact on bundle size/perf