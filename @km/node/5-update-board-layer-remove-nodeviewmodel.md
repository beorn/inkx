---
id: "@km/node/5-update-board-layer-remove-nodeviewmodel"
aliases:
  - km-node.5
  - km-node-5
  - "@km/node/5"
created_at: 2026-01-16T22:22:32Z
closed_at: 2026-01-17T00:02:23Z
---

# [x] Update board layer (remove NodeViewModel) @km/node #task #P3

## Phase 4: Board layer

Remove NodeViewModel type - use TreeNode directly with Sets for UI state.

### Changes
1. Remove `NodeViewModel` interface
2. Update `BoardState.nodes` to use `TreeNode[]`
3. Remove `toNodeViewModel()` transformer
4. Update selectors to check `foldedNodes.has(node.id)` directly

### Before
```typescript
interface NodeViewModel {
  id: string;
  isFolded: boolean;
  // ... 13 fields total
}

function toNodeViewModel(node: TNode, foldedNodes: Set<string>): NodeViewModel
```

### After
```typescript
// Just use TreeNode directly (which extends KNode)
// Check fold state: foldedNodes.has(node.id)
```

### Files
- packages/@km/_orphan/board/src/boardTypes.ts
- packages/@km/_orphan/board/src/transformers.ts
- packages/@km/_orphan/board/src/boardReducer.ts
- packages/@km/_orphan/board/src/selectors.ts

### Verification
- Board reducer tests pass
- `bun run test:fast` passes