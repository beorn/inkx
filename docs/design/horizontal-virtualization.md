# Horizontal Virtualization Design

## Status: Design Draft

Issue: To be created after design review

## Problem

Currently, horizontal column virtualization in Board.tsx is **manual windowing**:

```typescript
// Board.tsx:184-187
const effectiveVisibleColumns = state.columns.slice(
  effectiveScrollOffset,
  effectiveScrollOffset + effectiveMaxCols,
)
```

This works but:
1. Duplicates logic across views (Board.tsx, CardsView duplicates column slicing)
2. Inconsistent API with vertical VirtualList
3. No reusable component for horizontal virtualization

## Goals

1. **Consistent API**: `HorizontalVirtualList` with similar props to `VirtualList`
2. **Reusable**: Works for columns, tabs, horizontal card lists, galleries
3. **Composable**: Can combine with vertical `VirtualList` for 2D grids
4. **Terminal-optimized**: Edge-based scrolling for keyboard navigation

## Design

### Option A: Separate HorizontalVirtualList Component (Recommended)

Create a dedicated `HorizontalVirtualList` component alongside `VirtualList`:

```tsx
import { HorizontalVirtualList } from '@hightea/term';

<HorizontalVirtualList
  items={columns}
  width={termWidth}
  itemWidth={colWidth}          // Fixed or function
  scrollTo={selectedColIndex}
  overscan={1}                  // Columns to render outside viewport
  renderItem={(column, index) => (
    <Column key={column.id} column={column} isSelected={index === selected} />
  )}
/>
```

**Pros:**
- Clear, explicit API
- Optimized for horizontal use case
- Matches existing VirtualList pattern
- Simple mental model

**Cons:**
- Two separate components to maintain
- Users must choose correct component

### Option B: Unified VirtualList with `direction` Prop

Extend existing VirtualList with direction:

```tsx
<VirtualList
  direction="horizontal"   // default: "vertical"
  items={columns}
  width={termWidth}        // Uses width instead of height for horizontal
  itemSize={colWidth}      // Renamed from itemHeight
  scrollTo={selectedColIndex}
  renderItem={(column, index) => <Column ... />}
/>
```

**Pros:**
- Single component to learn
- Potentially less code duplication

**Cons:**
- More complex implementation
- Confusing prop semantics (height vs width changes meaning)
- Harder to optimize for each direction

### Option C: VirtualGrid for 2D Virtualization

For cases needing both horizontal AND vertical virtualization:

```tsx
<VirtualGrid
  rows={items}
  columns={3}
  width={termWidth}
  height={termHeight}
  rowHeight={4}
  colWidth={30}
  scrollToRow={selectedRow}
  scrollToCol={selectedCol}
  renderCell={(item, row, col) => <Cell item={item} />}
/>
```

**Pros:**
- Handles bidirectional virtualization
- Single component for complex grids

**Cons:**
- More complex API
- Overkill for simple horizontal lists
- Board view uses nested virtualization (columns → cards) not flat grid

## Recommendation: Option A + Future Option C

**Phase 1**: Implement `HorizontalVirtualList` (simple, addresses immediate need)
**Phase 2**: Consider `VirtualGrid` if flat 2D virtualization needed

### HorizontalVirtualList API

```typescript
interface HorizontalVirtualListProps<T> {
  /** Array of items to render */
  items: T[];

  /** Width of the list viewport in columns */
  width: number;

  /** Width of each item (fixed number or function) */
  itemWidth: number | ((item: T, index: number) => number);

  /** Index to keep visible (scrolls if off-screen) */
  scrollTo?: number;

  /** Extra items to render left/right of viewport (default: 1) */
  overscan?: number;

  /** Maximum items to render at once (default: 20) */
  maxRendered?: number;

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;

  /** Show overflow indicators (◀N/▶N) */
  overflowIndicator?: boolean;

  /** Optional key extractor */
  keyExtractor?: (item: T, index: number) => string | number;

  /** Height of the list (optional) */
  height?: number;

  /** Gap between items (default: 0) */
  gap?: number;
}
```

### Implementation Strategy

```tsx
function HorizontalVirtualList<T>({
  items,
  width,
  itemWidth,
  scrollTo,
  overscan = 1,
  maxRendered = 20,
  renderItem,
  keyExtractor,
  height,
  gap = 0,
}: HorizontalVirtualListProps<T>) {
  const scrollOffsetRef = useRef(0);

  // Calculate item width (support function for variable widths)
  const getItemWidth = (item: T, index: number) =>
    typeof itemWidth === 'function' ? itemWidth(item, index) : itemWidth;

  // Calculate visible range based on width
  const { startIndex, endIndex, leftPlaceholderWidth, rightPlaceholderWidth } = useMemo(() => {
    // Similar logic to VirtualList but for horizontal axis
    // ...
  }, [items, width, itemWidth, scrollTo, overscan, maxRendered]);

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <Box
      flexDirection="row"
      width={width}
      height={height}
      overflow="scroll"
      scrollTo={scrollTo !== undefined ? /* calculate */ : undefined}
    >
      {/* Left placeholder */}
      {leftPlaceholderWidth > 0 && <Box width={leftPlaceholderWidth} flexShrink={0} />}

      {/* Visible items with gaps */}
      {visibleItems.map((item, i) => {
        const actualIndex = startIndex + i;
        const key = keyExtractor ? keyExtractor(item, actualIndex) : actualIndex;
        return (
          <React.Fragment key={key}>
            {renderItem(item, actualIndex)}
            {gap > 0 && i < visibleItems.length - 1 && <Box width={gap} flexShrink={0} />}
          </React.Fragment>
        );
      })}

      {/* Right placeholder */}
      {rightPlaceholderWidth > 0 && <Box width={rightPlaceholderWidth} flexShrink={0} />}
    </Box>
  );
}
```

