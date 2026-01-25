# Ink Alternatives and Constraint System Design

## Executive Summary

Ink's fundamental problem is **no automatic layout negotiation between parent and child**. Children render but never learn how much space they got. This research surveys how other frameworks solve this and proposes a constraint system for Ink.

---

## Part 1: Ink's Fundamental Problem

### The Core Issue

In browser CSS, layout happens in two passes:

1. **Measure pass**: Children declare min/max/flex preferences
2. **Render pass**: Parent distributes space, children receive their calculated dimensions

Ink skips the measure pass. `<Box flexGrow={1}>` exists, but children never discover their computed width. This forces manual width threading:

```typescript
// Every component, every time:
function TreeNode({ width }: { width: number }) {  // ← manually passed
  const prefixLen = displayLength(prefix);          // ← manually calculated
  const contentWidth = width - prefixLen - 2;       // ← manually subtracted
  const wrapped = wrapAnsi(content, contentWidth);  // ← manually applied
  return <Text>{wrapped}</Text>;
}
```

### Historical Issues

| Issue                                                  | Date | Status | Summary                                                                                         |
| ------------------------------------------------------ | ---- | ------ | ----------------------------------------------------------------------------------------------- |
| [#5](https://github.com/vadimdemedes/ink/issues/5)     | 2016 | Closed | "ProgressBar needs to know how much space Label takes" - proposed x/y coords, never implemented |
| [#78](https://github.com/vadimdemedes/ink/issues/78)   | 2018 | Closed | Full-screen layouts - maintainer said "use react-blessed instead"                               |
| [#168](https://github.com/vadimdemedes/ink/issues/168) | 2019 | Closed | Get width of Box - led to measureElement()                                                      |
| [#307](https://github.com/vadimdemedes/ink/pull/307)   | 2020 | Merged | Added `measureElement()` API                                                                    |

### measureElement() - Partial Solution

PR #307 added `measureElement(ref)` which returns `{width, height}`. This helps but doesn't solve the fundamental problem:

```typescript
// Still requires manual wiring:
const ref = useRef();
const [width, setWidth] = useState(80);

useEffect(() => {
  const { width } = measureElement(ref.current);
  setWidth(width);  // ← Manual state update
}, []);

return <Box ref={ref}><Content width={width} /></Box>;  // ← Still threading width
```

**Limitations:**

- Returns 0 on initial render (layout not yet calculated)
- Requires useEffect + state (re-render after measurement)
- Still need manual width prop threading
- No automatic constraint propagation

### Secondary Problems

1. **ANSI breaks `.length`** - `"\x1b[31mhi\x1b[0m".length` is 12, not 2
2. **No overflow primitives** - must implement scroll math manually
3. **No measurement for height** - can't measure content height before render
4. **fullscreen-ink race conditions** - alternate buffer timing issues

---

## Part 2: How Other Frameworks Solve It

### Ratatui (Rust) - Constraint Solver

Uses the **Cassowary algorithm** (same as iOS Auto Layout, macOS).

```rust
let chunks = Layout::default()
    .direction(Direction::Horizontal)
    .constraints([
        Constraint::Length(10),      // Fixed 10 chars
        Constraint::Min(20),         // At least 20
        Constraint::Percentage(50),  // Half of remaining
        Constraint::Fill(1),         // Take rest
    ])
    .split(area);
// chunks[0], chunks[1], etc. contain computed Rect with x, y, width, height
```

**Key insight**: Constraints are declarative. The solver computes dimensions before rendering. Children receive their rectangles, not constraints.

**Priority order**: Min → Max → Length → Percentage → Ratio → Fill

**Source**: [Ratatui Layout Docs](https://ratatui.rs/concepts/layout/), [Constraint API](https://docs.rs/ratatui/latest/ratatui/layout/enum.Constraint.html)

### Textual (Python) - CSS Grid/Flexbox

Full CSS-like layout engine with grid, flexbox, docking.

```css
Screen {
  layout: grid;
  grid-size: 3 2;
  grid-gutter: 1;
}

#sidebar {
  dock: left;
  width: 20;
}

.content {
  width: 1fr; /* Fractional unit - takes remaining space */
}
```

**Key features:**

- `fr` units for flexible space distribution
- `grid-size`, `grid-columns`, `grid-rows` for complex layouts
- `dock: left|right|top|bottom` for fixed positioning
- Runtime style updates via `widget.styles.width = "50%"`
- 120 FPS rendering with delta updates

**Source**: [Textual Layout Guide](https://textual.textualize.io/guide/layout/)

### Bubble Tea (Go) - Manual + BubbleLayout

Core Bubble Tea is manual - you handle `WindowSizeMsg` yourself.

[BubbleLayout](https://github.com/winder/bubblelayout) adds declarative constraints:

```go
layout := bubblelayout.New()
layout.AddCell(Cell{MinWidth: 20, PreferredWidth: 40, MaxWidth: 60})
layout.AddCell(Cell{SpanWidth: 2})  // Span 2 columns
layout.AddDock(Dock{Position: "top", Height: 3})  // Fixed header
```

### iocraft (Rust) - React-like + Flexbox

Newer framework inspired by Ink, but with proper flexbox:

```rust
element! {
    <View direction={Direction::Row}>
        <View width={10}><Text>Fixed</Text></View>
        <View flex_grow={1}><Text>Flex</Text></View>
    </View>
}
```

**Source**: [iocraft GitHub](https://github.com/ccbrown/iocraft)

### OpenTUI (TypeScript) - Ink Alternative

Has layout improvements but **blocking bugs** (tested in km-tui-eval):

- Color rendering broken (black on cyan fails)
- Bracket/space rendering issues (`[P1] ` → `[P1`)
- borderStyle typos cause segfaults

57 open issues including layout/sizing problems.

**Source**: [OpenTUI Issues](https://github.com/sst/opentui/issues)

### blessed/neo-blessed (Node.js) - Widget-Based

Older, widget-based approach with explicit positioning:

```javascript
var box = blessed.box({
  top: "center",
  left: "center",
  width: "50%",
  height: "50%",
  content: "Hello!",
})
```

Uses a painter's algorithm with damage buffers. Layout system is "experimental" - docs warn mechanics may change.

**Source**: [blessed GitHub](https://github.com/chjj/blessed)

### Comparison Table

| Framework  | Language   | Layout System         | Constraint Solver | Effort to Adopt                   |
| ---------- | ---------- | --------------------- | ----------------- | --------------------------------- |
| Ratatui    | Rust       | Cassowary constraints | Yes (kasuari)     | Rewrite in Rust                   |
| Textual    | Python     | CSS Grid/Flexbox      | Yes (internal)    | Rewrite in Python                 |
| Bubble Tea | Go         | Manual / BubbleLayout | Optional          | Rewrite in Go                     |
| iocraft    | Rust       | Flexbox               | Partial           | Rewrite in Rust                   |
| OpenTUI    | TypeScript | Flexbox               | Partial           | Migration possible, blocking bugs |
| blessed    | Node.js    | Widget positioning    | No                | Different paradigm                |
| **Ink**    | TypeScript | Yoga Flexbox          | **No**            | Current                           |

---

## Part 3: JavaScript Constraint Solvers

### Available Libraries

1. **[kiwi.js](https://github.com/IjzerenHein/kiwi.js)** - Fast TypeScript Cassowary implementation
   - Active maintenance
   - Used by layout frameworks
   - Clean API

2. **[cassowary.js](https://github.com/slightlyoff/cassowary.js)** - Original JS port
   - Works in browser/Node/workers
   - More mature, less maintained

### Kiwi.js Example

```typescript
import * as kiwi from "kiwi.js"

const solver = new kiwi.Solver()

// Create variables
const leftWidth = new kiwi.Variable()
const rightWidth = new kiwi.Variable()
const totalWidth = 80

// Add constraints
solver.addConstraint(
  new kiwi.Constraint(leftWidth.plus(rightWidth), kiwi.Operator.Eq, totalWidth),
)
solver.addConstraint(
  new kiwi.Constraint(leftWidth, kiwi.Operator.Ge, 20, kiwi.Strength.required),
)
solver.addConstraint(
  new kiwi.Constraint(
    rightWidth,
    kiwi.Operator.Ge,
    leftWidth,
    kiwi.Strength.strong,
  ),
)

solver.updateVariables()
// leftWidth.value() → 20
// rightWidth.value() → 60
```

---

## Part 4: Proposed Constraint System for Ink

### Design Goals

1. **Declarative** - Constraints expressed in JSX, not imperative code
2. **Incremental** - Can adopt one component at a time
3. **Compatible** - Works with existing Ink components
4. **Performant** - Constraint solving cached, only recomputes on resize

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User Components                                             │
│  <Board>, <TreeNode>, <Card>                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ use constraint components
┌─────────────────────▼───────────────────────────────────────┐
│  Constraint Components Layer                                 │
│  <ConstraintProvider>, <ConstraintBox>, <FlexRow>           │
└─────────────────────┬───────────────────────────────────────┘
                      │ calls
┌─────────────────────▼───────────────────────────────────────┐
│  Layout Engine                                               │
│  - Collects constraints from tree                           │
│  - Solves with kiwi.js                                      │
│  - Provides computed dimensions via context                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ renders to
┌─────────────────────▼───────────────────────────────────────┐
│  Ink Primitives                                              │
│  <Box>, <Text>                                              │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. ConstraintProvider

Root component that manages the constraint solver and terminal dimensions.

```typescript
interface ConstraintProviderProps {
  children: React.ReactNode;
}

function ConstraintProvider({ children }: ConstraintProviderProps) {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState({ width: 80, height: 24 });
  const solver = useMemo(() => new kiwi.Solver(), []);

  // Update on terminal resize
  useEffect(() => {
    const update = () => setDimensions({
      width: stdout?.columns ?? 80,
      height: stdout?.rows ?? 24,
    });
    stdout?.on('resize', update);
    return () => stdout?.off('resize', update);
  }, [stdout]);

  return (
    <ConstraintContext.Provider value={{ solver, ...dimensions }}>
      {children}
    </ConstraintContext.Provider>
  );
}
```

#### 2. ConstraintBox

A Box that participates in constraint solving.

```typescript
interface ConstraintBoxProps {
  // Constraint declarations
  width?: number | `${number}%` | 'fill' | { min?: number; max?: number; preferred?: number };
  height?: number | `${number}%` | 'fill' | { min?: number; max?: number; preferred?: number };

  // Standard Ink props
  children?: React.ReactNode;
  flexDirection?: 'row' | 'column';
  gap?: number;
}

function ConstraintBox({ width, height, children, ...props }: ConstraintBoxProps) {
  const { solver, width: termWidth, height: termHeight } = useConstraintContext();
  const [computed, setComputed] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    // Register constraints with solver
    const widthVar = new kiwi.Variable();
    const heightVar = new kiwi.Variable();

    // Parse width constraint
    if (typeof width === 'number') {
      solver.addConstraint(new kiwi.Constraint(widthVar, kiwi.Operator.Eq, width));
    } else if (width === 'fill') {
      solver.addEditVariable(widthVar, kiwi.Strength.weak);
    } else if (typeof width === 'object') {
      if (width.min) solver.addConstraint(/* ... */);
      if (width.max) solver.addConstraint(/* ... */);
    }

    solver.updateVariables();
    setComputed({ width: widthVar.value(), height: heightVar.value() });

    return () => { /* cleanup constraints */ };
  }, [width, height, termWidth, termHeight]);

  return (
    <Box width={computed.width} height={computed.height} {...props}>
      <ComputedDimensionsContext.Provider value={computed}>
        {children}
      </ComputedDimensionsContext.Provider>
    </Box>
  );
}
```

#### 3. FlexRow / FlexColumn

Distributes space among children with flex semantics.

```typescript
interface FlexRowProps {
  children: React.ReactNode;
  gap?: number;
}

function FlexRow({ children, gap = 0 }: FlexRowProps) {
  const { width } = useComputedDimensions();
  const childArray = React.Children.toArray(children);

  // Solve for child widths based on flex props
  const solver = new kiwi.Solver();
  const childVars = childArray.map(() => new kiwi.Variable());

  // Sum of children = available width
  const totalGap = (childArray.length - 1) * gap;
  solver.addConstraint(/* sum(childVars) = width - totalGap */);

  // Per-child constraints from props
  childArray.forEach((child, i) => {
    if (React.isValidElement(child)) {
      const { flex, minWidth, maxWidth } = child.props;
      // Add constraints based on flex/min/max
    }
  });

  solver.updateVariables();

  return (
    <Box flexDirection="row" gap={gap}>
      {childArray.map((child, i) => (
        <ComputedDimensionsContext.Provider
          key={i}
          value={{ width: childVars[i].value(), height: /* inherited */ }}
        >
          {child}
        </ComputedDimensionsContext.Provider>
      ))}
    </Box>
  );
}
```

#### 4. TruncatedText

ANSI-aware text with automatic truncation.

```typescript
interface TruncatedTextProps {
  children: string;
  ellipsis?: string;
}

function TruncatedText({ children, ellipsis = '…' }: TruncatedTextProps) {
  const { width } = useComputedDimensions();
  const truncated = truncateAnsi(children, width, ellipsis);
  return <Text>{truncated}</Text>;
}
```

#### 5. ScrollableList

Virtualized list with scroll indicators.

```typescript
interface ScrollableListProps<T> {
  items: T[];
  selectedIndex: number;
  itemHeight: number;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  renderOverflow?: (direction: 'top' | 'bottom', count: number) => React.ReactNode;
}

function ScrollableList<T>({ items, selectedIndex, itemHeight, renderItem, renderOverflow }: ScrollableListProps<T>) {
  const { height } = useComputedDimensions();

  const maxVisible = Math.floor(height / itemHeight);
  const { visibleItems, scrollOffset, overflowTop, overflowBottom } = useScrollState({
    items,
    selectedIndex,
    maxVisible,
  });

  return (
    <Box flexDirection="column">
      {overflowTop > 0 && renderOverflow?.('top', overflowTop)}
      {visibleItems.map((item, i) => renderItem(item, i + scrollOffset === selectedIndex))}
      {overflowBottom > 0 && renderOverflow?.('bottom', overflowBottom)}
    </Box>
  );
}
```

### Usage Example

**Before (current Ink):**

```typescript
function TreeNode({ node, width, isSelected }: Props) {
  const prefix = getPrefix(node);
  const prefixLen = displayLength(prefix);
  const contentWidth = Math.max(1, width - prefixLen);
  const { lines } = constrainText(renderRich(node.title), contentWidth, 3);

  return (
    <Box>
      <Text>{prefix}</Text>
      <Box width={contentWidth}>
        {lines.map((line, i) => <Text key={i}>{line}</Text>)}
      </Box>
    </Box>
  );
}

// Caller must calculate and pass width
<TreeNode node={node} width={columnWidth - 2} isSelected={sel} />
```

**After (with constraint system):**

```typescript
function TreeNode({ node, isSelected }: Props) {
  return (
    <FlexRow>
      <FlexItem width="auto"><Prefix node={node} /></FlexItem>
      <FlexItem flex={1}>
        <TruncatedText maxLines={3}>
          {renderRich(node.title)}
        </TruncatedText>
      </FlexItem>
    </FlexRow>
  );
}

// No width prop needed - constraints flow automatically
<TreeNode node={node} isSelected={sel} />
```

### Implementation Phases

| Phase | Components                           | Effort | Benefit                                    |
| ----- | ------------------------------------ | ------ | ------------------------------------------ |
| 1     | TruncatedText, useComputedDimensions | 1 day  | Remove displayLength calls from components |
| 2     | FlexRow, FlexItem                    | 2 days | Automatic horizontal space distribution    |
| 3     | ScrollableList                       | 2 days | Reusable scroll logic                      |
| 4     | ConstraintBox (full Cassowary)       | 3 days | Full constraint solving                    |

**Total: 5-8 days** (matches existing estimate in km-tui1 epic)

---

## Part 5: Recommendations

### Short Term (Recommended)

1. **Implement Constraint Components** (Phase 1-3 above)
   - TruncatedText, FlexRow, ScrollableList
   - No external dependencies (no kiwi.js yet)
   - Solves 80% of pain with 20% of effort
   - Already planned in km-tui1.11-17

### Medium Term (Optional)

2. **Add Cassowary solver** (Phase 4)
   - Use kiwi.js for complex constraints
   - Enables min/max/percentage constraints
   - Worth it if layouts become more complex

### Long Term (Evaluate)

3. **Monitor alternatives**
   - OpenTUI: Watch for bug fixes (color rendering, text issues)
   - iocraft: If Rust rewrite becomes viable
   - Textual: If Python rewrite becomes viable

### Not Recommended

- **Fork Ink**: High maintenance burden, low benefit
- **Rewrite in Rust/Python**: Project is TypeScript, team knows TypeScript
- **Wait for Ink fix**: No roadmap, issue #5 open since 2016

---

## Sources

### Ink

- [Ink GitHub](https://github.com/vadimdemedes/ink)
- [Issue #5 - Terminal space](https://github.com/vadimdemedes/ink/issues/5)
- [Issue #78 - Full screen layouts](https://github.com/vadimdemedes/ink/issues/78)
- [Issue #168 - Get width of Box](https://github.com/vadimdemedes/ink/issues/168)
- [PR #307 - measureElement](https://github.com/vadimdemedes/ink/pull/307)
- [Ink 3 Release](https://vadimdemedes.com/posts/ink-3)

### Alternatives

- [Ratatui Layout](https://ratatui.rs/concepts/layout/)
- [Ratatui Constraint API](https://docs.rs/ratatui/latest/ratatui/layout/enum.Constraint.html)
- [Textual Layout Guide](https://textual.textualize.io/guide/layout/)
- [Bubble Tea](https://github.com/charmbracelet/bubbletea)
- [BubbleLayout](https://github.com/winder/bubblelayout)
- [iocraft](https://github.com/ccbrown/iocraft)
- [OpenTUI Issues](https://github.com/sst/opentui/issues)
- [blessed](https://github.com/chjj/blessed)

### Constraint Solvers

- [kiwi.js](https://github.com/IjzerenHein/kiwi.js)
- [cassowary.js](https://github.com/slightlyoff/cassowary.js)
- [Cassowary Wikipedia](<https://en.wikipedia.org/wiki/Cassowary_(software)>)

### Comparisons

- [7 TUI Libraries - LogRocket](https://blog.logrocket.com/7-tui-libraries-interactive-terminal-apps/)
- [awesome-tuis](https://github.com/rothgar/awesome-tuis)
- [Hacker News Discussion](https://news.ycombinator.com/item?id=42016639)
