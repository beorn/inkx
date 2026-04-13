# Ink Development Patterns

_Patterns documented for Ink v4.x (pre-Silvery migration). Last verified: 2026-01._

This guide documents patterns, workarounds, and best practices for working with Ink in km's TUI layer. These solutions address known Ink limitations and ensure consistent behavior.

**Related docs:**

- [ADR 001: TUI Architecture](../adr/archive/001-tui-architecture.md) - Decision to stay with Ink
- [TUI README](../../apps/km-tui/src/README.md) - Component hierarchy and data flow

## Known Issues and Workarounds

### 1. fullscreen-ink Alternate Buffer Race Condition

**Location:** [Board.tsx:384-444](../../apps/km-tui/src/views/Board.tsx#L384-L444)

**Problem:** On TUI startup, content may flash or scroll because fullscreen-ink's alternate buffer switch races with Ink's first render.

**Root cause:**

1. `fullscreen-ink` switches to terminal's alternate screen buffer via escape sequences
2. Ink's `useStdout()` returns `undefined` columns/rows on first render
3. First render frame may be discarded during buffer switch

**Solution:** Delay rendering until terminal is ready:

```typescript
const [isReady, setIsReady] = useState(false);

useEffect(() => {
  if (!stdout) return;

  // Poll for valid dimensions
  if (stdout.columns === undefined || stdout.rows === undefined) {
    const interval = setInterval(() => {
      if (stdout.columns !== undefined && stdout.rows !== undefined) {
        clearInterval(interval);
        // 50ms delay for alternate buffer stability
        setTimeout(() => setIsReady(true), 50);
      }
    }, 10);
    return () => clearInterval(interval);
  }

  // Dimensions available - still delay for stability
  setTimeout(() => setIsReady(true), 50);
}, [stdout]);

// Render empty Box until ready
if (!isReady) return <Box />;
```

**Key:** The 50ms delay is critical - shorter values may reintroduce the bug.

### 2. Manual Width Management

**Problem:** Ink doesn't provide automatic width measurement or constraints. Components must track available width through props and manually truncate/wrap content.

**Solution:** Constraint Components pattern (see below).

### 3. Height Constraints Clip from TOP (Critical!)

**Problem:** When a Box has a `height` constraint and content overflows, Ink/Yoga clips from the TOP, not the bottom. This is counterintuitive and can cause critical content to disappear.

**Location:** Discovered while debugging [storybook.tsx](../../apps/km-tui/tests/storybook.tsx) - see bead km-2yys.

**Example of the bug:**

```tsx
// DON'T do this - first line of bordered content will be clipped!
<Box flexDirection="row" height={6}>
  <Box flexDirection="column" width={20}>
    <Text>Header</Text>
    <Box borderStyle="round">
      <Box flexDirection="column">
        <Text>Line 1 (WILL BE CLIPPED!)</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Box>
    </Box>
  </Box>
</Box>
```

When the bordered box has 5 lines (top border + 3 content + bottom border) plus header = 6 lines, but something causes overflow, Ink clips the FIRST content line ("Line 1"), not the last.

**Solution options:**

1. **Remove height constraint** - Let the container grow naturally:

   ```tsx
   // GOOD: No height constraint, content flows naturally
   <Box flexDirection="row">
     <Box flexDirection="column" width={20}>
       {/* Content will not be clipped from top */}
     </Box>
   </Box>
   ```

2. **Use `overflowY="hidden"`** on inner containers to explicitly control clipping:

   ```tsx
   <Box flexDirection="row" height={10}>
     <Box flexDirection="column" overflowY="hidden">
       {/* Clips from BOTTOM as expected */}
     </Box>
   </Box>
   ```

3. **Calculate exact heights** to avoid overflow entirely.

4. **Use virtualization** (ScrollableList) to only render items that fit.

**Rule:** Never assume Ink will clip from the bottom. Always test height-constrained layouts with content that exceeds the available space.

### 4. ANSI-aware Text Length

**Problem:** `String.length` counts ANSI escape codes, breaking layout calculations for styled text.

**Location:** [text/rich.ts](../../apps/km-tui/src/text/rich.ts)

**Solution:** Use `displayLength()` for all width calculations:

```typescript
import { displayLength } from "../text/rich.ts"

// Wrong - counts ANSI codes
const width = styledText.length

// Correct - visual character count
const width = displayLength(styledText)
```

## Constraint Components

We've built constraint components to reduce boilerplate for common layout patterns.

**Location:** `apps/km-tui/src/` (constraint components)

### ConstraintContext

Provides width to descendant components without prop drilling:

```tsx
import { ConstraintContext, useConstraint } from "../constraints"

// Parent provides width
;<ConstraintContext.Provider value={{ width: 80 }}>
  <MyComponent />
</ConstraintContext.Provider>

// Child consumes width
function MyComponent() {
  const { width } = useConstraint()
  return <Text>{truncate(text, width)}</Text>
}
```

### TruncatedText

Automatically truncates text to available width:

```tsx
import { TruncatedText } from "../constraints";

<TruncatedText width={40}>{longText}</TruncatedText>
<TruncatedText width={40} ellipsis="...">{longText}</TruncatedText>
```

### ScrollableList

Handles overflow with scrolling and virtualization:

```tsx
import { ScrollableList } from "../constraints"

// Simple fixed-height items (1 line per item)
;<ScrollableList
  items={nodes}
  selectedIndex={cursorIndex}
  height={availableHeight}
  renderItem={(node, index, isSelected) => (
    <TreeNode node={node} isSelected={isSelected} />
  )}
/>

// Variable-height items (REQUIRED for multi-line content)
;<ScrollableList
  items={cards}
  selectedIndex={cursorIndex}
  height={availableHeight}
  getItemHeight={(card, index) =>
    estimateTreeNodeHeight(card.node, 0, config, getChildren, foldDepths)
  }
  renderItem={(card, index, isSelected) => <TreeNode node={card.node} />}
  renderOverflow={(direction, count) => (
    <OverflowIndicator direction={direction} count={count} />
  )}
/>
```

**Features:**

- Auto-scrolls to keep selected item visible
- Supports custom overflow indicators
- **Variable-height items** via `getItemHeight` callback (critical for multi-line content!)

### FlexRow

Divides width between columns with optional fixed-width columns:

```tsx
import { FlexRow } from "../constraints"
;<FlexRow
  width={80}
  columns={[
    { flex: 1, render: (w) => <Text>{truncate(title, w)}</Text> },
    { width: 10, render: () => <Text>{status}</Text> },
    { width: 12, render: () => <Text>{date}</Text> },
  ]}
/>
```

## Text Rendering Pipeline

**Key principle:** Render styling before truncation.

```
Raw markdown → parseInlineText(raw) → InlineNode[] → <InlineText text={raw} />
```

### Layer 1: Parse and Render Inline Text

Convert markdown to an AST and render as React components:

```tsx
import { InlineText } from "../text/index.ts"

// In JSX:
<InlineText text="**bold** and _italic_" />
```

### Layer 2: Constrain Text

Apply width constraints (truncate/wrap) to styled text:

```typescript
import { constrainText } from "../layout/constrain.ts"

const lines = constrainText(styled, {
  width: 40,
  maxLines: 2,
  mode: "wrap", // or "truncate"
})
```

### Layer 3: Render Lines

Render each line in `<Text>`:

```tsx
{
  lines.map((line, i) => <Text key={i}>{line}</Text>)
}
```

**Why this order matters:**

- ANSI codes are invisible - truncating styled text preserves styling
- Truncating raw text then styling may cut off closing codes
- `displayLength()` handles ANSI correctly for width calculations

## Testing TUI Components

### ink-testing-library

Use for unit testing Ink components:

```typescript
import { render } from "ink-testing-library";

it("renders correctly", () => {
  const { lastFrame } = render(<MyComponent />);
  expect(lastFrame()).toContain("Expected text");
});
```

### Storybook

Visual testing with [storybook.tsx](../../apps/km-tui/tests/storybook.tsx):

```bash
bun storybook                      # inline (default) — terminal scrolling works
bun storybook --fullscreen         # alternate screen
bun storybook --fullscreen-nonalt  # fullscreen positioning, no alt screen
```

Interactive component catalog with j/k section navigation, q to quit.

**Important:** The storybook must use production rendering code exclusively. It should never use `chalk` or raw Ink primitives (`<Text color=...>`) to implement styling directly. Instead:

- Use production components: `TreeNode`, `ListView`, `ColumnsView`, `TabsView`
- Use production components/functions: `InlineText`, `getStatusIcon()`, `colorize()`
- Use production layout helpers: `wrapText()`, `truncateText()`, `constrainText()`

**Why?** If storybook implements its own styling, it shows output that doesn't match the actual app. Bugs in production rendering go undetected (e.g., the storybook might claim done tasks have strikethrough while the actual TreeNode doesn't apply it).

