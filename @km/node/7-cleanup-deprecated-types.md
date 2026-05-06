---
mentions:
  - km
id: "@km/node/7-cleanup-deprecated-types"
aliases:
  - km-node.7
  - km-node-7
  - "@km/node/7"
created_at: 2026-01-16T22:22:47Z
closed_at: 2026-01-17T00:28:16Z
---

# [x] Cleanup deprecated types @km/node #task #P1

## Phase 4: Cleanup

Remove deprecated type aliases and converters.

### Changes

1. Remove `DBNode` type alias
2. Remove `TNode` type alias
3. Remove `NodeViewModel` type completely
4. Remove all converter functions
5. Update tests and documentation

### Files

- packages/@km/_orphan/core/src/types.ts
- packages/@km/tree/src/types.ts
- packages/@km/_orphan/board/src/transformers.ts

### Verification

- `bun run typecheck` passes
- `bun run test:all` passes
- No references to old types remain

