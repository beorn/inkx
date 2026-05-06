---
mentions:
  - beorn
  - km
id: "@km/inbox/t0yt"
aliases:
  - km-t0yt
  - "@km/_orphan/t0yt"
created_at: 2026-01-19T14:15:19Z
closed_at: 2026-01-19T14:41:22Z
---

# [x] Create @beorn/flexx - Pure JS flexbox layout engine @km/_orphan #feature #P2

## @beorn/flexx - Pure JavaScript Flexbox Layout Engine

## Motivation

Inkz currently depends on `yoga-wasm-web` (~200KB) for flexbox layout. This creates problems:

1. **Non-WASM environments** - Some deployment targets (older devices, restricted runtimes, edge functions) don't support WebAssembly
2. **Bundle size** - WASM adds ~200KB to the bundle
3. **Initialization overhead** - WASM requires async initialization
4. **Debuggability** - JavaScript is easier to step through than WASM

## Prior Art Analysis

### Existing Pure-JS Implementations

| Library          | Status           | LOC   | Features          | Limitations                                  |
| ---------------- | ---------------- | ----- | ----------------- | -------------------------------------------- |
| flexbox.js       | Abandoned (2020) | ~1500 | Core flexbox      | No wrap-reverse, order, flex-basis, baseline |
| typeflex         | Maintained       | ~8000 | Full Yoga port    | Large, matches Yoga's complexity             |
| css-layout       | Deprecated       | ~2000 | Subset of flexbox | Facebook deprecated in favor of Yoga         |
| Custom (tchayen) | Tutorial         | <600  | Core subset       | No wrap, grow/shrink                         |

### Key Insight from Prior Art

The tchayen tutorial demonstrates that **<600 LOC** can implement core flexbox for practical use. The complexity explosion comes from:

- `flexWrap` (especially wrap-reverse)
- `baseline` alignment
- RTL/writing modes
- Edge cases Yoga spent years fixing

## @km/tui Feature Audit

Actual flexbox features used in @km/tui (from codebase analysis):

### MUST HAVE (used extensively)

- `flexDirection`: row, column (65+ usages)
- `width`, `height`: explicit sizing (60+ usages)
- `flexGrow`: 1 (5 usages)
- `flexShrink`: 0 (5 usages)
- `padding`, `paddingX`, `paddingY` (25+ usages)
- `margin`, `marginLeft`, `marginTop`, `marginRight` (15+ usages)

### SHOULD HAVE (used moderately)

- `justifyContent`: flex-start, flex-end, center, space-between (3 usages)
- `alignItems`: center, flex-start (3 usages)
- `position`: absolute (3 usages - modals only)
- `gap` (3 usages)
- `minHeight` (1 usage)

### NOT USED in @km/tui

- `flexBasis`
- `flexWrap` (no wrapping layouts)
- `row-reverse`, `column-reverse`
- `minWidth`, `maxWidth`, `maxHeight`
- `alignSelf`, `alignContent`
- `baseline` alignment
- `display: none`

## Inkx Yoga API Surface (from reconciler.ts)

This is the EXACT API that flexx must implement for drop-in compatibility:

### Node Lifecycle

