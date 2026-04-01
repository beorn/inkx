---
description: Optimize React/Ink component rendering performance
---

# TUI Performance Optimization

**Keywords**: slow, laggy, performance, render, useMemo, React.memo

When TUI feels slow or laggy, follow this systematic approach.

## When to Use

- User reports slow/laggy UI
- Cursor movement sluggish on large lists
- Any component with >50 items that updates frequently

## Diagnostic

### 1. Add Debug Logging

```bash
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path
```

### 2. Trace Render Tree

```
Parent (state change here)
├─ Child A (re-renders?)
├─ Child B (re-renders?)
└─ Child C (re-renders?)
```

Ask: "When X changes, what MUST re-render vs what SHOULDN'T?"

## Optimization Patterns

### Pattern 1: Memoize Calculations

```tsx
// BEFORE: Runs every render
const style = getNodeStyle(node, isSelected, depth)

// AFTER: Only when deps change
const style = useMemo(
  () => getNodeStyle(node, isSelected, depth),
  [node.id, node.item?.task?.status, isSelected, depth],
)
```

**Key:** Use primitive values in deps, not objects.

### Pattern 2: React.memo Components

```tsx
export const Card = React.memo(function Card({ card, isSelected }) {
  ...
}, (prev, next) => {
  return (
    prev.card.node.id === next.card.node.id &&
    prev.isSelected === next.isSelected
  )
})
```

### Pattern 3: Stabilize Callbacks

```tsx
// BEFORE: New function every render
<Child onSelect={(id) => handle(id)} />

// AFTER: Stable reference
const handleSelect = useCallback((id) => handle(id), [])
<Child onSelect={handleSelect} />
```

### Pattern 4: Virtualization

Only render visible items:

```tsx
const { start, end } = useMemo(() => {
  const s = Math.max(0, selectedIndex - 25)
  return { start: s, end: Math.min(items.length, s + 50) }
}, [items.length, selectedIndex])

{
  items.slice(start, end).map((item) => <Item key={item.id} />)
}
```

## Optimization Order

1. **Memoize leaf calculations** (highest impact)
2. **Memoize components** with React.memo
3. **Stabilize props** with useCallback/useMemo
4. **Architectural changes** (last resort)

## Verification

Add render counting:

```tsx
const renderCount = useRef(0)
renderCount.current++
console.log(`Rendered ${renderCount.current} times`)
```

**Expected:** Cursor move in 60-item list → 2 renders (old/new), not 60.

## Common Mistakes

```tsx
// WRONG: Object changes reference every render
useMemo(() => process(node), [node])

// RIGHT: Use stable fields
useMemo(() => process(node), [node.id, node.content])
```

## Files to Check

- `apps/km-tui/src/views/TreeNode.tsx` - Tree memoization
- `apps/km-tui/src/views/CardColumn.tsx` - Card React.memo
- `apps/km-tui/src/views/ListView.tsx` - Stable callbacks
