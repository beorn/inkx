---
mentions:
  - km
id: "@km/tui1/17-refactor-board-column-to-use-scrollablelist"
aliases:
  - km-tui1.17
  - km-tui1-17
  - "@km/tui1/17"
created_at: 2026-01-17T00:07:54Z
closed_at: 2026-01-17T20:27:11Z
---

# [x] Refactor Board Column to use ScrollableList @km/tui1 #task #P2

## Summary

Refactor the Column component in Board.tsx to use the new ScrollableList component.

## Context

Column has complex scroll logic that should be abstracted.

## Current Code (Board.tsx lines 287-328)

```typescript
const estimatedCardHeight = maxContentLines + 3;
const maxCardsNoOverflow = Math.max(1, Math.floor(baseContentHeight / estimatedCardHeight));
const needsScroll = column.cards.length > maxCardsNoOverflow;
const reservedForIndicators = needsScroll ? 2 : 0;
const maxCards = Math.max(1, Math.floor((baseContentHeight - reservedForIndicators) / estimatedCardHeight));
const scrollOffset = needsScroll 
  ? Math.max(0, Math.min(selectedCardIndex - Math.floor(maxCards / 2), Math.max(0, column.cards.length - maxCards)))
  : 0;
const visibleCards = column.cards.slice(scrollOffset, scrollOffset + maxCards);
const hasTopOverflow = scrollOffset > 0;
const hasBottomOverflow = scrollOffset + maxCards < column.cards.length;
```

## Proposed Refactor

```typescript
<ScrollableList
  items={column.cards}
  selectedIndex={selectedCardIndex}
  itemHeight={maxContentLines + 3}
  containerHeight={baseContentHeight}
  renderItem={(card, index, isSelected) => (
    <Card
      card={card}
      isSelected={isSelected && selectionLevel === "card"}
      width={width}
      maxContentLines={maxContentLines}
    />
  )}
  renderOverflowTop={(count) => (
    <Box width={width}><Text backgroundColor="gray" color="white">▲</Text></Box>
  )}
  renderOverflowBottom={(count) => (
    <Box width={width}><Text backgroundColor="gray" color="white">▼</Text></Box>
  )}
/>
```

## Depends On

- @km/tui1/13-implement-scrollablelist-constraint-component (ScrollableList)

## Acceptance Criteria

- [ ] Column uses ScrollableList
- [ ] Scroll behavior identical to current
- [ ] Overflow indicators work correctly
- [ ] Lines of code reduced
- [ ] All Board tests pass

## References

- [@km/tui-eval/1-analysis/md](.beads/@km/tui-eval/1-analysis/md) - Pain Point 4

