---
mentions:
  - km
id: "@km/node/3-update-storage-layer-sqlite-mapping"
aliases:
  - km-node.3
  - km-node-3
  - "@km/node/3"
created_at: 2026-01-16T22:22:18Z
closed_at: 2026-01-17T00:22:49Z
---

# [x] Update storage layer (SQLite mapping) @km/node #task #P1

## Phase 2: Update Storage

Update storage functions to use KNode and add Source helpers.

### Changes

1. Update storage functions to use `KNode` type
2. Add `getSourcePath()` helper - derives path from tree structure
3. Add `getSourceLine()` helper - extracts line from source
4. Keep existing SQLite columns (no schema change yet)
5. Add `rowToKNode()` mapping from snake_case
6. Add `knodeToRow()` reverse mapping

### Files

- packages/@km/storage/src/db.ts
- packages/@km/storage/src/store.ts

### Verification

- Round-trip test: read → modify → write → read
- `bun run test:fast` passes

