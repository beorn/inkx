# TUI1 (Ink) Layout Pain Points Analysis

## Overview

This document analyzes the 5 known TUI1 pain points with 5 alternative approaches for each.

---

## Pain Point 1: Manual Width Management

**Observation**: Every component manually tracks available width, passes it down through props, and calculates available space for content.

**Example from TreeNode.tsx lines 187-190**:

```typescript
const wrapWidth = Math.max(1, width - prefixLength);
const { lines: wrappedLines } = constrainText(
  styledContent,
  wrapWidth,
  maxContentLines,
);
```

**Example from ColumnsView.tsx lines 229-235**:

```typescript
const separatorCount = effectiveVisibleColumns.length - 1;
const availWidthForCols = availableWidth - separatorCount;
const colBaseWidth = Math.floor(availWidthForCols / effectiveMaxCols);
const colRemainder = availWidthForCols % effectiveMaxCols;
const colWidth = colBaseWidth + (i < colRemainder ? 1 : 0);
```

### Alternative Approaches

#### Approach 1: React Context for Width

**Concept**: Create a `LayoutContext` that automatically provides width down the tree.

```typescript
const LayoutContext = createContext<{ width: number; height: number }>(null);

function Column({ children }) {
  const { width } = useContext(LayoutContext);
  return <Box>{children}</Box>;
}
```

**Assessment**:

- **Pros**: Reduces prop drilling, cleaner component signatures
- **Cons**: Context updates trigger full subtree re-renders; Ink's flexbox model doesn't expose calculated widths to children automatically
- **Verdict**: Partial improvement - still need to calculate widths at container level

#### Approach 2: Ink's Built-in Flexbox (Just Use It More)

**Concept**: Let Ink handle all width calculations via flexbox props.

```typescript
<Box flexGrow={1} flexShrink={1}>
  <Text wrap="truncate">{content}</Text>
</Box>
```

**Assessment**:

- **Pros**: Declarative, Ink handles math
- **Cons**: `wrap="truncate"` doesn't give ellipsis control; ANSI-aware truncation still needs manual displayLength; can't style truncation indicator
- **Verdict**: Limited - Ink's truncate is too basic for our needs (no custom ellipsis, no ANSI awareness for styled text)

#### Approach 3: useStdout() Hook for Dimensions

**Concept**: Components get dimensions directly from stdout instead of props.

```typescript
function TreeNode() {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  // Calculate own width based on position
}
```

**Assessment**:

- **Pros**: No prop drilling for terminal dimensions
- **Cons**: Components still need to know their position in layout to calculate available width; terminal dimensions ≠ component dimensions
- **Verdict**: Doesn't solve the problem - we need component-local width, not terminal width

#### Approach 4: Constraint Components (Higher-Order)

**Concept**: Wrap content in constraint components that handle layout.

```typescript
<ConstrainedText width={40} ellipsis="…">
  {styledContent}
</ConstrainedText>

<ConstrainedBox maxWidth={80} distribute="even">
  <Column /><Column /><Column />
</ConstrainedBox>
```

**Assessment**:

- **Pros**: Encapsulates width logic; reusable; cleaner component code
- **Cons**: Still need to calculate initial width somewhere; adds abstraction layer; may complicate debugging
- **Verdict**: Best option - abstracts the boilerplate while keeping control

#### Approach 5: Measure-then-Render Pattern

**Concept**: First render invisible to measure, then render visible with known dimensions.

```typescript
function useMeasuredLayout(children) {
  const [dims, setDims] = useState(null);
  return dims ? (
    <Box {...dims}>{children}</Box>
  ) : (
    <Box ref={measureRef}>{children}</Box>
  );
}
```

**Assessment**:

- **Pros**: Accurate measurements
- **Cons**: Ink doesn't support refs for measurement; double-render causes flicker; terminal doesn't have a layout engine like DOM
- **Verdict**: Not feasible in terminal environment

### Conclusion for Pain Point 1

**Severity**: Annoying but manageable
**Best approach**: Constraint Components (Approach 4)
**Effort**: 2-3 days to implement base components

---

## Pain Point 2: Custom Layout Infrastructure (layout/ module)

**Observation**: Entire module with truncate.ts, wrap.ts, constrain.ts, path.ts to handle text layout.

**Key functions**:

- `truncateText()` - ANSI-aware truncation with ellipsis
- `displayLength()` - character count excluding ANSI codes
- `constrainText()` - wrap + truncate + limit
- `wrapText()` - word wrap preserving ANSI codes

