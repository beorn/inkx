# Ink 2.0: Next-Generation TUI Renderer - Iteration 2

## Executive Summary

Ink's architecture prevents proper layout negotiation - components render without knowing their allocated size. This creates pervasive boilerplate in every Ink application. This document analyzes whether a new package could solve this while remaining Ink/Chalk compatible, and what the implementation would look like.

---

## 1. Root Cause Analysis: Why Ink Can't Be Fixed

### The Fundamental Issue

Ink maps React components to Yoga layout nodes, but the data flow is **one-way**:

```
React Component → Yoga Node → Terminal Output
       ↓              ↓
   (props)      (computed size)
                     ❌ not exposed back to React
```

Components can set `width="50%"` but can never ask "what width did I actually get?"

### Why This Matters

Without computed dimensions, components can't:

1. **Truncate text intelligently** - must guess or receive width as prop
2. **Implement virtual scrolling** - don't know visible area
3. **Do content-aware sizing** - "shrink to fit" is impossible
4. **Nest layouts** - inner containers can't adapt to outer constraints

### Why Ink Can't Fix This

**Attempt 1: Add `measureElement()`** (Ink 3.0)

- Only works _after_ render, causing flash/rerender
- Doesn't help during initial render

**Attempt 2: Context for dimensions**

- Would require parent to know child's computed size before child renders
- Chicken-and-egg: Yoga needs component tree to compute layout

**The Real Fix: Two-Phase Rendering**

```
Phase 1: Build component tree, collect size constraints
Phase 2: Yoga computes layout
Phase 3: Re-render with computed dimensions available
```

This breaks Ink's API contract - components would render twice with different available data. Not backwards compatible.

---

## 2. Landscape Analysis

### Existing Solutions

| Package              | Approach       | Layout Model          | React? | Active?     |
| -------------------- | -------------- | --------------------- | ------ | ----------- |
| **Ink**              | React + Yoga   | Flexbox (no feedback) | Yes    | Slow        |
| **blessed**          | Custom widgets | Absolute + relative   | No     | Abandoned   |
| **terminal-kit**     | Direct drawing | Manual                | No     | Active      |
| **Textual** (Python) | CSS-like       | Constraint solver     | No     | Very active |
| **Ratatui** (Rust)   | Immediate mode | Manual rects          | No     | Very active |

### Key Insight from Textual

Textual uses a **proper constraint solver** (not Yoga) and exposes dimensions to widgets. Their approach:

1. Widgets declare `min-width`, `max-width`, `width` (fixed/auto/percentage)
2. Constraint solver runs (similar to CSS)
3. Widgets receive final dimensions before rendering content

This is exactly what we need, but Textual isn't JavaScript/React.

### Key Insight from Ratatui

Ratatui uses **immediate mode** rendering - you get a `Rect` and draw into it:

```rust
fn render(&self, area: Rect, buf: &mut Buffer) {
    // area tells you exactly how much space you have
}
```

This is the opposite of React's retained mode, but the "know your size" principle is right.

---

## 3. Technical Design

### Architecture: Reconciled Layout

Combine React's component model with proper layout feedback:

```
┌─────────────────────────────────────────────────────────────┐
│  1. React Reconciliation                                     │
│     Build virtual component tree                             │
│     Components declare size constraints                      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Layout Resolution                                        │
│     Constraint solver (Yoga or custom)                       │
│     Computes final dimensions for all nodes                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Content Rendering                                        │
│     Components render with final dimensions                  │
│     Text truncation, scrolling, etc.                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Diff & Output                                            │
│     Cell-level diffing against previous frame                │
│     Minimal ANSI sequence output                             │
└─────────────────────────────────────────────────────────────┘
```

### The Key Innovation: Render Callbacks

Instead of rendering content directly, components return a **render function** that receives computed size:

```typescript
// Current Ink (broken for dynamic sizing)
function MyComponent({ width }: { width: number }) {
  return <Text>{truncate(text, width)}</Text>;
}

// New approach: deferred rendering
function MyComponent() {
  return (
    <Box
      width="100%"
      render={({ width, height }) => (
        <Text>{truncate(text, width)}</Text>
      )}
    />
  );
}

// Or with hooks (cleaner API)
function MyComponent() {
  const { width } = useLayout();  // Available after layout phase
  return <Text>{truncate(text, width)}</Text>;
}
```

### Implementation: Custom React Renderer

Use `react-reconciler` to build a custom renderer:

