---
id: "@km/inbox/board-5"
aliases:
  - km-board-5
  - "@km/_orphan/board-5"
created_at: 2026-01-20T21:42:04Z
closed_at: 2026-02-04T11:27:24Z
---

# [x] Double-click drill-in @km/_orphan #task #P4

## Phase 5: Double-Click Drill-In (~1-2 hours)

Add timing state to mouse handler:
```typescript
let lastClickTime = 0;
let lastClickTarget: HitTarget | null = null;
const DOUBLE_CLICK_THRESHOLD = 300;

function handleMouseDown(event) {
  const target = hitRegistry.hitTest(event.x - 1, event.y - 1);
  const isDouble = target && isSameTarget(target, lastClickTarget) &&
                   Date.now() - lastClickTime < DOUBLE_CLICK_THRESHOLD;
  if (isDouble) dispatchBoard({ type: 'ENTER_NODE' });
  else handleSingleClick(target);
  lastClickTime = Date.now();
  lastClickTarget = target;
}
```

## Files
- `Board.tsx` or `mouse-handler.ts` - add timing state

## Verification
- Double-click on item drills into it
- Single click still just selects

## Depends on
- @km/_orphan/mouse-2 (click-to-select)