\`\`\`typescript
// Factory
Node.create(): LayoutNode

// Tree operations
node.insertChild(child: LayoutNode, index: number): void
node.removeChild(child: LayoutNode): void
node.free(): void  // CRITICAL: memory cleanup

// Text measurement (for intrinsic sizing)
node.setMeasureFunc(fn: MeasureFunc): void
type MeasureFunc = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode
) => { width: number; height: number };
\`\`\`

### Layout Calculation

\`\`\`typescript
node.calculateLayout(width: number, height: number, direction: Direction): void

// Results (only these 4 getters needed - verified from Inkx source)
node.getComputedLeft(): number
node.getComputedTop(): number
node.getComputedWidth(): number
node.getComputedHeight(): number
\`\`\`

### Size Setters

\`\`\`typescript
// Width
node.setWidth(value: number): void
node.setWidthPercent(value: number): void
node.setWidthAuto(): void

// Height  
node.setHeight(value: number): void
node.setHeightPercent(value: number): void
node.setHeightAuto(): void

// Min/Max
node.setMinWidth(value: number): void
node.setMinWidthPercent(value: number): void
node.setMinHeight(value: number): void
node.setMinHeightPercent(value: number): void
node.setMaxWidth(value: number): void
node.setMaxWidthPercent(value: number): void
node.setMaxHeight(value: number): void
node.setMaxHeightPercent(value: number): void
\`\`\`

### Flex Setters

\`\`\`typescript
node.setFlexGrow(value: number): void
node.setFlexShrink(value: number): void
node.setFlexBasis(value: number): void
node.setFlexBasisPercent(value: number): void
node.setFlexBasisAuto(): void
node.setFlexDirection(direction: FlexDirection): void
node.setFlexWrap(wrap: Wrap): void
\`\`\`

### Alignment Setters

\`\`\`typescript
node.setAlignItems(align: Align): void
node.setAlignSelf(align: Align): void
node.setAlignContent(align: Align): void
node.setJustifyContent(justify: Justify): void
\`\`\`

### Spacing Setters

\`\`\`typescript
node.setPadding(edge: Edge, value: number): void
node.setMargin(edge: Edge, value: number): void
node.setGap(gutter: Gutter, value: number): void
node.setBorder(edge: Edge, value: number): void  // For border width
\`\`\`

### Other Setters

\`\`\`typescript
node.setDisplay(display: Display): void
node.setPositionType(position: PositionType): void
node.setOverflow(overflow: Overflow): void
\`\`\`

### Required Constants

\`\`\`typescript
// Flex Direction
FLEX_DIRECTION_ROW, FLEX_DIRECTION_COLUMN,
FLEX_DIRECTION_ROW_REVERSE, FLEX_DIRECTION_COLUMN_REVERSE

// Wrap
WRAP_NO_WRAP, WRAP_WRAP, WRAP_WRAP_REVERSE

// Align
ALIGN_FLEX_START, ALIGN_FLEX_END, ALIGN_CENTER, 
ALIGN_STRETCH, ALIGN_BASELINE,
ALIGN_SPACE_BETWEEN, ALIGN_SPACE_AROUND

// Justify
JUSTIFY_FLEX_START, JUSTIFY_FLEX_END, JUSTIFY_CENTER,
JUSTIFY_SPACE_BETWEEN, JUSTIFY_SPACE_AROUND, JUSTIFY_SPACE_EVENLY

// Edge
EDGE_TOP, EDGE_BOTTOM, EDGE_LEFT, EDGE_RIGHT,
EDGE_ALL, EDGE_HORIZONTAL, EDGE_VERTICAL

// Gutter
GUTTER_ALL

// Display
DISPLAY_FLEX, DISPLAY_NONE

// Position
POSITION_TYPE_RELATIVE, POSITION_TYPE_ABSOLUTE

// Overflow
OVERFLOW_VISIBLE, OVERFLOW_HIDDEN

// Direction
DIRECTION_LTR

// Measure Mode (for measureFunc)
MEASURE_MODE_UNDEFINED, MEASURE_MODE_EXACTLY, MEASURE_MODE_AT_MOST
\`\`\`

### Yoga Default Values (MUST MATCH)

\`\`\`typescript
flexGrow: 0
flexShrink: 1
flexBasis: auto
flexDirection: column  // Note: CSS default is row, Yoga default is column!
flexWrap: nowrap
alignItems: stretch
alignSelf: auto
alignContent: flex-start
justifyContent: flex-start
position: relative
display: flex
overflow: visible
\`\`\`

## Implementation Tiers

### Tier 1: MVP for @km/tui (~800-1000 LOC)

**Node API:**

- `Node.create()`, `free()`
- `insertChild()`, `removeChild()`
- `calculateLayout(width, height, DIRECTION_LTR)`
- `getComputedLeft/Top/Width/Height()`
- `setMeasureFunc()` - CRITICAL for text nodes

**Sizing:**

- `setWidth()`, `setHeight()` (numbers)
- `setWidthPercent()`, `setHeightPercent()` - Inkx uses these
- `setWidthAuto()`, `setHeightAuto()`
- `setMinHeight()` (only min used in @km/tui)

**Flex:**

- `setFlexGrow()`, `setFlexShrink()`
- `setFlexDirection()` - row, column only

**Spacing:**

- `setPadding(edge, value)` with all EDGE_* constants
- `setMargin(edge, value)` with all EDGE_* constants
- `setGap(GUTTER_ALL, value)`
- `setBorder(edge, value)`

**Alignment:**

- `setAlignItems()` - flex-start, flex-end, center, stretch
- `setJustifyContent()` - flex-start, flex-end, center, space-between

**Other:**

- `setPositionType()` - relative, absolute
- `setOverflow()` - visible, hidden (pass-through, doesn't affect layout)

**Constants (Tier 1):**

- `FLEX_DIRECTION_ROW`, `FLEX_DIRECTION_COLUMN`
- `ALIGN_FLEX_START`, `ALIGN_FLEX_END`, `ALIGN_CENTER`, `ALIGN_STRETCH`
- `JUSTIFY_FLEX_START`, `JUSTIFY_FLEX_END`, `JUSTIFY_CENTER`, `JUSTIFY_SPACE_BETWEEN`
- `EDGE_*` (all), `GUTTER_ALL`
- `POSITION_TYPE_RELATIVE`, `POSITION_TYPE_ABSOLUTE`
- `OVERFLOW_VISIBLE`, `OVERFLOW_HIDDEN`
- `DIRECTION_LTR`
- `MEASURE_MODE_*` (all)

**Tier 1 Done When:**

1. @km/tui Board view renders identically to Yoga
2. @km/tui ColumnsView renders identically to Yoga
3. @km/tui ListView renders identically to Yoga
4. All absolute-positioned modals (HelpOverlay, ProjectPicker) work
5. Performance: <1ms for 100-node tree

### Tier 2: Extended (~1200-1600 LOC)

- `setMinWidth()`, `setMaxWidth()`, `setMaxHeight()` with percent variants
- `setFlexBasis()`, `setFlexBasisPercent()`, `setFlexBasisAuto()`
- `setAlignSelf()`
- `setDisplay()` - flex, none
- `DISPLAY_FLEX`, `DISPLAY_NONE`
- Negative margins
- `row-reverse`, `column-reverse`

### Tier 3: Full Compatibility (~2000+ LOC)

- `setFlexWrap()` (no wrap-reverse)
- `setAlignContent()`
- `space-around`, `space-evenly`
- `WRAP_NO_WRAP`, `WRAP_WRAP`

### Tier 4: Yoga Parity (Not Recommended)

- `baseline` alignment
- `wrap-reverse`
- RTL support (`DIRECTION_RTL`)
- All edge cases

## Algorithm

Three-pass layout:

1. **Measure Pass** (bottom-up): Call measureFunc for nodes that need intrinsic sizing
2. **Layout Pass** (top-down): Distribute available space using flex algorithm
3. **Position Pass** (top-down): Calculate absolute x,y positions

Core flexbox algorithm for main axis:

1. Sum fixed sizes + measured sizes, subtract from available space
2. Distribute remaining space proportionally by `flexGrow`
3. If overflow, shrink proportionally by `flexShrink`
4. Apply min/max constraints
5. Distribute remainder (integer rounding) one-by-one

### Dirty Flagging (Incremental Layout)

\`\`\`typescript
interface LayoutNode {
  isDirty(): boolean;       // Check if needs recalculation
  markDirty(): void;        // Mark subtree dirty
  hasNewLayout(): boolean;  // Layout computed this frame
}
\`\`\`

## Validation Examples

These concrete examples should produce IDENTICAL output to Yoga:

### Example 1: Simple Column

\`\`\`typescript
const root = Node.create();
root.setWidth(80);
root.setHeight(24);
root.setFlexDirection(FLEX_DIRECTION_COLUMN);

const header = Node.create();
header.setHeight(1);
root.insertChild(header, 0);

const content = Node.create();
content.setFlexGrow(1);
root.insertChild(content, 1);

const footer = Node.create();
footer.setHeight(1);
root.insertChild(footer, 2);

root.calculateLayout(80, 24, DIRECTION_LTR);

// Expected:
// header:  { x: 0, y: 0, width: 80, height: 1 }
// content: { x: 0, y: 1, width: 80, height: 22 }
// footer:  { x: 0, y: 23, width: 80, height: 1 }
\`\`\`

### Example 2: Row with Gap

\`\`\`typescript
const root = Node.create();
root.setWidth(80);
root.setFlexDirection(FLEX_DIRECTION_ROW);
root.setGap(GUTTER_ALL, 2);

const col1 = Node.create();
col1.setFlexGrow(1);
root.insertChild(col1, 0);

const col2 = Node.create();
col2.setFlexGrow(1);
root.insertChild(col2, 1);

const col3 = Node.create();
col3.setFlexGrow(1);
root.insertChild(col3, 2);

root.calculateLayout(80, 24, DIRECTION_LTR);

// Expected (80 - 4 gap = 76, /3 = 25.33, rounded):
// col1: { x: 0, y: 0, width: 25, height: 24 }
// col2: { x: 27, y: 0, width: 25, height: 24 }
// col3: { x: 54, y: 0, width: 26, height: 24 }
\`\`\`

### Example 3: Absolute Positioning (Modal)

\`\`\`typescript
const root = Node.create();
root.setWidth(80);
root.setHeight(24);

const modal = Node.create();
modal.setPositionType(POSITION_TYPE_ABSOLUTE);
modal.setWidth(40);
modal.setHeight(10);
modal.setMargin(EDGE_LEFT, 20);
modal.setMargin(EDGE_TOP, 7);
root.insertChild(modal, 0);

root.calculateLayout(80, 24, DIRECTION_LTR);

// Expected:
// modal: { x: 20, y: 7, width: 40, height: 10 }
\`\`\`

## Risks & Mitigations

| Risk                            | Impact | Mitigation                                        |
| ------------------------------- | ------ | ------------------------------------------------- |
| Edge cases differ from Yoga     | High   | Extensive Yoga comparison tests                   |
| Performance slower than WASM    | Medium | Benchmark early, optimize hot paths               |
| Floating-point rounding differs | High   | Use integer math like km's FlexRow                |
| measureFunc complexity          | Medium | Copy Yoga's measure mode semantics exactly        |
| Scope creep to Tier 2+          | Medium | Hard gate: Tier 1 must pass @km/tui before Tier 2 |

## Inkx Integration

### Adapter Pattern

\`\`\`typescript
// flexx/src/inkx-adapter.ts
import type { Yoga } from 'yoga-wasm-web';
import * as flexx from './index.js';

/**

* Create a Yoga-compatible interface using flexx.
* Drop-in replacement for yoga-wasm-web.
 */
export function createFlexxYoga(): Yoga {
  return {
    Node: flexx.Node,
    FLEX_DIRECTION_ROW: flexx.FLEX_DIRECTION_ROW,
    FLEX_DIRECTION_COLUMN: flexx.FLEX_DIRECTION_COLUMN,
    // ... all constants
  };
}
\`\`\`

### Usage in Inkx

\`\`\`typescript
// inkx/src/reconciler.ts (modified)
import type { Yoga } from 'yoga-wasm-web';

let yoga: Yoga | null = null;

export function setYoga(instance: Yoga): void {
  yoga = instance;
}

// In app initialization:
import { createFlexxYoga } from '@beorn/flexx/inkx';
setYoga(createFlexxYoga()); // Pure JS!
\`\`\`

## Project Structure

\`\`\`
vendor/beorn-flexx/
├── src/
│   ├── index.ts          # Public API exports
│   ├── node.ts           # Node class (Yoga-compatible API)
│   ├── layout.ts         # Layout algorithm (3-pass)
│   ├── constants.ts      # All Yoga-compatible constants
│   ├── types.ts          # TypeScript interfaces
│   └── inkx-adapter.ts   # Yoga interface wrapper
├── tests/
│   ├── node.test.ts      # Node API tests
│   ├── layout.test.ts    # Layout algorithm tests
│   ├── yoga-compat.test.ts # Side-by-side Yoga comparison
│   ├── examples.test.ts  # Validation examples from this doc
│   └── km-layouts.test.ts # km-tui specific layouts
├── benchmarks/
│   └── layout.bench.ts   # Performance benchmarks
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## Success Criteria

1. **Functional**: All @km/tui views render correctly with flexx
2. **Performance**: Layout calculation <1ms for typical @km/tui trees (~100 nodes)
3. **Size**: <20KB minified (vs ~200KB for yoga-wasm-web)
4. **API**: Drop-in replacement for Yoga in Inkx reconciler
5. **Tests**: 100% coverage of implemented features
6. **Compatibility**: Pass Yoga test suite for implemented features

## Design Decisions

| Decision              | Choice                | Rationale                         |
| --------------------- | --------------------- | --------------------------------- |
| API style             | Yoga-compatible       | Zero Inkx changes needed          |
| Constant names        | Match Yoga exactly    | Drop-in compatibility             |
| Default flexDirection | column (Yoga default) | Match Yoga, not CSS               |
| Percentages           | Tier 1                | Inkx already uses them            |
| Negative margins      | Tier 2                | @km/tui doesn't use them          |
| RTL support           | Never                 | Terminal TUIs are LTR             |
| Memory management     | Manual free()         | Match Yoga behavior               |
| Integer vs float      | Integer math          | Avoid rounding issues in terminal |

## Dependencies

- None (zero dependencies for core)
- Dev: vitest, typescript

## Testing Strategy

1. **Unit tests**: Each layout feature in isolation
2. **Yoga comparison tests**: Same input → compare output with Yoga
3. **Validation examples**: The 3 examples above as regression tests
4. **@km/tui integration tests**: Render actual @km/tui views, compare layout
5. **Performance benchmarks**: Ensure <1ms for typical trees

## References

- [How to Write a Flexbox Layout Engine](https://tchayen.com/how-to-write-a-flexbox-layout-engine) - Tutorial showing <600 LOC implementation
- [flexbox.js](https://github.com/Planning-nl/flexbox.js) - Pure JS implementation (abandoned)
- [typeflex](https://github.com/dead/typeflex) - Full Yoga port in TypeScript
- [Yoga documentation](https://www.yogalayout.dev/) - Reference implementation
- [CSS Flexbox Spec](https://www.w3.org/TR/css-flexbox-1/) - Authoritative spec
- [Inkx reconciler.ts](vendor/beorn-inkx/src/reconciler.ts) - Exact Yoga API usage