### Alternative Approaches

#### Approach 1: Use wrap-ansi/slice-ansi Packages

**Concept**: Replace custom code with established npm packages.

```typescript
import wrapAnsi from "wrap-ansi";
import sliceAnsi from "slice-ansi";

const truncated = sliceAnsi(text, 0, width - 1) + "…";
const wrapped = wrapAnsi(text, width, { hard: true });
```

**Assessment**:

- **Pros**: Battle-tested; maintained; handles edge cases
- **Cons**: wrap-ansi had issues with OSC 8 hyperlinks (why we disabled them); slice-ansi doesn't handle all ANSI sequences our code does
- **Verdict**: Partial - we tried this, hit edge cases, wrote custom code

#### Approach 2: chalk's String Width Utilities

**Concept**: Use chalk's built-in string-width for display length.

```typescript
import stringWidth from "string-width";
const len = stringWidth(styledText); // Handles ANSI + Unicode width
```

**Assessment**:

- **Pros**: Handles Unicode width (CJK characters = 2 cells); well maintained
- **Cons**: Doesn't handle slicing/truncation; still need custom truncate
- **Verdict**: Could replace displayLength() but not the full module

#### Approach 3: Pre-computed Plain Text + Style Map

**Concept**: Store plain text + style positions separately, truncate plain text, re-apply styles.

```typescript
const { plain, styles } = parseStyled("Hello **world**");
// plain: "Hello world"
// styles: [{start: 6, end: 11, style: 'bold'}]
const truncated = applyStyles(plain.slice(0, 8) + "…", styles);
```

**Assessment**:

- **Pros**: Truncation operates on simple strings; styles re-applied after
- **Cons**: Complex to implement correctly; style boundaries at cut point; more code not less
- **Verdict**: Adds complexity, not worth it

#### Approach 4: Render Rich Text AFTER Layout

**Concept**: Do all layout with plain text, apply styling only at render.

```typescript
const plainTitle = stripMarkdown(node.title);
const truncated = plainTitle.slice(0, width - 1) + '…';
const styled = applyMarkdownStyles(truncated);
return <Text>{styled}</Text>;
```

**Assessment**:

- **Pros**: Layout is simple (plain strings); styling is separate concern
- **Cons**: Styles may be cut at wrong points ("**bo" instead of "**bold\*\*" → "bo" bold); loses semantic styling
- **Verdict**: Doesn't work well - styling needs to be ANSI-aware

#### Approach 5: Accept Ink's Limitations

**Concept**: Simplify styling to what Ink handles natively, avoid custom ANSI.

```typescript
<Text bold wrap="truncate">{plainText}</Text>
```

**Assessment**:

- **Pros**: Zero custom code; Ink handles everything
- **Cons**: Loses rich text (wiki links, inline code, etc.); no custom ellipsis; less visual richness
- **Verdict**: Unacceptable UX regression

### Conclusion for Pain Point 2

**Severity**: Acceptable - the code works and is well-tested
**Best approach**: Keep current implementation, potentially use string-width for displayLength
**Effort**: 1 day to swap displayLength, or 0 days to keep as-is

---

## Pain Point 3: displayLength Complexity

**Observation**: Must calculate visible characters excluding ANSI codes everywhere.

**Current implementation (rich.ts:34-36)**:

```typescript
export function displayLength(text: string): number {
  return text.replace(ANSI_REGEX, "").length;
}
```

### Alternative Approaches

#### Approach 1: string-width Package

**Concept**: Use battle-tested npm package that handles ANSI + Unicode.

```typescript
import stringWidth from "string-width";
const len = stringWidth(text);
```

**Assessment**:

- **Pros**: Handles ANSI, Unicode width (CJK = 2), emoji; well maintained
- **Cons**: Slight overhead; may have different edge case behavior
- **Verdict**: Good replacement - more robust than our regex

#### Approach 2: Cached Display Lengths

**Concept**: Memoize display length calculations for repeated strings.

```typescript
const lengthCache = new Map<string, number>();
function displayLength(text: string): number {
  if (lengthCache.has(text)) return lengthCache.get(text)!;
  const len = text.replace(ANSI_REGEX, "").length;
  lengthCache.set(text, len);
  return len;
}
```

**Assessment**:

- **Pros**: Faster for repeated calculations
- **Cons**: Memory overhead; cache invalidation; strings rarely repeated exactly
- **Verdict**: Premature optimization - not a real bottleneck

#### Approach 3: Track Length During Styling

