# Ink Constraint System: Detailed Design

## Overview

A constraint-based layout system for Ink that exposes computed dimensions to child components, eliminating manual width threading.

---

## Design Principles

### 1. Incremental Adoption

Components can be migrated one at a time. Constraint components work alongside regular Ink components.

### 2. No Yoga Replacement

Yoga (used by Ink) already does layout. We add a dimension-exposure layer, not a replacement.

### 3. React Patterns

Uses context, hooks, and composition - familiar to React/Ink developers.

### 4. Integer Math

Use fractions/integers for width distribution, not floats. Avoids rounding errors that cause 1-character gaps.

### 5. Caching

Layout calculations cached. Only recompute on terminal resize or constraint changes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Application                                                     │
│  <Board>, <TreeNode>, <Card>                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ use
┌──────────────────────────▼──────────────────────────────────────┐
│  Constraint Components                                           │
│  <ConstraintRoot>, <Constrained>, <FlexRow>, <ScrollableList>   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ provide via context
┌──────────────────────────▼──────────────────────────────────────┐
│  Hooks                                                           │
│  useConstraints(), useComputedSize(), useTerminalSize()         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ render to
┌──────────────────────────▼──────────────────────────────────────┐
│  Ink Primitives                                                  │
│  <Box>, <Text>                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
/** Constraint specification for a dimension */
type SizeConstraint =
  | number // Fixed: exactly N characters
  | `${number}%` // Percentage: N% of parent
  | "auto" // Auto: size to content
  | "fill" // Fill: take remaining space
  | { min?: number; max?: number } // Range: between min and max
  | { flex: number }; // Flex: proportional to other flex items

/** Computed dimensions passed via context */
interface ComputedSize {
  width: number;
  height: number;
}

/** Terminal dimensions */
interface TerminalSize {
  columns: number;
  rows: number;
}

/** Context value */
interface ConstraintContextValue {
  terminal: TerminalSize;
  parent: ComputedSize;
}
```

---

## Components

### 1. ConstraintRoot

Root component that provides terminal dimensions and initiates the constraint tree.

```typescript
interface ConstraintRootProps {
  children: React.ReactNode;
  /** Padding from terminal edges */
  padding?: number | { x?: number; y?: number };
}

function ConstraintRoot({ children, padding = 0 }: ConstraintRootProps) {
  const { stdout } = useStdout();
  const [terminal, setTerminal] = useState<TerminalSize>({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });

  // Update on resize
  useEffect(() => {
    const handle = () => {
      setTerminal({
        columns: stdout?.columns ?? 80,
        rows: stdout?.rows ?? 24,
      });
    };
    stdout?.on('resize', handle);
    return () => { stdout?.off('resize', handle); };
  }, [stdout]);

  // Calculate available space after padding
  const px = typeof padding === 'number' ? padding : (padding.x ?? 0);
  const py = typeof padding === 'number' ? padding : (padding.y ?? 0);

  const parent: ComputedSize = {
    width: Math.max(1, terminal.columns - px * 2),
    height: Math.max(1, terminal.rows - py * 2),
  };

  return (
    <ConstraintContext.Provider value={{ terminal, parent }}>
      <Box paddingX={px} paddingY={py}>
        {children}
      </Box>
    </ConstraintContext.Provider>
  );
}
```

**Usage:**

```typescript
render(
  <ConstraintRoot padding={1}>
    <Board />
  </ConstraintRoot>
);
```

### 2. Constrained

Generic component that computes its size based on constraints and passes to children.

```typescript
interface ConstrainedProps {
  width?: SizeConstraint;
  height?: SizeConstraint;
  children: React.ReactNode | ((size: ComputedSize) => React.ReactNode);
}

function Constrained({ width = 'fill', height = 'fill', children }: ConstrainedProps) {
  const { parent } = useConstraintContext();

  const computed = useMemo(() => ({
    width: resolveConstraint(width, parent.width),
    height: resolveConstraint(height, parent.height),
  }), [width, height, parent]);

  const content = typeof children === 'function' ? children(computed) : children;

  return (
    <ConstraintContext.Provider value={{ ...useConstraintContext(), parent: computed }}>
      <Box width={computed.width} height={computed.height}>
        {content}
      </Box>
    </ConstraintContext.Provider>
  );
}

