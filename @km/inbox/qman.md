---
id: "@km/_orphan/qman"
aliases:
  - km-qman
created_at: 2026-01-17T20:35:43Z
closed_at: 2026-01-17T20:38:50Z
---

# [x] Remove deprecated TreeNode alias @km/_orphan #task #P3

Remove the deprecated TreeNode type alias from @km/core, @km/tree, and @km/board.

## Background
As part of @km/node type unification, TreeNode was renamed to TNode. A deprecated alias was added for backward compatibility:
```typescript
/** @deprecated Use TNode instead */
export type TreeNode = TNode;
```

## Files to update
- packages/@km/_orphan/core/src/types.ts - Remove TreeNode alias
- packages/@km/_orphan/core/src/index.ts - Remove TreeNode export
- packages/@km/tree/src/types.ts - Remove TreeNode re-export  
- packages/@km/tree/src/index.ts - Remove TreeNode export
- packages/@km/_orphan/board/src/boardTypes.ts - Remove TreeNode re-export
- packages/@km/_orphan/board/src/index.ts - Remove TreeNode export
- apps/@km/_orphan/repl/src/index.ts - Remove TreeNode export

## Verification
- `bun run type-check` passes
- `bun run test:fast` passes
- No remaining usages of TreeNode in active codebase