**Concept**: When applying styles, track the resulting display length.

```typescript
function renderRich(text: string): { styled: string; length: number } {
  // Calculate length as we build the string
  return { styled: result, length: visibleChars };
}
```

**Assessment**:

- **Pros**: No separate calculation needed; always accurate
- **Cons**: Changes API; all callers need updating; more complex renderRich
- **Verdict**: Significant refactor for marginal benefit

#### Approach 4: Strip-then-Length Pattern

**Concept**: Always stripAnsi before measuring.

```typescript
const len = stripAnsi(text).length;
```

**Assessment**:

- **Pros**: Explicit; easy to understand
- **Cons**: Creates intermediate string; this is exactly what displayLength does
- **Verdict**: No improvement over current

#### Approach 5: Avoid Needing displayLength

**Concept**: Structure code so display length isn't needed.

```typescript
// Instead of calculating available width...
<Box flexGrow={1}>
  <Text wrap="truncate">{text}</Text>
</Box>
```

**Assessment**:

- **Pros**: Declarative; no calculations
- **Cons**: Ink's truncate doesn't give us control; still need length for status bars, info columns
- **Verdict**: Not fully possible - we need explicit control in many places

### Conclusion for Pain Point 3

**Severity**: Annoying but simple
**Best approach**: Replace with string-width package
**Effort**: 0.5 days

---

## Pain Point 4: Board Overflow Handling

**Observation**: Manual maxVisibleCards calculation with complex math.

**Example from Board.tsx lines 287-308**:

```typescript
const estimatedCardHeight = maxContentLines + 3;
const maxCardsNoOverflow = Math.max(1, Math.floor(baseContentHeight / estimatedCardHeight));
const needsScroll = column.cards.length > maxCardsNoOverflow;
const reservedForIndicators = needsScroll ? 2 : 0;
const maxCards = Math.max(1, Math.floor((baseContentHeight - reservedForIndicators) / estimatedCardHeight));
const scrollOffset = needsScroll ? Math.max(0, Math.min(...)) : 0;
```

### Alternative Approaches

#### Approach 1: Virtual Scrolling Library

**Concept**: Use react-window or similar for virtualized lists.

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList height={contentHeight} itemCount={cards.length} itemSize={cardHeight}>
  {({ index, style }) => <Card card={cards[index]} style={style} />}
</FixedSizeList>
```

**Assessment**:

- **Pros**: Battle-tested scrolling; handles edge cases; efficient
- **Cons**: react-window is DOM-based, not terminal-compatible; Ink doesn't support this pattern
- **Verdict**: Not applicable to terminal environment

#### Approach 2: Ink's Scrolling (Experimental)

**Concept**: Use Ink's built-in overflow handling.

```typescript
<Box height={10} overflowY="hidden">
  {cards.map(card => <Card key={card.id} card={card} />)}
</Box>
```

**Assessment**:

- **Pros**: Declarative; Ink handles clipping
- **Cons**: No scroll indicators; no keyboard navigation awareness; items just get cut off
- **Verdict**: Too basic - we need scroll position awareness and indicators

#### Approach 3: Generic ScrollableList Component

**Concept**: Create a reusable scrollable list component.

```typescript
<ScrollableList
  items={cards}
  itemHeight={estimatedCardHeight}
  selectedIndex={selectedCardIndex}
  renderItem={(card, isSelected) => <Card card={card} isSelected={isSelected} />}
  renderOverflowTop={(count) => <Text>▲ {count} above</Text>}
  renderOverflowBottom={(count) => <Text>▼ {count} below</Text>}
