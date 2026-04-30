---
id: "@km/inbox/visd"
aliases:
  - km-visd
  - "@km/_orphan/visd"
created_at: 2026-01-15T22:31:19Z
closed_at: 2026-01-15T23:10:52Z
---

# [x] Refactor: Rename km-store to @km/storage @km/_orphan #task #P2

Rename the @km/_orphan/store package to @km/storage as part of the four-layer architecture refactoring.

The package owns:
- Persistence (SQLite operations)
- File sync (markdown ↔ DB sync)
- Database models

This rename clarifies the package's role as the storage layer in the four-layer architecture.