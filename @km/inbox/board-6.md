---
id: "@km/_orphan/board-6"
aliases:
  - km-board-6
created_at: 2026-01-20T21:42:05Z
closed_at: 2026-02-04T11:27:25Z
---

# [x] Drag area select (rectangle multi-select) @km/_orphan #task #P4

## Phase 6: Drag Area Select (~3-4 hours)

- Use existing `SelectionManager` for pixel range tracking
- Convert pixel range to item set via registry intersection
- Render selection rectangle overlay during drag
- On drag end: dispatch `setMultiSelected(itemsInRange)`

```typescript
function getItemsInRange(range: SelectionRange): HitTarget[] {
  return Array.from(hitRegistry.regions.values())
    .filter(r => intersects(r, range))
    .map(r => r.target);
}

// On drag end
const items = getItemsInRange(selectionRange);
const selectionKeys = items
  .filter(t => t.type === 'node')
  .map(t => `${t.colIndex}:${t.cardIndex}:${t.subIndex}`);
dispatch(actions.setMultiSelected(new Set(selectionKeys)));
```

## Files
- `Board.tsx` - wire SelectionManager to hit registry
- May need overlay component for visual rectangle

## Verification
- Click-drag creates visible selection rectangle
- Items within rectangle are highlighted
- Release selects all items in range

## Depends on
- @km/_orphan/mouse-2 (hit registry wired to components)