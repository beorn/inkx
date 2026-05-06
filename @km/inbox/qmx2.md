---
mentions:
  - km
id: "@km/inbox/qmx2"
aliases:
  - km-qmx2
  - "@km/_orphan/qmx2"
created_at: 2026-01-19T15:22:53Z
closed_at: 2026-01-19T15:38:24Z
---

# [x] Layer violation: storage imports parser directly @km/_orphan #bug #P1

## Fixed

Removed `parseHeadingRules` import from db-queries.ts. The storage layer now reads rules from `data.rules` (stored by parser during sync) instead of recomputing at query time.

**Remaining**: store.ts still imports `parseMarkdownToNodes` for MemoryStore file sync. This is a tighter coupling that would require extracting a sync layer to fully fix. The MemoryStore use case (rebuild from filesystem) arguably belongs in a combined sync+storage module.

