# View — Layout (board + outliner)

Spatial layout: how columns, sticky children, and the outliner are laid out on screen. Covers horizontal virtualization (viewport, sticky columns) and the outliner spec (indent, bullets, nesting).

For visibility rules (which nodes appear), see [visibility.md](visibility.md). For how those nodes render, see [rendering.md](rendering.md).

---

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
import { HorizontalVirtualList } from 'Silvery';

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

This requires extending silvery's overflow indicator system to support horizontal direction.

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

### 4. Horizontal Overflow in silvery

Current silvery `overflow="scroll"` is vertical-only. Need to:
1. Add horizontal scroll support to silvery Box
2. Or implement HorizontalVirtualList using pure React windowing (no silvery scroll)

Option 2 is simpler and doesn't require silvery changes.

## Files to Modify

| File | Change |
|------|--------|
| `vendor/silvery/src/components/HorizontalVirtualList.tsx` | New component |
| `vendor/silvery/src/index.ts` | Export HorizontalVirtualList |
| `vendor/silvery/CLAUDE.md` | Document HorizontalVirtualList |
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
   - Would require silvery changes
   - Defer to VirtualGrid if needed

3. **Indicator style - border vs overlay?**
   - Current VerticalScrollIndicator uses full-height bar
   - HorizontalVirtualList could use top/bottom indicators

## Next Steps

1. [ ] Create bead for this feature
2. [ ] Implement HorizontalVirtualList in silvery
3. [ ] Add tests
4. [ ] Migrate Board.tsx
5. [ ] Update documentation


---

# Outliner Behavior Specification

Shared spec for outliner editing operations across km (TUI) and Decker (web). Defines behavior for every operation in every cursor context. Tests are derived from this spec.

**Prior art**: WorkFlowy, Dynalist, Logseq, Roam, Notion, Tana. No formal spec exists — this creates one.

**Prerequisites**: Read [data-model.md](data-model.md) for the node tree (items vs blocks, positional roles).

**Architecture**: Operations are **semantic intents** (splitBlock, joinBackward, indent), not keybindings. Each product maps keys to intents. The spec defines intent behavior.

## Semantic Intents

| Intent | km key | Decker key | Description |
|---|---|---|---|
| `splitBlock` | Enter | Return | Split/create at cursor position |
| `indent` | Tab | Tab | Reparent under previous sibling |
| `outdent` | Shift+Tab | Shift+Tab | Reparent as sibling of parent |
| `joinBackward` | Backspace (at start) | Backspace (at start) | Merge/degrade backward |
| `joinForward` | Delete (at end) | Delete (at end) | Merge forward |
| `deleteBlock` | d (normal mode) | — | Delete entire block |
| `navigateDown` | j | j | Next visible block (spatial) |
| `navigateUp` | k | k | Previous visible block (spatial) |

## Context Variables

Derived from node position + state. Compound guards simplify cases.

| Variable | Description |
|---|---|
| `isItem` | `node.item != null` — structural node, can have children |
| `isTask` | Has `item.task` (`node.item?.task != null`) |
| `isFirstChild` | No previous sibling |
| `isLastChild` | No next sibling |
| `hasVisibleChildren` | Has children AND they're expanded (not collapsed) |
| `isEmpty` | No text content |
| `cursorAtStart` | Cursor at position 0 in title |
| `cursorAtEnd` | Cursor at end of title |
| `isRoot` | Top-level node (column child) |
| `canIndent` | `isItem && !isFirstChild` — combines the two guards into one check |
| `canOutdent` | `isItem && !isRoot` — has grandparent to outdent to |

**Compound guards** (`canIndent`, `canOutdent`, `hasVisibleChildren`) eliminate repeated multi-condition checks in operations.

## splitBlock (Enter)

| Context | Behavior | Note |
|---|---|---|
| `cursorAtStart` | Create empty sibling BEFORE, enter edit | Content stays on current |
| `cursorAtMiddle` | Split at cursor: before stays, after becomes new sibling | Children move to new node |
| `cursorAtEnd` + `hasVisibleChildren` | Create new first CHILD, enter edit | WorkFlowy/Dynalist convention |
| `cursorAtEnd` + `!hasVisibleChildren` | Create sibling AFTER, enter edit | Collapsed children or no children |
| `isEmpty` | Create sibling AFTER, enter edit | Don't split empty |

### Split Inheritance

New node inherits from source via `extractProps()` (denylist model — SYSTEM_KEYS excluded, everything else inherits). **Exception**: `item.task` resets to `{ marker: "[ ]", status: "todo" }` on new nodes.

## indent (Tab)

| Context | Behavior |
|---|---|
| `canIndent` | Reparent as last child of previous sibling |
| `!canIndent` | **No-op + bell** |

`canIndent = isItem && !isFirstChild`. One check, no separate guards.

**Multi-select**: All-or-nothing. If any node fails `canIndent`, none indent.

**Target**: Always the previous **sibling**, not the previous visible block. Indent is structural, not spatial.

**Schema gate**: Before executing, check if the result would be valid (e.g., would creating a child of the previous sibling violate any structural rule?). If not valid, no-op + bell.