/>
```

**Assessment**:

- **Pros**: Encapsulates scroll logic; reusable across views; cleaner component code
- **Cons**: Still need the math somewhere; abstraction adds indirection
- **Verdict**: Good - moves complexity to one place

#### Approach 4: Scroll State Hook

**Concept**: Custom hook that manages scroll state.

```typescript
const { visibleItems, scrollOffset, hasOverflow } = useScrollState({
  items: cards,
  selectedIndex,
  containerHeight,
  itemHeight,
});
```

**Assessment**:

- **Pros**: Separates scroll logic from rendering; testable; reusable
- **Cons**: Still need to calculate heights; hook + component vs component only
- **Verdict**: Good - clean separation of concerns

#### Approach 5: Estimated vs Measured Heights

**Concept**: Current estimation is rough; measure actual heights for accuracy.

```typescript
// Current: estimatedCardHeight = maxContentLines + 3
// Better: measure first render, cache heights
const cardHeights = cards.map((c) => measureCard(c));
```

**Assessment**:

- **Pros**: Accurate; handles variable height cards
- **Cons**: Ink doesn't support measurement; terminal can't query rendered height
- **Verdict**: Not feasible in terminal

### Conclusion for Pain Point 4

**Severity**: Annoying - the math is complex but works
**Best approach**: ScrollableList component or useScrollState hook
**Effort**: 2-3 days for either approach

---

## Pain Point 5: fullscreen-ink Race Condition

**Observation**: Startup requires polling and 50ms delays due to alternate screen buffer timing issues.

**Current workaround (Board.tsx lines 531-584)**:

```typescript
// WORKAROUND: fullscreen-ink alternate buffer race condition (issue km-rqt6)
// Solution: Delay rendering the actual UI until the terminal is fully ready
const [isReady, setIsReady] = useState(false);
// Poll for dimensions, then wait 50ms
```

### Alternative Approaches

#### Approach 1: Don't Use Alternate Screen Buffer

**Concept**: Render in main buffer instead of switching to alternate.

```typescript
// Don't use withFullScreen wrapper
render(<Board />);
```

**Assessment**:

- **Pros**: No race condition; simpler startup
- **Cons**: Scrollback gets filled with TUI output; exit leaves content on screen; less "app-like" feel
- **Verdict**: Acceptable trade-off for some use cases

#### Approach 2: Custom Alternate Screen Management

**Concept**: Handle alternate screen ourselves with proper sequencing.

```typescript
// Manual alternate screen switch
process.stdout.write('\x1b[?1049h'); // Switch to alternate
// Wait for terminal acknowledgment
await new Promise(r => setTimeout(r, 50));
// Then start Ink
render(<Board />);
```

**Assessment**:

- **Pros**: Full control over timing
- **Cons**: Duplicates fullscreen-ink functionality; fragile; terminal-specific
- **Verdict**: Worse than current workaround

#### Approach 3: Use raw Ink without fullscreen-ink

**Concept**: Implement fullscreen ourselves with better timing.

```typescript
import { render } from 'ink';

// Clear screen, position cursor
process.stdout.write('\x1b[2J\x1b[H');

const { rerender, cleanup } = render(<Board />);
```

**Assessment**:

- **Pros**: No dependency on fullscreen-ink; simpler
- **Cons**: Doesn't use alternate buffer (same as approach 1); or need to reimplement it
- **Verdict**: Partial solution

#### Approach 4: Loading State Instead of Empty Box

**Concept**: Show something useful during startup delay.

```typescript
if (!isReady) {
  return <Box><Text>Loading...</Text></Box>;
}
```

**Assessment**:

- **Pros**: Better UX during delay; no blank screen
- **Cons**: Flash still occurs; doesn't fix root cause
- **Verdict**: UX improvement but not a fix

#### Approach 5: Report Upstream / Wait for Fix

**Concept**: fullscreen-ink is the issue; wait for them to fix it.

**Assessment**:

- **Pros**: Proper fix at the source
- **Cons**: External dependency; uncertain timeline; may never be fixed
- **Verdict**: Long-term option but can't rely on it

### Conclusion for Pain Point 5

**Severity**: Acceptable - workaround is in place and works
**Best approach**: Keep current workaround, consider approach 4 (loading state) for UX
**Effort**: 0 days (keep as-is) or 0.5 days for loading state improvement

---

## Summary Table

| Pain Point               | Severity   | Best Approach                        | Effort   |
| ------------------------ | ---------- | ------------------------------------ | -------- |
| Manual width management  | Annoying   | Constraint Components                | 2-3 days |
| Custom layout module     | Acceptable | Keep as-is, maybe swap displayLength | 0-1 day  |
| displayLength complexity | Annoying   | Use string-width package             | 0.5 days |
| Board overflow handling  | Annoying   | ScrollableList or useScrollState     | 2-3 days |
| fullscreen-ink race      | Acceptable | Keep workaround + loading state      | 0.5 days |

**Total estimated effort for improvements**: 5-8 days

## Overall Assessment

The TUI1 layout pain points are real but **manageable**:

1. **None are blocking** - all have working code today
2. **Improvements are incremental** - can be done one at a time
3. **Core architecture is sound** - layered rendering approach works well
4. **Ink itself is mature** - used by Anthropic Claude Code, GitHub Copilot CLI, etc.

The effort to improve TUI1 is **less than completing TUI2** and has lower risk since the foundation works.
