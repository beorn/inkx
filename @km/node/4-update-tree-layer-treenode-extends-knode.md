---
id: "@km/node/4-update-tree-layer-treenode-extends-knode"
aliases:
  - km-node.4
  - km-node-4
  - "@km/node/4"
created_at: 2026-01-16T22:22:25Z
closed_at: 2026-01-17T00:27:31Z
---

# [x] Update tree layer (TreeNode extends KNode) @km/node #task #P1

## Phase 3: Update Consumers

Update tree layer, board layer, and apps.

### Tree Layer
1. Create `TreeNode extends KNode` with `children[]` and `depth`
2. Update `buildTree()` to use spread operator
3. Add alias: `export type TNode = TreeNode;`

### Board Layer  
1. Remove `NodeViewModel` - use `TreeNode` + Sets directly
2. Remove `toNodeViewModel()` transformer
3. Update selectors to check `foldedNodes.has(node.id)` directly

### Apps
1. Remove `nodeToTNode()` conversion functions
2. Update property access: `node.nodeId` → `node.id`
3. Update computed checks: `node.isTask` → `node.status !== undefined`

### Files
- packages/@km/tree/src/types.ts
- packages/@km/tree/src/queries.ts
- packages/@km/_orphan/board/src/boardTypes.ts
- packages/@km/_orphan/board/src/transformers.ts
- apps/@km/_orphan/cli/src/**/*.ts
- apps/@km/tui/packages/**/*.tsx

### Verification
- `bun run typecheck` passes
- `bun run test:fast` passes
- TUI loads and renders correctly