function resolveConstraint(constraint: SizeConstraint, available: number): number {
  if (typeof constraint === 'number') {
    return constraint;
  }
  if (typeof constraint === 'string' && constraint.endsWith('%')) {
    const pct = parseInt(constraint, 10);
    return Math.floor(available * pct / 100);
  }
  if (constraint === 'fill') {
    return available;
  }
  if (constraint === 'auto') {
    return available; // Will be refined by content measurement
  }
  if ('flex' in constraint) {
    return available; // Handled by parent FlexRow/FlexColumn
  }
  // Range constraint
  const { min = 0, max = available } = constraint;
  return Math.min(max, Math.max(min, available));
}
```

**Usage:**

```typescript
<Constrained width={40} height="50%">
  <Card />
</Constrained>

// With render prop for size access
<Constrained width="fill">
  {({ width }) => <Text>{`I have ${width} characters`}</Text>}
</Constrained>
```

### 3. FlexRow / FlexColumn

Distributes space among children using flex semantics.

```typescript
interface FlexItemConfig {
  flex?: number;      // Flex grow factor (default 0)
  width?: number;     // Fixed width (takes precedence over flex)
  minWidth?: number;  // Minimum width
  maxWidth?: number;  // Maximum width
  squish?: boolean;   // Allow shrinking below minWidth when necessary
}

interface FlexRowProps {
  children: React.ReactNode;
  gap?: number;
}

function FlexRow({ children, gap = 0 }: FlexRowProps) {
  const { parent } = useConstraintContext();
  const childArray = React.Children.toArray(children);

  // Extract configs from children props
  const configs: FlexItemConfig[] = childArray.map(child => {
    if (React.isValidElement(child) && child.type === FlexItem) {
      return child.props as FlexItemConfig;
    }
    return { flex: 1 }; // Default: flex equally
  });

  // Calculate widths using integer math
  const widths = distributeSpace(parent.width, configs, gap);

  return (
    <Box flexDirection="row" gap={gap}>
      {childArray.map((child, i) => {
        const childSize: ComputedSize = { width: widths[i], height: parent.height };
        return (
          <ConstraintContext.Provider
            key={i}
            value={{ terminal: useConstraintContext().terminal, parent: childSize }}
          >
            <Box width={widths[i]}>{child}</Box>
          </ConstraintContext.Provider>
        );
      })}
    </Box>
  );
}

/**
 * Distribute available space among items using integer math.
 * Avoids floating-point errors that cause 1-char gaps.
 */
function distributeSpace(
  total: number,
  configs: FlexItemConfig[],
  gap: number
): number[] {
  const gapTotal = Math.max(0, configs.length - 1) * gap;
  let available = total - gapTotal;

  const widths: number[] = new Array(configs.length).fill(0);

  // Pass 1: Allocate fixed widths
  let flexTotal = 0;
  configs.forEach((config, i) => {
    if (config.width !== undefined) {
      widths[i] = config.width;
      available -= config.width;
    } else {
      flexTotal += config.flex ?? 1;
    }
  });

  // Pass 2: Distribute remaining space to flex items
  if (flexTotal > 0 && available > 0) {
    let remaining = available;
    configs.forEach((config, i) => {
      if (config.width === undefined) {
        const flex = config.flex ?? 1;
        // Integer division with remainder distribution
        const share = Math.floor(available * flex / flexTotal);
        widths[i] = share;
        remaining -= share;
      }
    });

    // Distribute remainder to first flex items (1 char each)
    for (let i = 0; remaining > 0 && i < configs.length; i++) {
      if (configs[i].width === undefined) {
        widths[i]++;
        remaining--;
      }
    }
  }

  // Pass 3: Apply min/max constraints (may need multiple passes)
  // This is simplified - full implementation would iterate until stable
  configs.forEach((config, i) => {
    if (config.minWidth !== undefined && widths[i] < config.minWidth) {
      widths[i] = config.minWidth;
    }
    if (config.maxWidth !== undefined && widths[i] > config.maxWidth) {
      widths[i] = config.maxWidth;
    }
  });

  return widths;
}
```

**FlexItem wrapper (optional, for prop extraction):**

```typescript
interface FlexItemProps extends FlexItemConfig {
  children: React.ReactNode;
}

