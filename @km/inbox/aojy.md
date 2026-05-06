---
mentions:
  - km
id: "@km/inbox/aojy"
aliases:
  - km-aojy
  - "@km/_orphan/aojy"
created_at: 2026-01-19T15:26:31Z
closed_at: 2026-01-19T15:28:43Z
---

# [x] Fix nodeMap rebuild per-keypress (O(n) on every input) @km/_orphan #bug #P2

**Problem:** buildTUIContext() calls createNodeMap(boardState.nodes) on every keypress. This is O(n) tree traversal per keystroke. The 'O(1) lookup' benefit is real but only after paying O(n) construction cost.

**Fix:** Use useMemo in Board.tsx so nodeMap only rebuilds when boardState.nodes reference changes:

```typescript
const nodeMap = useMemo(() => createNodeMap(boardState.nodes), [boardState.nodes]);
```

Then pass nodeMap into buildTUIContext() instead of building it there.

**Impact:** Reduces per-keypress work from O(n) to O(1) for typical navigation.