## outdent (Shift+Tab)

| Context | Behavior |
|---|---|
| `canOutdent` | Reparent as sibling after parent (at grandparent level) |
| `!canOutdent` | **No-op + bell** |

`canOutdent = isItem && !isRoot`. One check.

## joinBackward (Backspace at start)

Degradation ladder — strip traits before merging. Try each in order, stop at first match:

| Step | Guard | Action |
|---|---|---|
| 1 | `isTask` | Remove task trait (clear `item.task`) |
| 2 | `isItem` | Remove item trait (set item: undefined → becomes block) |
| 3 | `type !== "p"` | Convert to paragraph (h/quote/code → p) |
| 4 | `isEmpty && !hasVisibleChildren` | Delete node, cursor to end of previous |
| 5 | `!isFirstChild` + prev is childless | Merge: prepend prev content, delete prev |
| 6 | `!isFirstChild` + prev has children | Reparent: move as last child of prev |
| 7 | `isFirstChild` | Outdent (move to parent's level) |

Steps 1-3 degrade one trait per backspace press. The user keeps pressing to strip all traits, then merges. This matches Logseq/Roam behavior.

**Schema gate**: Before steps 4-7, check if the resulting tree structure would be valid. If not, no-op.

**Merge survivor**: The node the cursor ends up on keeps its ID. This matters for CRDT, undo, and backlinks.

## joinForward (Delete at end)

| Context | Behavior | Note |
|---|---|---|
| Next is empty + no children | Delete next | Simple case |
| Next has content + no children | Append next's text, delete next | Standard merge |
| Next has children | **No-op** | Conservative — Decker + Notion precedent |

**Design decision**: km currently merges text + adopts children. GPT 5.4 Pro recommends aligning with Decker's conservative no-op for child-bearing next blocks. This avoids surprising reparenting and is safer for CRDT.

## deleteBlock (d in normal mode)

| Context | Behavior |
|---|---|
| Empty, no children, no backlinks | Delete immediately |
| Has children/backlinks/metadata | Confirm first, then recursive delete |

Cursor moves to: next sibling → previous sibling → parent.

## navigateDown/Up (j/k) — Spatial Navigation

**Model**: Walk visible blocks in document order. J = next visible block below, K = previous visible block above. Strict inverses: if J goes A→B, then K from B goes to A.

**Not tree traversal**. Not sibling-only. Pure visual/spatial — whatever is rendered above/below in the column.

| Context | Behavior |
|---|---|
| Normal | Move to next/prev visible block in column |
| At boundary (top/bottom of column) | Bell — don't cross columns |
| Collapsed card | Skip hidden children, move to next visible |

**Implementation**: Flatten column into rendered visible-block list, j/k moves by ±1 index.

**Structural navigation** (parent/child/sibling) lives on separate keys (h/l, </>, or TBD).

## Schema Gate (Pre-Operation Validation)

Before executing a structural operation (indent, outdent, merge, reparent), check if the resulting tree would be valid. If not, no-op + bell.

```typescript
// Pseudocode — the outliner checks before mutating:
function indent(nodeId) {
  if (!canIndent) return bell()
  const newParentId = previousSibling.id
  if (!tree.wouldBeValid({ move: nodeId, to: newParentId })) return bell()
  tree.moveNode(nodeId, newParentId, sortOrder)
}
```

This catches structural violations the compound guards miss — e.g., "this node CAN indent (has previous sibling), but the result would put a block under a block (invalid)."

The `wouldBeValid` check uses the same `validate()` system — dry-run the mutation, validate, rollback if invalid. Or simpler: check the specific structural rule that the operation could violate.

## Policy Points (Product-Specific)

These are NOT part of the shared spec — each product defines them:

| Policy | km | Decker |
|---|---|---|
| `canIndent(node)` | `isItem && !isFirstChild` | `!isFirstChild` (all blocks indentable) |
| `splitInheritancePolicy` | `extractProps()` denylist | Slate `splitNodes` default |
| `navigateModel` | Spatial (visible blocks) | Sibling-only (same depth) |
| `deleteForwardChildBearing` | No-op (align with Decker) | No-op |
| `maxUndoGrouping` | Batch related ops | Yjs undo manager |

## Test Matrix

Each cell = `{before-tree, cursor-position, operation} → {after-tree, cursor-position}`.

Tests should be executable JSON fixtures that both km and Decker can consume:

```json
{
  "name": "indent second child",
  "before": ["A", ["B", "C"]],
  "cursor": "C",
  "operation": "indent",
  "after": ["A", ["B", ["C"]]],
  "cursorAfter": "C"
}
```

## Open Questions

1. **Collapsed children + Enter**: Spec says create sibling after collapsed subtree. Decker may differ — verify.
2. **Cross-type merge**: When heading merges with paragraph, which type survives? (Current: paragraph)
3. **Rich text split**: How do inline spans (bold, link) behave at split point? (Decker concern)
4. **Concurrent operations**: CRDT normalization for concurrent indent/split. (Decker concern via Yjs)
