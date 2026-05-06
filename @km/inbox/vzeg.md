---
mentions:
  - km
id: "@km/inbox/vzeg"
aliases:
  - km-vzeg
  - "@km/_orphan/vzeg"
created_at: 2026-01-18T00:52:51Z
closed_at: 2026-01-22T00:34:29Z
---

# [x] Reconsider DI approach for TUI components @km/_orphan #task #P3

## Problem

Current DI approach via props (getChildren, getParentContext, getBoardPills) is leading to prop drilling through TreeNode → NodeChildren → recursive TreeNode calls.

## Current State

TreeNode now has these DI props that need to be threaded through:

- `children?: KNode[]`
- `parentContext?: string | null`
- `getChildren?: (id: string) => KNode[]`
- `getParentContext?: (node: KNode) => string | null`
- `getBoardPills?: GetBoardPillsFn`

## Alternative Approaches to Consider

1. **Context-based store** - Put a node store in React context
  ```tsx
  const { getNode, getChildren, getLinks } = useNodeStore();
  ```
2. **Hook-based access** - Components call hooks directly
  ```tsx
  const node = useNode(id);
  const children = useChildren(id);
  const pills = useBoardPills(node);
  ```
3. **Single store context** - One context provides all data access
  ```tsx
  <StoreProvider store={memoryStore}>
    <TreeNode nodeId={id} />
  </StoreProvider>
  ```

## Trade-offs

| Approach           | Props drilling | Testability         | Flexibility |
| ------------------ | -------------- | ------------------- | ----------- |
| Props DI (current) | High           | Good                | High        |
| Context store      | None           | Needs provider      | Medium      |
| Hooks              | None           | Needs mock provider | Medium      |

## Questions

1. How many more DI props will we need? (links, ancestors, etc.)
2. Is the storybook the only use case for non-DB rendering?
3. Should we just accept DB dependency in components and mock the DB for tests?

## Related

- TreeNode.tsx - current DI implementation
- storybook.tsx - main consumer of DI props
- ui-context.tsx - existing context pattern we could extend