```typescript
import Reconciler from "react-reconciler"

const hostConfig = {
  createInstance(type, props) {
    // Create layout node with constraints from props
    return new LayoutNode(type, props)
  },

  finalizeInitialChildren(node) {
    // After tree is built, run layout solver
    // Then render content with computed dimensions
  },

  commitUpdate(node, updatePayload) {
    // On prop changes, mark layout dirty
    // Re-solve and re-render affected subtree
  },
}

const renderer = Reconciler(hostConfig)
```

### Layout Solver Options

1. **Keep Yoga**: Use Yoga for flexbox, add dimension exposure
   - Pro: Battle-tested, fast
   - Con: No content-aware sizing (Yoga doesn't support `fit-content`)

2. **Use Taffy** (Rust flexbox): WebAssembly binding
   - Pro: More features than Yoga, actively developed
   - Con: WASM bundle size, integration complexity

3. **Custom solver**: Implement subset of flexbox + constraints
   - Pro: Full control, can add content-aware sizing
   - Con: Significant implementation effort

**Recommendation**: Start with Yoga, add content measurement layer on top.

---

## 4. API Design

### Compatibility Goal

Existing Ink code should work with minimal changes:

```typescript
// This should Just Work™
import { Box, Text, render, useInput } from 'inkx';

function App() {
  useInput((input, key) => { /* same API */ });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="green">Hello</Text>
    </Box>
  );
}

render(<App />);
```

### New Capabilities

```typescript
// 1. useLayout hook - the main addition
function MyComponent() {
  const { width, height } = useLayout();
  // width/height are computed by layout solver
  return <Text>{`${width}x${height}`}</Text>;
}

// 2. Auto-truncating text (opt-out with wrap={false})
<Text>This very long text will automatically truncate...</Text>

// 3. Native scrolling
<Scroll height={10}>
  {items.map(item => <Item key={item.id} {...item} />)}
</Scroll>

// 4. Content-aware sizing
<Box width="fit-content">  {/* NEW: shrink to content */}
  <Text>Sized to this text</Text>
</Box>

// 5. Aspect ratio
<Box aspectRatio={16/9} width="50%">
  <Image src={...} />
</Box>
```

### Chalk Compatibility

Chalk produces ANSI strings. Full compatibility:

```typescript
import chalk from 'chalk';

<Text>{chalk.red.bold('Styled with Chalk')}</Text>  // Works
```

Our `<Text>` just needs to preserve ANSI codes when measuring/truncating (which we already do with `displayLength()`).

---

## 5. Migration Path

### Phase 1: Drop-in Replacement

```diff
- import { Box, Text, render } from 'ink';
+ import { Box, Text, render } from 'inkx';
```

Existing apps work unchanged. No new features yet.

### Phase 2: Opt-in Layout Hooks

```typescript
import { Box, Text, useLayout } from 'inkx';

function Card({ title }) {
  const { width } = useLayout();  // Now available!
  return <Text>{truncate(title, width)}</Text>;
}
```

### Phase 3: Enhanced Components

```typescript
import { Scroll, Table, FitBox } from 'inkx';

// Replace manual scroll implementations
<Scroll height={10}>...</Scroll>

// Replace manual table column sizing
<Table columns={['Name', 'Value']} data={rows} />
```

---

## 6. Proof of Concept Scope

Minimum viable to validate the approach:

1. **Custom React renderer** with layout phase
2. **`<Box>`** with basic flexbox (direction, justify, align, padding)
3. **`<Text>`** with auto-truncation
4. **`useLayout()`** hook
5. **Basic diffing** (doesn't need to be optimal)

**Estimate**: 2-3 weeks for PoC

### Success Criteria

Replace km-ink's `Board.tsx` with:

- No manual width props
- No `ConstraintContext`
- Equivalent visual output

---

## 7. Risk Analysis

| Risk                            | Likelihood | Impact | Mitigation                            |
| ------------------------------- | ---------- | ------ | ------------------------------------- |
| Performance regression          | Medium     | High   | Benchmark early, optimize hot paths   |
| API incompatibility edge cases  | High       | Medium | Comprehensive test suite against Ink  |
| Yoga limitations block features | Medium     | Medium | Custom solver as fallback             |
| Maintenance burden              | High       | Medium | Keep scope minimal, document well     |
| Community ignores it            | High       | Low    | Build for km first, open source later |

---

## 8. Open Questions

1. **Should we target Deno/Bun as well as Node?** (Yes - use web-compatible APIs)
2. **How to handle focus management?** (Ink's is basic; could improve)
3. **Should images be in scope?** (Sixel/Kitty protocols are complex)
4. **What about mouse support?** (Important for some apps, not for km)