If a component is hard to use in storybook, that's a signal to refactor the component to be more reusable—extract it, reduce its dependencies, or make it accept data as props instead of fetching internally.

### Visual Regression Testing

For CI, use headless capture (see [CLAUDE.md](../../CLAUDE.md) visual testing section):

```bash
# Start TUI in headless terminal
ttyd -W -p 7681 bun km view @test.md &

# Capture with Playwright
HEADLESS=true bun x playwright screenshot http://localhost:7681 /tmp/tui.png
```

## Common Patterns

### Responsive Width

Pass width down the component tree:

```tsx
function Board({ width }: { width: number }) {
  const columnWidth = Math.floor(width / columns.length)
  return columns.map((col) => <Column width={columnWidth} {...col} />)
}
```

### Selection Styling

Use `cyan` background for selected items (design system rule):

```tsx
<Box backgroundColor={isSelected ? "cyan" : undefined}>
  <Text color={isSelected ? "black" : undefined}>{text}</Text>
</Box>
```

### Keyboard Input

Use Ink's `useInput()` hook:

```tsx
useInput((input, key) => {
  if (key.downArrow || input === "j") {
    moveCursor("down")
  }
})
```

## Critical Pattern: Variable-Height Lists

**Problem:** Assuming "1 item = 1 line" when calculating how many items fit in a container causes overflow bugs. Items with wrapped text, subtasks, or nested children take multiple lines.

