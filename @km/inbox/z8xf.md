---
id: "@km/_orphan/z8xf"
aliases:
  - km-z8xf
created_at: 2026-01-17T22:58:12Z
closed_at: 2026-01-17T23:23:17Z
---

# [x] Refactor Board actions into command system @km/_orphan #epic #P2

## Goal
Remove direct DB dependencies from TreeNode and other view components to enable:
- Storybook rendering without database setup
- Easier unit testing
- Pure component rendering

## Design: Props-based data flow with lazy fetch callback

### TreeNode Interface
```typescript
interface TreeNodeProps {
  node: KNode;
  children?: KNode[];                    // Pre-loaded children (optional)
  parentContext?: string | null;         // Pre-computed for embedded tasks
  getChildren?: (id: string) => KNode[]; // Lazy fetch callback for unfold
  getParentContext?: (node: KNode) => string | null; // For nested embedded
  // ... existing props
}
```

### Data Flow
1. **Initial render**: Parent passes `children` from CardState (already fetched)
2. **On unfold**: If deeper children needed, call `getChildren(id)`
3. **Parent context**: Passed as prop or computed via callback for nested cases

### Usage

**Production (Board.tsx)**:
```typescript
<TreeNode 
  node={card.node}
  children={card.children}
  parentContext={getParentContext(card.node)}
  getChildren={getChildren}  // from @km/storage
/>
```

**Storybook (no DB)**:
```typescript
const mockStore = new Map<string, KNode[]>();
// ... populate with test data

<TreeNode
  node={mockNode}
  children={mockChildren}
  parentContext="Test Project"
  getChildren={(id) => mockStore.get(id) ?? []}
/>
```

### Changes Required
1. **TreeNode.tsx**: Accept optional `children`, `parentContext`, `getChildren` props
2. **types.ts**: Add `parentContext?: string` to CardState
3. **Board.tsx / ColumnsView.tsx**: Pass props instead of relying on internal fetch
4. **storybook.tsx**: Remove DB setup, use pure mock data

### Benefits
- TreeNode becomes a pure rendering component
- Storybook works without SQLite
- Unit tests can pass mock data directly
- Lazy loading preserved via callback