function FlexItem({ children }: FlexItemProps) {
  // FlexItem is just a marker component - FlexRow reads its props
  // The actual content is rendered by FlexRow
  return <>{children}</>;
}
```

**Usage:**

```typescript
<FlexRow gap={1}>
  <FlexItem width={10}><Prefix /></FlexItem>
  <FlexItem flex={2}><Title /></FlexItem>
  <FlexItem flex={1}><Status /></FlexItem>
</FlexRow>

// Simpler without FlexItem markers (all flex equally)
<FlexRow gap={1}>
  <Column1 />
  <Column2 />
  <Column3 />
</FlexRow>
```

### 4. TruncatedText

ANSI-aware text truncation using computed width from context.

```typescript
interface TruncatedTextProps {
  children: string;
  /** Truncation indicator (default: '…') */
  ellipsis?: string;
  /** Maximum lines before truncation (default: 1) */
  maxLines?: number;
  /** Custom width override (uses context width if not provided) */
  width?: number;
}

function TruncatedText({
  children,
  ellipsis = '…',
  maxLines = 1,
  width: widthOverride,
}: TruncatedTextProps) {
  const { parent } = useConstraintContext();
  const width = widthOverride ?? parent.width;

  const { lines } = useMemo(() =>
    constrainText(children, width, maxLines, ellipsis),
    [children, width, maxLines, ellipsis]
  );

  return (
    <>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </>
  );
}

/**
 * Constrain text to width and max lines.
 * ANSI-aware: preserves styling codes.
 */
function constrainText(
  text: string,
  width: number,
  maxLines: number,
  ellipsis: string
): { lines: string[] } {
  // Use existing layout/constrain.ts logic
  // Or wrap wrap-ansi + slice-ansi
  // Implementation details in existing km-ink code
}
```

**Usage:**

```typescript
// Automatically uses width from context
<TruncatedText>{node.title}</TruncatedText>

// With explicit max lines
<TruncatedText maxLines={3}>{node.description}</TruncatedText>

// With custom ellipsis
<TruncatedText ellipsis=" [...]">{longText}</TruncatedText>
```

### 5. ScrollableList

Virtualized scrolling with overflow indicators.

```typescript
interface ScrollableListProps<T> {
  items: T[];
  selectedIndex: number;
  /** Estimated height per item (characters) */
  itemHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  /** Render overflow indicator */
  renderOverflow?: (direction: 'top' | 'bottom', count: number) => React.ReactNode;
  /** Gap between items */
  gap?: number;
}