### Edge-Based Scrolling

Same algorithm as VirtualList but adapted for horizontal:

```typescript
function calcHorizontalEdgeScroll(
  selectedIndex: number,
  currentOffset: number,
  visibleCount: number,
  totalCount: number,
  padding: number = 1,  // Items from edge before scrolling
): number {
  if (totalCount <= visibleCount) return 0;

  const visibleStart = currentOffset;
  const visibleEnd = currentOffset + visibleCount - 1;
  const paddedStart = visibleStart + padding;
  const paddedEnd = visibleEnd - padding;

  let newOffset = currentOffset;

  if (selectedIndex < paddedStart) {
    newOffset = Math.max(0, selectedIndex - padding);
  } else if (selectedIndex > paddedEnd) {
    newOffset = Math.min(totalCount - visibleCount, selectedIndex - visibleCount + padding + 1);
  }

  return Math.max(0, Math.min(newOffset, totalCount - visibleCount));
}
```

### Usage in Board.tsx (After Implementation)

```tsx
// Before: Manual slicing
const effectiveVisibleColumns = state.columns.slice(
  effectiveScrollOffset,
  effectiveScrollOffset + effectiveMaxCols,
);

// Render manually with indicators
{hasLeftIndicator && <VerticalScrollIndicator direction="left" />}
{effectiveVisibleColumns.map((col, i) => (
  <Column key={col.node.id} ... />
))}
{hasRightIndicator && <VerticalScrollIndicator direction="right" />}

// After: HorizontalVirtualList
<HorizontalVirtualList
  items={state.columns}
  width={boardWidth}
  itemWidth={(col) => calcColumnWidth(col, boardWidth, maxCols)}
  scrollTo={layout.colIndex}
  overscan={1}
  overflowIndicator
  renderItem={(column, index) => (
    <Column
      key={column.node.id}
      column={column}
      colIndex={index}
      isSelected={index === layout.colIndex}
      width={colWidth}
      height={contentHeight}
    />
  )}
/>
```

### Scroll Indicator Integration

For horizontal, use ◀/▶ instead of ▲/▼:

```
◀3│ Column A │ Column B │ Column C │▶5
```

This requires extending hightea's overflow indicator system to support horizontal direction.

## Challenges

### 1. Variable Column Widths

Board columns can have different widths. Solutions:
- Pass `itemWidth` as function: `(col, i) => calcWidth(col)`
- Or simplify to fixed widths (current behavior)

### 2. Gap/Separator Handling

Columns have separators (│). Options:
- `gap` prop for consistent spacing
- Include separator in `renderItem`
- `renderSeparator` prop for custom separators

### 3. Nested Virtualization

Board already uses VirtualList inside columns. HorizontalVirtualList wrapping VirtualList creates:
- Outer: HorizontalVirtualList (columns)
  - Inner: VirtualList (cards within each column)

This is fine - they're independent. Inner VirtualList only renders when outer includes that column.

### 4. Horizontal Overflow in hightea

Current hightea `overflow="scroll"` is vertical-only. Need to:
1. Add horizontal scroll support to hightea Box
2. Or implement HorizontalVirtualList using pure React windowing (no hightea scroll)

Option 2 is simpler and doesn't require hightea changes.

## Files to Modify

| File | Change |
|------|--------|
| `vendor/hightea/src/components/HorizontalVirtualList.tsx` | New component |
| `vendor/hightea/src/index.ts` | Export HorizontalVirtualList |
| `vendor/hightea/CLAUDE.md` | Document HorizontalVirtualList |
| `apps/km-tui/src/views/Board.tsx` | Migrate to HorizontalVirtualList |
| `apps/km-tui/src/views/CardsView.tsx` | Migrate if applicable |

## Testing Plan

1. Unit tests for HorizontalVirtualList
   - Fixed item widths
   - Variable item widths (function)
   - Edge-based scrolling
   - Overscan behavior
   - Empty list
   - Single item

2. Integration tests
   - Board with many columns (20+)
   - Keyboard navigation (h/l)
   - Scroll indicators

3. Performance benchmark
   - Compare manual slicing vs HorizontalVirtualList
   - Measure with 50+ columns

## Open Questions

1. **Should gap be part of itemWidth or separate?**
   - Separate `gap` prop is cleaner
   - But complicates width calculations

2. **Support bidirectional scroll in single Box?**
   - Would require hightea changes
   - Defer to VirtualGrid if needed

3. **Indicator style - border vs overlay?**
   - Current VerticalScrollIndicator uses full-height bar
   - HorizontalVirtualList could use top/bottom indicators

## Next Steps

1. [ ] Create bead for this feature
2. [ ] Implement HorizontalVirtualList in hightea
3. [ ] Add tests
4. [ ] Migrate Board.tsx
5. [ ] Update documentation
