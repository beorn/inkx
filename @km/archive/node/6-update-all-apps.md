---
mentions:
  - km
id: "@km/node/6-update-all-apps"
aliases:
  - km-node.6
  - km-node-6
  - "@km/node/6"
created_at: 2026-01-16T22:22:40Z
closed_at: 2026-01-17T00:02:23Z
---

# [x] Update all apps @km/node #task #P3

## Phase 5: Apps

Update all applications to use new types and patterns.

### Changes

1. Update imports: `TNode` → `TreeNode`, `DBNode` → `KNode`
2. Remove `nodeToTNode()` conversion functions
3. Update property access: `node.nodeId` → `node.id`
4. Update computed checks: `node.isTask` → `node.taskStatus !== undefined`
5. Update color access: `node.color` → `(node.data.rules as NodeRules)?.color`

### Search and Replace

- `node.nodeId` → `node.id`
- `node.isTask` → `node.taskStatus !== undefined`
- `node.color` → `(node.data.rules as NodeRules)?.color`
- `node.icon` → remove (always undefined)

### Files

- apps/@km/_orphan/cli/src/**/*.ts
- apps/@km/tui/packages/**/*.tsx
- apps/@km/_orphan/sh/src/**/*.ts

### Verification

- `bun run typecheck` passes
- All app tests pass
- Manual TUI testing