function ScrollableList<T>({
  items,
  selectedIndex,
  itemHeight,
  renderItem,
  renderOverflow,
  gap = 0,
}: ScrollableListProps<T>) {
  const { parent } = useConstraintContext();

  // Calculate visible range
  const { visible, scrollOffset, overflowTop, overflowBottom } = useMemo(() => {
    const effectiveItemHeight = itemHeight + gap;
    const indicatorHeight = renderOverflow ? 1 : 0;

    // How many items can we show?
    let availableHeight = parent.height;
    let maxVisible = Math.floor(availableHeight / effectiveItemHeight);

    // Reserve space for indicators if needed
    if (items.length > maxVisible) {
      availableHeight -= indicatorHeight * 2;
      maxVisible = Math.floor(availableHeight / effectiveItemHeight);
    }

    maxVisible = Math.max(1, maxVisible);

    // Calculate scroll offset to keep selected item visible
    const halfVisible = Math.floor(maxVisible / 2);
    let scrollOffset = 0;

    if (items.length > maxVisible) {
      // Center selection when possible
      scrollOffset = Math.max(0, selectedIndex - halfVisible);
      scrollOffset = Math.min(scrollOffset, items.length - maxVisible);
    }

    return {
      visible: items.slice(scrollOffset, scrollOffset + maxVisible),
      scrollOffset,
      overflowTop: scrollOffset,
      overflowBottom: Math.max(0, items.length - scrollOffset - maxVisible),
    };
  }, [items, selectedIndex, itemHeight, gap, parent.height, renderOverflow]);

  const defaultOverflow = (dir: 'top' | 'bottom', count: number) => (
    <Text dimColor>{dir === 'top' ? `▲ ${count} more` : `▼ ${count} more`}</Text>
  );

  const OverflowIndicator = renderOverflow ?? defaultOverflow;

  return (
    <Box flexDirection="column" gap={gap}>
      {overflowTop > 0 && <OverflowIndicator direction="top" count={overflowTop} />}
      {visible.map((item, i) => {
        const actualIndex = scrollOffset + i;
        return (
          <React.Fragment key={actualIndex}>
            {renderItem(item, actualIndex, actualIndex === selectedIndex)}
          </React.Fragment>
        );
      })}
      {overflowBottom > 0 && <OverflowIndicator direction="bottom" count={overflowBottom} />}
    </Box>
  );
}
```

**Usage:**

```typescript
<ScrollableList
  items={cards}
  selectedIndex={selectedCardIndex}
  itemHeight={4}
  renderItem={(card, idx, isSelected) => (
    <Card card={card} isSelected={isSelected} />
  )}
  renderOverflow={(dir, count) => (
    <Text color="gray">{dir === 'top' ? '↑' : '↓'} {count} more</Text>
  )}
/>
```

---

## Hooks

### useConstraintContext

Access the full constraint context.

```typescript
function useConstraintContext(): ConstraintContextValue {
  const context = useContext(ConstraintContext);
  if (!context) {
    throw new Error(
      "useConstraintContext must be used within a ConstraintRoot",
    );
  }
  return context;
}
```

### useComputedSize

Shorthand for accessing just the computed parent size.

```typescript
function useComputedSize(): ComputedSize {
  const { parent } = useConstraintContext();
  return parent;
}
```

### useTerminalSize

Access terminal dimensions.

```typescript
function useTerminalSize(): TerminalSize {
  const { terminal } = useConstraintContext();
  return terminal;
}
```

---

## Migration Example

### Before (Current Ink Pattern)

```typescript
function TreeNode({ node, width, isSelected }: {
  node: TNode;
  width: number;  // Must be passed by parent
  isSelected: boolean;
}) {
  const prefix = getPrefix(node);
  const prefixLen = displayLength(prefix);  // Manual calculation
  const contentWidth = Math.max(1, width - prefixLen);  // Manual subtraction
  const styled = renderRich(node.title);
  const { lines } = constrainText(styled, contentWidth, 3);  // Manual constraining

  return (
    <Box>
      <Text>{prefix}</Text>
      <Box width={contentWidth}>
        {lines.map((line, i) => <Text key={i}>{line}</Text>)}
      </Box>
    </Box>
  );
}

// Parent must calculate and pass width
function Column({ column, width }: { column: TColumn; width: number }) {
  return (
    <Box width={width} flexDirection="column">
      {column.cards.map((card, i) => (
        <TreeNode
          key={card.id}
          node={card}
          width={width - 2}  // Manual subtraction for padding
          isSelected={i === selectedIndex}
        />
      ))}
    </Box>
  );
}
```

### After (With Constraint System)

```typescript
function TreeNode({ node, isSelected }: {
  node: TNode;
  isSelected: boolean;
}) {
  return (
    <FlexRow>
      <FlexItem width="auto">
        <Text>{getPrefix(node)}</Text>
      </FlexItem>
      <FlexItem flex={1}>
        <TruncatedText maxLines={3}>
          {renderRich(node.title)}
        </TruncatedText>
      </FlexItem>
    </FlexRow>
  );
}

