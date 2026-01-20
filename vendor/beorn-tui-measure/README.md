# @beorn/tui-measure

Framework-agnostic text measurement and constraint-based layout for terminal UIs.

Works with Ink, inkx, or any React-based TUI framework.

## Features

- **Integer-math flex distribution** - Avoids 1-char gap bugs from floating-point errors
- **ANSI-aware text utilities** - Measure, truncate, wrap styled strings with escape codes
- **Variable-height virtualized scrolling** - Efficient rendering of long lists
- **Framework-agnostic** - Render props pattern lets you plug in any UI framework

## Installation

```bash
npm install @beorn/tui-measure
# or
bun add @beorn/tui-measure
```

## Quick Start

```tsx
import { render, useStdout, Text, Box } from "ink";
import { ConstraintRoot, TruncatedText, useComputedSize } from "@beorn/tui-measure";

function App() {
  const { stdout } = useStdout();
  return (
    <ConstraintRoot stdout={stdout} padding={1}>
      <MyComponent />
    </ConstraintRoot>
  );
}

function MyComponent() {
  const { width, height } = useComputedSize();
  return (
    <Box flexDirection="column">
      <Text>Available: {width}x{height}</Text>
      <TruncatedText renderLine={(line, i) => <Text key={i}>{line}</Text>}>
        {veryLongText}
      </TruncatedText>
    </Box>
  );
}

render(<App />);
```

## API Reference

### Context

#### `<ConstraintRoot>`

Root component that provides terminal dimensions to the constraint tree.

```tsx
<ConstraintRoot
  stdout={process.stdout}  // Required: stdout stream (from useStdout or process.stdout)
  padding={1}              // Optional: padding from terminal edges
>
  {children}
</ConstraintRoot>
```

#### `useComputedSize()`

Returns the computed size available to the current component.

```tsx
const { width, height } = useComputedSize();
```

#### `useTerminalSize()`

Returns the raw terminal dimensions.

```tsx
const { columns, rows } = useTerminalSize();
```

### Components

#### `<TruncatedText>`

ANSI-aware text truncation that uses width from context.

```tsx
<TruncatedText
  maxLines={1}         // Maximum lines before truncation
  ellipsis="…"         // Truncation indicator
  width={40}           // Optional: explicit width override
  pad={false}          // Pad lines to full width
  renderLine={(line, i) => <Text key={i}>{line}</Text>}  // Optional: custom line renderer
>
  {text}
</TruncatedText>
```

#### `<FlexRow>` and `<FlexItem>`

Distributes horizontal space among children using flex semantics.

```tsx
<FlexRow
  gap={1}
  renderRow={(children) => <Box flexDirection="row" gap={1}>{children}</Box>}
  renderItem={(content, width) => <Box width={width}>{content}</Box>}
>
  <FlexItem width={10}><Text>Fixed</Text></FlexItem>
  <FlexItem flex={2}><Text>Flex 2</Text></FlexItem>
  <FlexItem flex={1}><Text>Flex 1</Text></FlexItem>
</FlexRow>
```

#### `<ScrollableList>`

Virtualized scrolling list with overflow indicators.

```tsx
<ScrollableList
  items={items}
  selectedIndex={selectedIndex}
  itemHeight={1}
  gap={0}
  renderItem={(item, index, isSelected) => (
    <Text inverse={isSelected}>{item.name}</Text>
  )}
  renderOverflow={(direction, count) => (
    <Text dim>{direction === 'top' ? '▲' : '▼'} {count} more</Text>
  )}
  renderContainer={(children) => (
    <Box flexDirection="column">{children}</Box>
  )}
/>
```

### Text Utilities

```tsx
import {
  displayLength,   // Get display width excluding ANSI codes
  stripAnsi,       // Remove all ANSI escape codes
  wrapText,        // Word-wrap with ANSI support
  truncateText,    // Truncate with ellipsis
  padText,         // Pad to width
  constrainText,   // Wrap + truncate + pad
} from "@beorn/tui-measure";

// Get display width (handles ANSI, emoji, CJK)
displayLength("\x1b[31mHello\x1b[0m"); // 5

// Truncate to width
truncateText("Hello World", 8); // "Hello W…"

// Wrap to width
wrapText("Hello World", 5); // ["Hello", "World"]

// Full constraint
constrainText("Hello World", 5, 2, true);
// { lines: ["Hello", "World"], truncated: false }
```

### Hooks

#### `useTruncatedText(text, options)`

Hook version of TruncatedText for custom rendering.

```tsx
const { lines, truncated } = useTruncatedText(text, {
  maxLines: 2,
  width: 40,
  ellipsis: "...",
});
```

#### `useScrollState(items, selectedIndex, options)`

Calculate scroll state without rendering.

```tsx
const { visible, overflowTop, overflowBottom, scrollOffset } = useScrollState(
  items,
  selectedIndex,
  { itemHeight: 1, height: 10 }
);
```

### Pure Functions

#### `distributeSpace(total, configs, gap)`

Distribute space using integer math.

```tsx
const widths = distributeSpace(80, [
  { width: 10 },      // Fixed 10
  { flex: 2 },        // 2/3 of remaining
  { flex: 1 },        // 1/3 of remaining
], 1);
// [10, 45, 23] (with 1-char gaps = 80 total)
```

#### `calculateScrollState(items, selectedIndex, height, itemHeight, gap, hasIndicator)`

Calculate which items are visible in a scrollable list.

```tsx
const state = calculateScrollState(items, 5, 10, 1, 0, true);
// { visible: [...], scrollOffset: 3, overflowTop: 3, overflowBottom: 2 }
```

## License

MIT
