# Ink 2.0: Next-Generation TUI Renderer - Iteration 1

## Executive Summary

Ink has a fundamental architectural limitation: **children never learn their allocated size**. This document explores whether to fix Ink upstream or create a compatible replacement.

---

## 1. The Core Problem

Ink uses Yoga (Facebook's flexbox implementation) for layout, but **doesn't expose computed dimensions to React components**. This creates cascading issues:

```
Parent renders → Yoga computes layout → Children render (but don't know their size)
```

### Symptoms

1. **Manual width threading**: Every component needs `width` prop passed down
2. **No content-aware sizing**: Can't say "make this column as wide as its content"
3. **Text truncation is manual**: Components must calculate and truncate themselves
4. **No nested flex**: Inner flex containers can't negotiate with outer ones

### Why Ink Can't Fix This Easily

The fix requires a **two-pass render**:

1. First pass: Components declare size preferences
2. Layout engine resolves constraints
3. Second pass: Components render with final dimensions

Ink's architecture assumes single-pass rendering. Changing this would:

- Break the existing API
- Require new lifecycle hooks
- Potentially hurt performance

---

## 2. Fix vs Replace Analysis

### Option A: Contribute to Ink Upstream

**Pros:**

- Existing ecosystem, community, maintenance
- No migration for users

**Cons:**

- Fundamental architecture change required
- Maintainer may reject breaking changes
- Ink's last major release was 2021; slower development pace

**Verdict:** Unlikely to succeed without forking.

### Option B: Create New Package

**Pros:**

- Clean slate architecture
- Can target modern terminals (sixel, kitty graphics, OSC 8 links)
- Opportunity to fix multiple issues at once

**Cons:**

- New maintenance burden
- Community fragmentation
- Need to reimplement ecosystem (ink-testing-library, etc.)

**Verdict:** Higher effort, but higher potential payoff.

### Option C: Fork Ink

**Pros:**

- Start with working codebase
- Can be API-compatible for simple cases

**Cons:**

- Inherit technical debt
- Yoga integration is deep; hard to change layout system

**Verdict:** Middle ground, but may be worst of both worlds.

---

## 3. Technical Approach

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React Components (<Box>, <Text>, custom)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Virtual Terminal Tree (measure + layout)                    │
│  - Nodes declare size constraints                           │
│  - Two-pass layout resolution                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Diff Engine (minimize terminal writes)                      │
│  - Cell-level diffing                                       │
│  - Cursor optimization                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Terminal Output (ANSI sequences)                            │
│  - Style stacking (Chalk-compatible)                        │
│  - Unicode width handling                                   │
└─────────────────────────────────────────────────────────────┘
```

### Layout Algorithm

Use a **constraint-based** approach inspired by Cassowary (used in macOS Auto Layout):

```typescript
interface SizeConstraint {
  min?: number
  preferred?: number
  max?: number
  flex?: number // Flex grow factor
}

interface LayoutNode {
  width: SizeConstraint
  height: SizeConstraint
  children: LayoutNode[]

  // Called after layout resolution
  onLayout(finalWidth: number, finalHeight: number): void
}
```

### Compatibility Layer

```typescript
// Ink-compatible API
import { Box, Text, render } from 'inkx';

// Works exactly like Ink
render(
  <Box flexDirection="column">
    <Text>Hello World</Text>
  </Box>
);

// New capability: size-aware components
function MyComponent() {
  const { width, height } = useLayout();  // NEW!
  return <Text>{`I am ${width}x${height}`}</Text>;
}
```

---

## 4. API Design

### What Stays the Same

- `<Box>` with flexbox props (flexDirection, justifyContent, etc.)
- `<Text>` for styled text output
- `render()` function signature
- `useInput()` for keyboard handling
- `useStdout()` for terminal access

### What Changes

- `<Box>` gains `onLayout` callback
- New `useLayout()` hook for accessing computed dimensions
- Text automatically truncates to available width (opt-out with `wrap={false}`)

### What's New

- `<Scroll>` - native scrolling container
- `<Table>` - auto-sizing columns
- `<Measure>` - measure content before render
- True color support detection
- Sixel/Kitty image protocol support

---

## 5. Risks

1. **Scope creep**: TUI frameworks are complex; easy to over-engineer
2. **Performance**: Two-pass rendering could be slower
3. **Yoga compatibility**: May need to reimplement flexbox
4. **Community adoption**: Hard to compete with established tools

---

## 6. Next Steps

1. Prototype the layout algorithm in isolation
2. Test with km's constraint components
3. Evaluate whether benefits justify the effort
