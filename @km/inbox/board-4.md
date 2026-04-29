---
id: "@km/_orphan/board-4"
aliases:
  - km-board-4
created_at: 2026-01-20T21:42:03Z
closed_at: 2026-02-04T11:27:24Z
---

# [x] Click-to-select and fold toggle @km/_orphan #task #P4

## Phase 2: Click-to-Select (~2-3 hours)

- Add `useHitRegion({ type: 'node', colIndex, cardIndex, subIndex })` to TreeNode
- In mouse handler: on left-click, query registry, dispatch `setCursor`

## Phase 3: Click to Fold/Unfold (~1-2 hours)

- Register fold icon area with `{ type: 'fold-toggle', nodeId }` at higher z-index
- On click: dispatch `toggleFold(nodeId)`

## Files
- `TreeNode.tsx` - add useHitRegion calls
- `Board.tsx` - wire mouse click to registry lookup

## Verification
- Click on item selects it (cursor moves)
- Click on fold icon toggles fold state

## Depends on
- @km/_orphan/mouse-1 (hit registry infrastructure)