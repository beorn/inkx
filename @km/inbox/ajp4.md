---
id: "@km/inbox/ajp4"
aliases:
  - km-ajp4
  - "@km/_orphan/ajp4"
created_at: 2026-01-15T22:31:46Z
closed_at: 2026-01-16T07:40:27Z
---

# [x] Update boardReducer to receive nodes as third argument @km/_orphan #task #P2

Update the boardReducer to receive tree nodes as a third argument.

**Signature:**
```typescript
function boardReducer(
  state: BoardState,
  action: BoardAction,
  nodes: NodeState[],  // read-only, from node layer
): BoardState
```

The board reducer needs access to nodes to:
1. Validate paths exist before navigation
2. Count siblings for boundary checks
3. Get children for NAV_CHILD
4. Calculate cross-column paths

This keeps node data as read-only input, maintaining clean separation between:
- nodeReducer: structural mutations
- boardReducer: visual navigation (reads nodes)