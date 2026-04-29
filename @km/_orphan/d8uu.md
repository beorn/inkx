---
id: "@km/_orphan/d8uu"
aliases:
  - km-d8uu
created_at: 2026-01-19T14:05:36Z
closed_at: 2026-01-19T14:19:23Z
---

# [x] Split db.ts (1,302 lines) @km/_orphan #task #P1

packages/@km/storage/src/db.ts is 1,302 lines with mixed responsibilities. Split into focused modules:
- queries.ts: Read-only query functions
- links.ts: Link management (linkOps, broken link repair)
- ops.ts: Write operations (insert, update, delete)
- events.ts: Event emission and change tracking

Each module should be <300 lines with single responsibility.