**Example of the bug (km-al93):**

```typescript
// WRONG: Assumes each card is exactly 1 line
const maxVisibleCards = Math.max(1, contentHeight)
const needsScroll = column.cards.length > maxVisibleCards
const visibleCards = column.cards.slice(0, maxVisibleCards)
```

If you have 20 cards and 42 lines of height, this shows all 20 cards. But if those cards actually render to 50+ lines, they overflow past the container boundary.

**Solution:** Always use `ScrollableList` with `getItemHeight` for lists that may contain multi-line items:

```typescript
// CORRECT: Calculate actual height per item
const getItemHeight = useCallback(
  (card: CardState, _index: number): number => {
    const estimated = estimateTreeNodeHeight(
      card.node,
      0, // depth
      heightConfig,
      getChildren,
      foldDepths,
    );
    // Add buffer for multi-line items (text wrapping is imprecise)
    return estimated > 1 ? estimated + 1 : estimated;
  },
  [heightConfig, foldDepths],
);

<ScrollableList
  items={column.cards}
  selectedIndex={selectedCardIndex}
  getItemHeight={getItemHeight}
  height={contentHeight}
  renderItem={renderItem}
  renderOverflow={renderOverflow}
/>
```

**Key points:**

1. **Use `estimateTreeNodeHeight`** - accounts for content wrapping, children, and nesting
2. **Add a +1 buffer for multi-line items** - text wrapping estimation is imprecise
3. **Always provide `renderOverflow`** - shows "▼ N more below" indicators
4. **Wrap in `ConstraintContext.Provider`** - provides width/height to ScrollableList

**Where this pattern is used:**

- `ListView.tsx` - list view virtualization
- `ColumnsView.tsx` - column card virtualization
- `CardColumn.tsx` - cards view virtualization

## Debugging Tips

1. **Dimension issues:** Log `stdout.columns` and `stdout.rows` - they may be `undefined` on first render
2. **Layout overflow:** Check `displayLength()` vs `String.length` usage
3. **Missing content:** Verify `isReady` state for fullscreen-ink race condition
4. **Style bleeding:** Ensure ANSI reset codes are preserved after truncation
5. **Overflow past boundaries:** Check if you're using fixed-height assumption for variable-height content - use `getItemHeight` callback with `ScrollableList`