// No width prop needed - constraints flow automatically
function Column({ column }: { column: TColumn }) {
  const { parent } = useComputedSize();

  return (
    <ScrollableList
      items={column.cards}
      selectedIndex={selectedCardIndex}
      itemHeight={4}
      renderItem={(card, idx, isSelected) => (
        <TreeNode node={card} isSelected={isSelected} />
      )}
    />
  );
}
```

**Lines of code saved**: ~60% reduction in layout boilerplate per component.

---

## Implementation Phases

### Phase 1: Foundation (1 day)

- `ConstraintContext` and `ConstraintRoot`
- `useConstraintContext`, `useComputedSize`, `useTerminalSize` hooks
- Basic tests

### Phase 2: TruncatedText (1 day)

- `TruncatedText` component
- Integration with existing `constrainText` function
- Tests with ANSI-styled content

### Phase 3: FlexRow/FlexItem (2 days)

- `FlexRow` and `FlexColumn` components
- `FlexItem` marker component
- `distributeSpace` algorithm with integer math
- Min/max constraint support
- Extensive tests for edge cases

### Phase 4: ScrollableList (2 days)

- `ScrollableList` component
- Scroll position calculation
- Overflow indicators
- Tests with varying heights

### Phase 5: Integration (1-2 days)

- Refactor `TreeNode` to use constraint components
- Refactor `ColumnsView` to use `FlexRow`
- Refactor `Board` columns to use `ScrollableList`
- Visual regression tests

**Total: 7-9 days**

---

## Testing Strategy

### Unit Tests

```typescript
describe("distributeSpace", () => {
  it("distributes equally among flex items", () => {
    const widths = distributeSpace(
      100,
      [{ flex: 1 }, { flex: 1 }, { flex: 1 }],
      0,
    );
    expect(widths).toEqual([34, 33, 33]); // 100 = 34 + 33 + 33 (integer division)
  });

  it("respects fixed widths", () => {
    const widths = distributeSpace(100, [{ width: 20 }, { flex: 1 }], 0);
    expect(widths).toEqual([20, 80]);
  });

  it("handles gaps", () => {
    const widths = distributeSpace(100, [{ flex: 1 }, { flex: 1 }], 2);
    expect(widths).toEqual([49, 49]); // 100 - 2 = 98, split evenly
  });
});
```

### Visual Tests

Use existing ttyd + Playwright infrastructure:

```typescript
it("FlexRow distributes space correctly", async () => {
  // Render test component
  // Capture screenshot
  // Compare to baseline
});
```

---

## Future Enhancements

### 1. Cassowary Integration

For complex constraint scenarios (not needed initially):

```typescript
<ConstraintBox
  constraints={[
    { left: parent.left },
    { right: parent.right },
    { width: { min: 20, preferred: 40, max: 60, strength: 'strong' } },
  ]}
>
  <Content />
</ConstraintBox>
```

### 2. Grid Layout

CSS Grid-like layout for complex arrangements:

```typescript
<Grid columns={3} rows={2} gap={1}>
  <GridItem column={1} row={1} span={[2, 1]}><Header /></GridItem>
  <GridItem column={1} row={2}><Sidebar /></GridItem>
  <GridItem column={2} row={2} span={[2, 1]}><Content /></GridItem>
</Grid>
```

### 3. Responsive Breakpoints

Different layouts at different terminal sizes:

```typescript
<Responsive
  breakpoints={{
    small: 60,
    medium: 100,
  }}
  render={({ breakpoint }) =>
    breakpoint === 'small' ? <CompactView /> : <FullView />
  }
/>
```

---

## Sources

- [How to Write a Flexbox Layout Engine](https://tchayen.com/how-to-write-a-flexbox-layout-engine) - Three-pass algorithm
- [Yoga Layout](https://www.yogalayout.dev/) - Flexbox implementation used by Ink
- [kiwi.js](https://github.com/IjzerenHein/kiwi.js) - TypeScript Cassowary solver
- [7 Things I've Learned Building a Modern TUI Framework](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/) - Integer math, caching
- [Cursive BoxView](https://docs.rs/cursive/latest/cursive/views/struct.BoxView.html) - Squishable concept
