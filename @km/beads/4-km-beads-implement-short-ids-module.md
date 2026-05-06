---
mentions:
  - km
id: "@km/beads/4-km-beads-implement-short-ids-module"
aliases:
  - km-beads.4
  - km-beads-4
  - "@km/beads/4"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:19Z
---

# [x] km-beads: Implement short-ids module @km/beads #task #P2

Create packages/@km/beads/src/short-ids.ts with:

- generateShortId() - 4-char suffix from ULID, prefixed with km-
- resolveShortId(id) - Look up full node ID from short ID
- generateSubId(parentId) - Generate @km/epic/1, @km/epic/2 style IDs

Store short ID in data.short_id field on nodes.

Create tests in packages/@km/beads/tests/short-ids.test.ts

