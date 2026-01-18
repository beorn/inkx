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

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 1: MEASURE                                                    │
│                                                                      │
│  React reconciliation builds component tree                          │
│  Components return LayoutSpec (constraints, not content)             │
│                                                                      │
│  Output: Tree of LayoutSpec nodes                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 2: LAYOUT                                                     │
│                                                                      │
│  Yoga/Taffy computes layout from constraints                         │
│  Each node gets computed { x, y, width, height }                     │
│                                                                      │
│  Output: LayoutResult tree with computed dimensions                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 3: RENDER                                                     │
│                                                                      │
│  Components render content using computed dimensions                 │
│  Text truncation, scrolling offsets, etc.                            │
│                                                                      │
│  Output: Character buffer (2D array of styled cells)                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 4: DIFF & OUTPUT                                              │
│                                                                      │
│  Compare against previous frame                                      │
│  Emit minimal ANSI sequences for changed cells                       │
│                                                                      │
│  Output: Terminal escape sequences                                   │
└─────────────────────────────────────────────────────────────────────┘
```

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

```typescript
const LayoutContext = createContext<ComputedLayout | null>(null);

function useLayout(): ComputedLayout {
  const layout = useContext(LayoutContext);
  if (!layout) {
    throw new Error('useLayout must be used within a rendered component');
  }
  return layout;
}

// Provider wraps each component during Phase 3
function renderNode(node: InkZNode): TerminalContent {
  return (
    <LayoutContext.Provider value={node.computedLayout}>
      {node.props.children}
    </LayoutContext.Provider>
  );
}
```

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

---

## 7. Implementation Plan

### Phase 1: Foundation (1 week)

- [ ] Custom React renderer skeleton
- [ ] Yoga integration with constraint extraction
- [ ] Basic `<Box>` with flexbox subset
- [ ] Basic `<Text>` without auto-truncation
- [ ] Simple output (no diffing)

### Phase 2: Layout Feedback (1 week)

- [ ] Two-phase render (measure → layout → render)
- [ ] `useLayout()` hook
- [ ] `onLayout` callback for `<Box>`
- [ ] Auto-truncating `<Text>`

### Phase 3: Compatibility (1 week)

- [ ] Remaining Ink components (`<Spacer>`, `<Newline>`, `<Static>`)
- [ ] `useInput()` hook
- [ ] Full Ink test suite passing
- [ ] Chalk integration tests

### Phase 4: Polish (1 week)

- [ ] Cell-based diffing
- [ ] Cursor optimization
- [ ] `<Scroll>` component
- [ ] Performance benchmarks

### Phase 5: km Integration (1 week)

- [ ] Replace km-ink with inkz
- [ ] Remove `ConstraintContext` and width threading
- [ ] Visual regression tests pass
- [ ] Performance parity or better

**Total: 5 weeks** (could be compressed with focus)

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

## 9. Risk Analysis

| Risk                               | Likelihood | Impact | Mitigation                                                    |
| ---------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| Yoga doesn't expose what we need   | Low        | High   | Yoga API is sufficient; we just need to call it before render |
| React reconciler complexity        | Medium     | Medium | Start with ink's reconciler as reference                      |
| Performance regression from 2-pass | Medium     | Medium | Benchmark early; layout is fast, render is the slow part      |
| Edge cases in Ink compatibility    | High       | Low    | Comprehensive test suite; accept minor differences            |
| Scope creep (images, mouse, etc.)  | High       | Medium | Strict phase gates; v1 = layout feedback only                 |

---

## 10. Alternatives Considered

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

## 11. Open Questions

1. **Naming**: "InkZ" is a placeholder. Options: ink-next, termink, rink (taken), terminus
2. **Monorepo or separate packages**: `inkz` vs `@inkz/core`, `@inkz/testing`, etc.
3. **Ink version compatibility**: Target Ink 3.x API? Include Ink 4.x features?
4. **License**: MIT (like Ink)? Something else?

---

## 12. Conclusion

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
