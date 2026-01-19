# InkZ: Next-Generation Terminal UI Renderer

## Executive Summary

Ink's single-pass rendering architecture prevents components from knowing their computed size, forcing pervasive width-prop threading in every application. This document designs **InkZ** - a terminal UI renderer that maintains Ink/Chalk API compatibility while solving the layout feedback problem through a two-phase render architecture.

**Key insight**: The fix isn't complex algorithms - it's exposing what Yoga already computes back to React components.

---

## 1. Problem Statement

### The Bug That Isn't a Bug

Ink Issue [#5](https://github.com/vadimdemedes/ink/issues/5) (opened 2016, still open):

> "Is there a way to know the width/height of a Box?"

This isn't a missing feature - it's a **fundamental architecture limitation**. Ink's render flow:

```
React render() → Build Yoga tree → Yoga computes layout → Write to terminal
                                         ↓
                              (dimensions computed here)
                                         ↓
                              (but never exposed to React)
```

### Concrete Impact on km

Our TUI has **147 lines** of constraint-threading code:

- `ConstraintContext` (30 lines)
- `useConstraint` hook usage (50+ instances)
- Manual `width` prop passing (100+ occurrences)

With proper layout feedback, this reduces to **zero**.

### Why Ink Cannot Fix This

Ink's `render` function is synchronous:

```typescript
// ink/src/render.ts (simplified)
function render(element) {
  const yogaNode = buildYogaTree(element);
  yogaNode.calculateLayout(); // Dimensions computed here
  const output = renderToString(element); // But element already rendered!
  stdout.write(output);
}
```

The element renders _before_ layout is computed. Fixing this requires:

1. Render to collect constraints (not content)
2. Compute layout
3. Re-render with dimensions

This is a breaking API change. Ink's maintainer has shown no interest in major architecture changes.

---

## 2. Design Goals

### Must Have

1. **Ink API compatibility** - `<Box>`, `<Text>`, `render()`, `useInput()` work unchanged
2. **Chalk compatibility** - ANSI strings from Chalk just work
3. **Layout feedback** - Components can access their computed dimensions
4. **Auto-truncation** - Text truncates to available width by default

### Should Have

5. **Native scrolling** - `<Scroll>` component with overflow handling
6. **Content-aware sizing** - `width="fit-content"` for shrink-to-fit
7. **Better performance** - Incremental layout, smarter diffing

### Nice to Have

8. **Modern terminal features** - OSC 8 links, true color detection
9. **Mouse support** - Click handlers, hover states
10. **Image protocols** - Sixel, Kitty graphics

---

## 3. Architecture

### High-Level Flow (5 Phases)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 0: RECONCILIATION                                             │
│                                                                      │
│  React reconciliation builds component tree                          │
│  Components register content callbacks (not rendered content)        │
│                                                                      │
│  Output: Tree of InkZNodes with Yoga nodes + callbacks               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 1: MEASURE (for fit-content nodes)                            │
│                                                                      │
│  Traverse nodes with width="fit-content"                             │
│  Call measureContent() to get intrinsic size                         │
│  Set Yoga constraints based on measurement                           │
│                                                                      │
│  Output: Yoga tree with all constraints set                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 2: LAYOUT                                                     │
│                                                                      │
│  yoga.calculateLayout(rootWidth, rootHeight)                         │
│  Propagate computed dimensions to all nodes                          │
│  Notify useLayout() subscribers (triggers selective re-render)       │
│                                                                      │
│  Output: All nodes have computed { x, y, width, height }             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 3: CONTENT RENDER                                             │
│                                                                      │
│  For each node with contentCallback:                                 │
│    - Provide computed dimensions via LayoutContext                   │
│    - Execute callback to produce terminal content                    │
│  Handle text truncation, scrolling, styling                          │
│                                                                      │
│  Output: Character buffer (2D array of styled cells)                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 4: DIFF & OUTPUT                                              │
│                                                                      │
│  Compare buffer against previous frame                               │
│  Emit minimal ANSI sequences for changed cells                       │
│  Optimize cursor movement                                            │
│                                                                      │
│  Output: Terminal escape sequences                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Insight: Deferred Content Rendering

Unlike Ink (which renders content during React reconciliation), InkZ separates:

- **Structure** (React reconciliation) - builds the layout tree
- **Content** (Phase 3) - renders text/graphics with known dimensions

This is why `useLayout()` works - dimensions are available BEFORE content renders.

### Key Innovation: Split Render

Components have two render modes:

```typescript
interface LayoutSpec {
  // Constraints (Phase 1)
  width?: number | string | "auto" | "fit-content";
  height?: number | string | "auto" | "fit-content";
  flex?: number;
  flexDirection?: "row" | "column";
  // ... other flexbox props

  // Content renderer (Phase 3)
  render: (computed: ComputedLayout) => TerminalContent;
}

interface ComputedLayout {
  width: number;
  height: number;
  x: number; // Position relative to parent
  y: number;
}
```

### Implementation: Custom React Renderer

```typescript
import Reconciler from 'react-reconciler';

interface InkZNode {
  type: string;
  props: Record<string, unknown>;
  children: InkZNode[];
  yogaNode: yoga.Node;
  computedLayout?: ComputedLayout;
}

const hostConfig: HostConfig<...> = {
  createInstance(type, props): InkZNode {
    const yogaNode = yoga.Node.create();
    applyFlexboxProps(yogaNode, props);
    return { type, props, children: [], yogaNode };
  },

  appendChild(parent, child) {
    parent.children.push(child);
    parent.yogaNode.insertChild(child.yogaNode, parent.children.length - 1);
  },

  prepareForCommit(rootNode) {
    // Phase 2: Compute layout for entire tree
    rootNode.yogaNode.calculateLayout();
    propagateComputedLayout(rootNode);
  },

  commitMount(node) {
    // Phase 3: Now node.computedLayout is available
    // Render content into character buffer
  },
};

function propagateComputedLayout(node: InkZNode, parentX = 0, parentY = 0) {
  const layout = node.yogaNode.getComputedLayout();
  node.computedLayout = {
    width: layout.width,
    height: layout.height,
    x: parentX + layout.left,
    y: parentY + layout.top,
  };
  for (const child of node.children) {
    propagateComputedLayout(child, node.computedLayout.x, node.computedLayout.y);
  }
}
```

### The useLayout Hook

**Important**: `useLayout()` works differently than you might expect:

1. On **first render** (before layout): returns `{ width: 0, height: 0, x: 0, y: 0 }`
2. After **layout completes**: automatically triggers re-render with actual dimensions
3. On **subsequent renders**: returns cached dimensions (no re-render unless dimensions change)

```typescript
const LayoutContext = createContext<ComputedLayout | null>(null);

function useLayout(): ComputedLayout {
  const node = useInkZNode();
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // Subscribe to layout completion
  useLayoutEffect(() => {
    const unsubscribe = node.onLayoutComplete(() => {
      // Only re-render if dimensions actually changed
      if (dimensionsChanged(node.prevLayout, node.computedLayout)) {
        forceUpdate();
      }
    });
    return unsubscribe;
  }, [node]);

  // Return current dimensions (may be zeros on first render)
  return node.computedLayout ?? { width: 0, height: 0, x: 0, y: 0 };
}

// Usage - component handles the initial zero state gracefully
function Header() {
  const { width } = useLayout();
  // On first render, width=0, so this renders empty string
  // After layout, re-renders with actual width
  return <Text>{'='.repeat(width)}</Text>;
}
```

This is the key difference from Ink's `measureElement()`:

- Ink: You call `measureElement()`, get dimensions, manually trigger re-render
- InkZ: `useLayout()` automatically re-renders when dimensions are ready

---

## 4. API Surface

### Fully Compatible (unchanged from Ink)

```typescript
// Components
<Box flexDirection="row" padding={1} borderStyle="single">
<Text color="green" bold>
<Newline />
<Spacer />

// Render
render(<App />);
render(<App />, { stdout, stdin });

// Hooks
useInput((input, key) => { ... });
useStdout();
useStdin();
useApp();  // { exit }
useFocus();
useFocusManager();
```

### Enhanced (backwards compatible additions)

```typescript
// Box gains onLayout callback (optional)
<Box onLayout={({ width, height }) => console.log(width, height)}>

// Text auto-truncates (opt out with wrap={false})
<Text>This long text truncates automatically...</Text>
<Text wrap={false}>This overflows if too long</Text>

// New width values
<Box width="fit-content">  // Shrink to content
<Box width="50%">          // Already supported
<Box width={30}>           // Already supported
```

### New Components

```typescript
// Scroll container
<Scroll height={10} scrollbar={true}>
  {items.map(item => <Row key={item.id} item={item} />)}
</Scroll>

// Virtual list (for very long lists)
<VirtualList
  items={thousandsOfItems}
  itemHeight={1}
  renderItem={(item, index) => <Row item={item} />}
/>

// Auto-sizing table
<Table
  columns={[
    { header: 'Name', key: 'name' },
    { header: 'Value', key: 'value', width: 20 },
  ]}
  data={rows}
/>
```

### New Hooks

```typescript
// The key addition
const { width, height, x, y } = useLayout();

// Terminal capabilities
const caps = useTerminalCapabilities();
// { trueColor: boolean, unicode: boolean, sixel: boolean, ... }

// Derived from useLayout
const { width } = useWidth(); // Just the width
const { height } = useHeight(); // Just the height
```

---

## 5. Chalk Compatibility

Chalk produces ANSI-escaped strings. Our renderer must:

1. **Preserve ANSI in text measurement** - Use `string-width` or similar
2. **Preserve ANSI in truncation** - Use `slice-ansi` for safe cutting
3. **Stack styles correctly** - Multiple nested `<Text>` with different styles

```typescript
import chalk from 'chalk';

// This must work exactly as in Ink
<Text>
  {chalk.red('Red ')}
  {chalk.blue.bold('Blue Bold')}
</Text>

// Truncation preserves styles
<Text>{chalk.red('This is a very long red text that will truncate...')}</Text>
// Output: "\x1b[31mThis is a very long red text that...\x1b[0m"
//         (ANSI codes preserved, text truncated)
```

---

## 6. Terminal Output Layer

### Cell-Based Buffer

```typescript
interface Cell {
  char: string; // Single grapheme
  fg: Color | null; // Foreground color
  bg: Color | null; // Background color
  attrs: Set<Attr>; // bold, italic, underline, etc.
}

type TerminalBuffer = Cell[][]; // [y][x]

function diff(prev: TerminalBuffer, next: TerminalBuffer): string {
  let output = "";
  for (let y = 0; y < next.length; y++) {
    for (let x = 0; x < next[y].length; x++) {
      if (!cellEqual(prev[y]?.[x], next[y][x])) {
        output += moveCursor(x, y);
        output += renderCell(next[y][x]);
      }
    }
  }
  return output;
}
```

### Cursor Optimization

Naive diffing emits `\x1b[{y};{x}H` for every changed cell. Optimize:

```typescript
function optimizeCursorMoves(changes: CellChange[]): string {
  // Sort by position
  changes.sort((a, b) => a.y - b.y || a.x - b.x);

  let output = "";
  let cursorX = 0,
    cursorY = 0;

  for (const { x, y, cell } of changes) {
    if (y === cursorY && x === cursorX) {
      // Already at position, just write
    } else if (y === cursorY && x === cursorX + 1) {
      // Adjacent, no move needed (cursor advances after write)
    } else if (y === cursorY + 1 && x === 0) {
      output += "\n"; // Newline cheaper than absolute move
    } else {
      output += moveCursor(x, y);
    }
    output += renderCell(cell);
    cursorX = x + 1;
    cursorY = y;
  }

  return output;
}
```

### Unicode Handling

Terminal cells have complex Unicode requirements:

```typescript
interface Cell {
  char: string;          // Single grapheme cluster
  fg: Color | null;
  bg: Color | null;
  attrs: Set<Attr>;
  wide: boolean;         // Is this a wide character (CJK)?
  continuation: boolean; // Is this the 2nd cell of a wide char?
}

// Use graphemer for proper Unicode segmentation
import Graphemer from 'graphemer';
const splitter = new Graphemer();

function textToCells(text: string): Cell[] {
  const graphemes = splitter.splitGraphemes(text);
  const cells: Cell[] = [];

  for (const grapheme of graphemes) {
    const width = getCharWidth(grapheme); // 1 or 2
    cells.push({ char: grapheme, wide: width === 2, continuation: false, ... });
    if (width === 2) {
      cells.push({ char: '', wide: false, continuation: true, ... });
    }
  }
  return cells;
}
```

### Performance Optimizations

**Dirty Tracking**: Not every state change needs full re-layout.

```typescript
interface InkZNode {
  layoutDirty: boolean; // Structure changed, needs re-layout
  contentDirty: boolean; // Content changed, layout unchanged
}

// On state change:
// - If only content changed: skip Phases 0-2, go straight to Phase 3
// - If layout changed: full pipeline
```

**Frame Coalescing**: Batch rapid updates.

```typescript
class RenderScheduler {
  private pending = false;

  scheduleRender() {
    if (this.pending) return;
    this.pending = true;

    // Use setImmediate to batch synchronous state changes
    setImmediate(() => {
      this.pending = false;
      this.executeRender();
    });
  }
}
```

**Layout Caching**: Reuse Yoga tree structure.

```typescript
// Don't recreate Yoga nodes on every render
// Only update changed props and recalculate
function updateYogaNode(node: InkZNode, prevProps: Props, nextProps: Props) {
  if (prevProps.width !== nextProps.width) {
    node.yogaNode.setWidth(nextProps.width);
    node.layoutDirty = true;
  }
  // ... only update what changed
}
```

---

## 7. Implementation Plan

### Phase 0: Test Infrastructure (Week 0)

- [ ] Set up test harness with Bun test
- [ ] Clone Ink test suite (31 files) and adapt imports
- [ ] Clone Chalk test suite (6 files) and adapt imports
- [ ] Create `inkz-testing-library` with ink-testing-library compatible API
- [ ] Set up visual snapshot infrastructure
- [ ] Set up performance benchmark suite (mitata)
- [ ] Create compatibility tracking dashboard
- [ ] Triage Ink tests into Tier 1/2/3/4 (see testing doc)

**Entry criteria**: Can run Ink's tests (all failing is expected)
**Exit criteria**: Test infrastructure runs, compatibility status visible, triage complete

### Week 1 Demo (Milestone)

**Goal**: A developer can run this and see InkZ working:

```bash
# Clone the demo
git clone https://github.com/example/inkz-demo
cd inkz-demo
bun install
bun run dev

# See a TUI that:
# 1. Uses <Box> and <Text> (basic layout works)
# 2. Uses useLayout() to get dimensions
# 3. Shows text that auto-truncates
```

**Demo app code**:

```typescript
// demo/index.tsx
import { render, Box, Text, useLayout } from 'inkz';

function App() {
  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Header />
      <Content />
    </Box>
  );
}

function Header() {
  const { width } = useLayout();
  return (
    <Box>
      <Text color="cyan" bold>InkZ Demo</Text>
      <Text dimColor> - Width: {width}px</Text>
    </Box>
  );
}

function Content() {
  const { width, height } = useLayout();
  return (
    <Box flexDirection="column">
      <Text>This box is {width}×{height}</Text>
      <Text>This very long text will automatically truncate when it exceeds the available width...</Text>
    </Box>
  );
}

render(<App />);
```

**Success criteria**:

- `useLayout()` returns correct dimensions (not zeros after first render)
- Text truncates without manual width threading
- Works in at least 3 terminals (iTerm, VS Code, xterm)

### Phase 1: Foundation (1 week)

- [ ] Custom React renderer skeleton
- [ ] Yoga integration with constraint extraction
- [ ] Basic `<Box>` with flexbox subset
- [ ] Basic `<Text>` without auto-truncation
- [ ] Simple output (no diffing)
- [ ] **Target**: flex.test.tsx, flex-direction.test.tsx passing

### Phase 2: Layout Feedback (1 week)

- [ ] Two-phase render (measure → layout → render)
- [ ] `useLayout()` hook
- [ ] `onLayout` callback for `<Box>`
- [ ] Auto-truncating `<Text>`
- [ ] **Target**: width-height.test.tsx, measure-element.test.tsx passing

### Phase 3: Compatibility (1 week)

- [ ] Remaining Ink components (`<Spacer>`, `<Newline>`, `<Static>`)
- [ ] `useInput()` hook
- [ ] Full Ink test suite passing (80%+ of Tier 1+2 = 144 tests)
- [ ] Chalk integration tests (100% of 6 files)
- [ ] Write migration guide (see [km-inkz.6-migration.md](.beads/km-inkz.6-migration.md))
- [ ] Document known incompatibilities
- [ ] **Target**: Compatibility dashboard shows 80%+ of Tier 1+2

### Phase 4: Polish (1 week)

- [ ] Cell-based diffing
- [ ] Cursor optimization
- [ ] `<Scroll>` component
- [ ] Performance benchmarks pass (no regression vs Ink)
- [ ] Cross-terminal visual tests pass

### Phase 5: km Integration (1 week)

- [ ] Replace km-ink with inkz
- [ ] Remove `ConstraintContext` and width threading
- [ ] Visual regression tests pass
- [ ] Performance parity or better

**Total: 5 weeks** (could be compressed with focus)

See **[km-inkz.4-testing.md](.beads/km-inkz.4-testing.md)** for detailed testing strategy.

---

## 8. Proof of Concept

Before committing to full implementation, validate with minimal PoC:

```typescript
// poc.tsx - Prove the architecture works
import { createRenderer } from './renderer';
import { Box, Text, useLayout } from './components';

function App() {
  return (
    <Box flexDirection="column" width="100%">
      <Header />
      <Content />
    </Box>
  );
}

function Header() {
  const { width } = useLayout();  // THIS IS THE TEST
  return <Text>{'='.repeat(width)}</Text>;
}

function Content() {
  const { width, height } = useLayout();
  return <Text>{`Content area: ${width}x${height}`}</Text>;
}

createRenderer().render(<App />);
```

**Success criteria**: `useLayout()` returns correct dimensions without manual prop threading.

---

## 9. Compatibility Tiers

Explicit expectations for what works and what doesn't:

### Tier 1 - Must Work (blocks MVP)

- `<Box>` with all flexbox props (direction, justify, align, wrap, grow, shrink)
- `<Text>` with color, backgroundColor, bold, italic, underline, strikethrough
- `render()` with stdout/stdin options
- `useInput()` for keyboard handling
- `useApp()` for exit control
- Chalk integration (ANSI strings preserved)

### Tier 2 - Should Work (blocks 1.0)

- `<Spacer>`, `<Newline>`
- `<Static>` for persistent output above dynamic content
- `useFocus()`, `useFocusManager()`
- Border styles (single, double, round, etc.)
- `measureElement()` for backward compatibility

### Tier 3 - Nice to Have (post 1.0)

- `<Transform>` for output transformation
- Screen reader support
- Full focus traversal parity with Ink

### Tier 4 - Explicitly Not Supported

- Ink's internal/private APIs
- Undocumented Ink behaviors
- Bug-compatibility (if Ink has bugs apps rely on)

---

## 10. Risk Analysis

| Risk                                    | Likelihood | Impact | Mitigation                                                    |
| --------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| Yoga doesn't expose what we need        | Low        | High   | Yoga API is sufficient; verified in research                  |
| React reconciler complexity             | Medium     | Medium | Start with Ink's reconciler as reference                      |
| Performance regression from multi-phase | Medium     | Medium | Benchmark early; layout is fast, render is the slow part      |
| Two-phase render causes visual flicker  | Medium     | High   | First render shows zeros gracefully; add loading states       |
| Edge cases in Ink compatibility         | High       | Low    | Comprehensive test suite; accept minor documented differences |
| Scope creep (images, mouse, etc.)       | High       | Medium | Strict phase gates; v1 = layout feedback only                 |
| Yoga WASM bundle too large              | Low        | Medium | yoga-wasm-web is ~200KB; can lazy-load if needed              |
| React 19 breaks reconciler              | Medium     | High   | Pin to React 18; add React version integration tests          |
| Memory leaks from callbacks             | Medium     | Medium | Use WeakMap; test with long-running apps                      |
| Unicode edge cases                      | High       | Low    | Use graphemer; comprehensive Unicode test fixtures            |

---

## 11. Alternatives Considered

### A. Patch Ink Directly

Fork Ink and modify the reconciler. Rejected because:

- Ink's codebase is tightly coupled
- Would need to maintain fork indefinitely
- Architecture change is invasive

### B. Build on Terminal-Kit

Terminal-kit provides low-level primitives. Rejected because:

- No React - would need to build component model
- Different paradigm (imperative vs declarative)

### C. Port Textual to JavaScript

Textual (Python) has the right architecture. Rejected because:

- Significant porting effort
- Different language idioms
- Would lose Ink ecosystem compatibility

### D. Use Taffy (Rust) via WASM

Taffy is a better flexbox than Yoga. Considered but deferred:

- Additional complexity (WASM bundling)
- Yoga is sufficient for MVP
- Can switch layout engine later if needed

---

## 12. Open Questions

1. **Naming**: "InkZ" is a placeholder. Options: ink-next, termink, rink (taken), terminus
2. **Monorepo or separate packages**: `inkz` vs `@inkz/core`, `@inkz/testing`, etc.
3. **Ink version compatibility**: Target Ink 3.x API? Include Ink 4.x features?
4. **License**: MIT (like Ink)? Something else?

---

## 13. Conclusion

InkZ is feasible and would eliminate the biggest pain point in Ink development. The core innovation - exposing Yoga's computed layout to React components - is straightforward to implement. The challenge is maintaining API compatibility while making this architectural change.

**Recommendation**: Build the PoC (1 week). If `useLayout()` works as designed, proceed with full implementation. If unforeseen blockers emerge, document and re-evaluate.

---

## Appendix: References

- [Ink source code](https://github.com/vadimdemedes/ink) - Current implementation
- [react-reconciler docs](https://github.com/facebook/react/tree/main/packages/react-reconciler) - Custom renderer API
- [Yoga layout](https://yogalayout.dev/) - Flexbox implementation
- [Taffy](https://github.com/DioxusLabs/taffy) - Alternative layout engine
- [Textual](https://textual.textualize.io/) - Python TUI with proper layout
- [7 Things Building a TUI Framework](https://www.textualize.io/blog/7-things-ive-learned-building-a-modern-tui-framework/) - Lessons from Textual
