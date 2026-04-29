---
id: "@km/_orphan/ocwrx"
aliases:
  - km-ocwrx
created_at: 2026-02-02T22:08:27Z
closed_at: 2026-02-02T22:14:35Z
---

# [x] Refactor: Unify VirtualList and HorizontalVirtualList @km/_orphan #task #P2 @claude:1588825b

Extract shared virtualization logic to eliminate 100+ lines of duplication.

## Current State
- VirtualList.tsx: 277 lines
- HorizontalVirtualList.tsx: 322 lines
- ~95% duplicate logic with only directional differences

## API Inconsistencies to Fix
- HorizontalVirtualList supports variable item sizes (function), VirtualList doesn't
- HorizontalVirtualList has gap/separator features VirtualList lacks
- Different default values (OVERSCAN=5 vs 1, MAX_RENDERED=100 vs 20)

## Proposed Solution
Extract useVirtualization hook:
```typescript
interface VirtualizationConfig<T> {
  axis: 'vertical' | 'horizontal';
  items: T[];
  itemSize: number | ((item: T, index: number) => number);
  viewportSize: number;
  scrollTo?: number;
  padding?: number;
  overscan?: number;
  maxRendered?: number;
}
```

## Files
- vendor/beorn-inkx/src/components/VirtualList.tsx
- vendor/beorn-inkx/src/components/HorizontalVirtualList.tsx
- vendor/beorn-inkx/src/hooks/useVirtualization.ts (NEW)