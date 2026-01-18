# Ink Development Patterns

This guide documents patterns, workarounds, and best practices for working with Ink in km's TUI layer. These solutions address known Ink limitations and ensure consistent behavior.

**Related docs:**

- [ADR 001: TUI Architecture](../adr/001-tui-architecture.md) - Decision to stay with Ink
- [km-ink README](../../apps/km-tui/packages/km-ink/src/README.md) - Component hierarchy and data flow

## Known Issues and Workarounds

### 1. fullscreen-ink Alternate Buffer Race Condition

**Location:** [Board.tsx:384-444](../../apps/km-tui/packages/km-ink/src/views/Board.tsx#L384-L444)

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

### 3. ANSI-aware Text Length

**Problem:** `String.length` counts ANSI escape codes, breaking layout calculations for styled text.

**Location:** [text/rich.ts](../../apps/km-tui/packages/km-ink/src/text/rich.ts)

**Solution:** Use `displayLength()` for all width calculations:

```typescript
import { displayLength } from "../text/rich.ts";

// Wrong - counts ANSI codes
const width = styledText.length;

// Correct - visual character count
const width = displayLength(styledText);
```

## Constraint Components

We've built constraint components to reduce boilerplate for common layout patterns.

**Location:** [constraints/](../../apps/km-tui/packages/km-ink/src/constraints/)

### ConstraintContext

Provides width to descendant components without prop drilling:

```tsx
import { ConstraintContext, useConstraint } from "../constraints";

// Parent provides width
<ConstraintContext.Provider value={{ width: 80 }}>
  <MyComponent />
</ConstraintContext.Provider>;

// Child consumes width
function MyComponent() {
  const { width } = useConstraint();
  return <Text>{truncate(text, width)}</Text>;
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

Handles overflow with scrolling, without complex math:

```tsx
import { ScrollableList } from "../constraints";

<ScrollableList
  items={nodes}
  selectedIndex={cursorIndex}
  height={availableHeight}
  renderItem={(node, index, isSelected) => (
    <TreeNode node={node} isSelected={isSelected} />
  )}
/>;
```

**Features:**

- Auto-scrolls to keep selected item visible
- Supports custom overflow indicators
- Handles variable-height items

### FlexRow

Divides width between columns with optional fixed-width columns:

```tsx
import { FlexRow } from "../constraints";

<FlexRow
  width={80}
  columns={[
    { flex: 1, render: (w) => <Text>{truncate(title, w)}</Text> },
    { width: 10, render: () => <Text>{status}</Text> },
    { width: 12, render: () => <Text>{date}</Text> },
  ]}
/>;
```

## Text Rendering Pipeline

**Key principle:** Render styling before truncation.

```
Raw markdown → renderRich() → styled ANSI → constrainText() → <Text>
```

### Layer 1: Render Rich Text

Convert markdown to styled ANSI string:

```typescript
import { renderRich } from "../text/rich.ts";

const styled = renderRich("**bold** and _italic_");
// Returns: "\x1b[1mbold\x1b[22m and \x1b[3mitalic\x1b[23m"
```

### Layer 2: Constrain Text

Apply width constraints (truncate/wrap) to styled text:

```typescript
import { constrainText } from "../layout/constrain.ts";

const lines = constrainText(styled, {
  width: 40,
  maxLines: 2,
  mode: "wrap", // or "truncate"
});
```

### Layer 3: Render Lines

Render each line in `<Text>`:

```tsx
{
  lines.map((line, i) => <Text key={i}>{line}</Text>);
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

Visual testing with [storybook.tsx](../../apps/km-tui/packages/km-ink/tests/storybook.tsx):

```bash
bun storybook
```

Displays all components in various states for visual verification.

**Important:** The storybook must use production rendering code exclusively. It should never use `chalk` or raw Ink primitives (`<Text color=...>`) to implement styling directly. Instead:

- Use production components: `TreeNode`, `ListView`, `ColumnsView`, `TabsView`
- Use production functions: `renderRich()`, `getStatusIcon()`, `colorize()`
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
  const columnWidth = Math.floor(width / columns.length);
  return columns.map((col) => <Column width={columnWidth} {...col} />);
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
    moveCursor("down");
  }
});
```

## Debugging Tips

1. **Dimension issues:** Log `stdout.columns` and `stdout.rows` - they may be `undefined` on first render
2. **Layout overflow:** Check `displayLength()` vs `String.length` usage
3. **Missing content:** Verify `isReady` state for fullscreen-ink race condition
4. **Style bleeding:** Ensure ANSI reset codes are preserved after truncation
