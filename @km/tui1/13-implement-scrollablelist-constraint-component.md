---
mentions:
  - km
id: "@km/tui1/13-implement-scrollablelist-constraint-component"
aliases:
  - km-tui1.13
  - km-tui1-13
  - "@km/tui1/13"
created_at: 2026-01-17T00:06:55Z
closed_at: 2026-01-17T20:18:01Z
---

# [x] Implement ScrollableList constraint component @km/tui1 #task #P1

## Summary

Implement the ScrollableList constraint component for virtualized scrolling with overflow indicators.

## Design Reference

See [inkx-legacy.3-design.md](.beads/inkx-legacy.3-design.md) for full specification.

## Implementation

**Location**: `apps/km-tui/packages/km-ink/src/constraints/ScrollableList.tsx`

**Props**:

```typescript
interface ScrollableListProps<T> {
  items: T[];
  selectedIndex: number;
  itemHeight: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  renderOverflow?: (direction: 'top' | 'bottom', count: number) => React.ReactNode;
  gap?: number;
}
```

**Usage**:

```typescript
<ScrollableList
  items={cards}
  selectedIndex={selectedCardIndex}
  itemHeight={4}
  renderItem={(card, idx, isSelected) => (
    <Card card={card} isSelected={isSelected} />
  )}
  renderOverflow={(dir, count) => (
    <Text dimColor>{dir === 'top' ? '▲' : '▼'} {count} more</Text>
  )}
/>
```

## Algorithm

1. Calculate available height from context
2. Determine maxVisible items from height / itemHeight
3. Calculate scroll offset to keep selectedIndex visible
4. Render visible items + overflow indicators

Existing pattern in Board.tsx (lines 310-319):

```typescript
const maxCardsNoOverflow = Math.max(1, Math.floor(height / itemHeight));
const needsScroll = items.length > maxCardsNoOverflow;
const scrollOffset = needsScroll
  ? Math.max(0, Math.min(selectedIndex - halfVisible, items.length - maxVisible))
  : 0;
```

## Dependencies

- Requires: useComputedSize() hook for height
- Provides: Context with computed height to each rendered item

## Acceptance Criteria

- [ ] Gets height from context
- [ ] Calculates visible items correctly
- [ ] Keeps selected item visible
- [ ] Shows overflow indicators when needed
- [ ] Provides item height context to children
- [ ] Unit tests for scroll position calculation

## Blocked By

- inkx-legacy.1 (constraint system design approval)

