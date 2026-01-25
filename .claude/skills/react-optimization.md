---
description: Optimize React/Ink component rendering performance
---

# Skill: React Rendering Optimization

When a user reports slow rendering or you identify performance issues in React components (especially TUI/Ink), follow this systematic approach.

## When to Use This Skill

- User reports "slow" or "laggy" UI interactions
- Cursor movement feels sluggish on large lists
- Profiling shows excessive re-renders
- Any TUI component with >50 items that updates frequently

## Diagnostic Phase

### 1. Identify the Hot Path

Find what triggers re-renders on every interaction:

```bash
# Add debug logging to understand render frequency
DEBUG=km:* DEBUG_LOG=/tmp/km.log bun km view /path/to/vault
```

Look for:

- State changes that cascade to many components
- Props that change reference on every render
- Context values that change frequently

### 2. Trace the Render Tree

Map the component hierarchy to understand what re-renders:

```
Parent (state change here)
├─ Child A (always re-renders?)
├─ Child B (always re-renders?)
│  └─ Grandchild (expensive calculations?)
└─ Child C (always re-renders?)
```

Ask: "When X changes, what MUST re-render vs what SHOULDN'T?"

## Optimization Patterns

### Pattern 1: Memoize Expensive Calculations

**Problem:** Pure functions run on every render even when inputs unchanged.

**Solution:** Use `useMemo` for expensive derived values.

```tsx
// BEFORE: Runs every render
const style = getNodeStyle(node, isSelected, depth)
const richContent = renderRich(content, options)

// AFTER: Only runs when dependencies change
const style = useMemo(
  () => getNodeStyle(node, isSelected, depth),
  [node.id, node.task_status, isSelected, depth],
)

const richContent = useMemo(
  () => renderRich(content, options),
  [content, options.excludeSigils, options.sigilColors],
)
```

**Key insight:** Dependency arrays should use primitive values or stable references, not objects that change reference on every render.

### Pattern 2: React.memo for Components

**Problem:** Child components re-render when parent re-renders, even if their props are identical.

**Solution:** Wrap components in `React.memo` with custom comparison.

```tsx
// BEFORE: Re-renders whenever parent re-renders
export function Card({ card, isSelected, width }) { ... }

// AFTER: Only re-renders when relevant props change
export const Card = React.memo(function Card({ card, isSelected, width }) {
  ...
}, (prev, next) => {
  // Return true if props are equal (should NOT re-render)
  return (
    prev.card.node.id === next.card.node.id &&
    prev.card.node.content === next.card.node.content &&
    prev.isSelected === next.isSelected &&
    prev.width === next.width
  );
});
```

**Custom comparison rules:**

- Compare primitive values directly
- For objects, compare the specific fields that affect rendering
- For arrays, compare length and key fields (e.g., `.id`)
- For callbacks, compare by reference (use `useCallback` to stabilize)

### Pattern 3: Stabilize Callback Props

**Problem:** Inline functions create new references every render, defeating memoization.

**Solution:** Use `useCallback` or module-level functions.

```tsx
// BEFORE: New function reference every render
<ChildList onSelect={(id) => handleSelect(id)} />

// AFTER: Stable reference
const handleSelectCallback = useCallback(
  (id) => handleSelect(id),
  [handleSelect]
);
<ChildList onSelect={handleSelectCallback} />

// BEST: Module-level function if no closure needed
function handleSelectItem(id) { ... }
<ChildList onSelect={handleSelectItem} />
```

### Pattern 4: Selective Context Consumption

**Problem:** All context consumers re-render when any part of context changes.

**Solution:** Split context or use selectors.

```tsx
// BEFORE: Re-renders when ANY state changes
const { selectedId, allItems, settings } = useAppContext()

// AFTER: Only re-renders when selection changes
const selectedId = useUISelector((state) => state.selectedId)
```

### Pattern 5: Virtualization for Long Lists

**Problem:** Rendering hundreds of items is always slow.

**Solution:** Only render visible items plus buffer.

```tsx
const VISIBLE_ITEMS = 50
const OVERSCAN = 5

function VirtualizedList({ items, selectedIndex }) {
  const { startIndex, endIndex } = useMemo(() => {
    const start = Math.max(0, selectedIndex - VISIBLE_ITEMS / 2 - OVERSCAN)
    const end = Math.min(items.length, start + VISIBLE_ITEMS + OVERSCAN * 2)
    return { startIndex: start, endIndex: end }
  }, [items.length, selectedIndex])

  return (
    <>
      {startIndex > 0 && <Placeholder height={startIndex * ITEM_HEIGHT} />}
      {items.slice(startIndex, endIndex).map((item) => (
        <Item key={item.id} />
      ))}
      {endIndex < items.length && (
        <Placeholder height={(items.length - endIndex) * ITEM_HEIGHT} />
      )}
    </>
  )
}
```

## Layered Optimization Strategy

Apply optimizations in this order:

### Layer 1: Memoize Leaf Calculations (Highest Impact)

- `useMemo` on expensive pure functions inside components
- Style calculations, text formatting, derived data

### Layer 2: Memoize Components (Medium Impact)

- `React.memo` on frequently-rendered components
- Custom comparison for complex props
- Start with leaf components, work up the tree

### Layer 3: Stabilize Props (Enables Layer 2)

- `useCallback` for event handlers passed as props
- `useMemo` for object/array props
- Module-level functions where possible

### Layer 4: Architectural Changes (Last Resort)

- Context splitting
- State colocation
- Virtualization

## Verification

### Before/After Metrics

Add temporary render counting:

```tsx
function Component(props) {
  const renderCount = useRef(0);
  renderCount.current++;
  console.log(`Component rendered ${renderCount.current} times`);
  ...
}
```

### Expected Results

For cursor movement in a 60-item list:

- **Before:** 60 component renders, 60 style calculations
- **After:** 2 component renders (old/new selection), 2 style calculations
- **Improvement:** ~30x reduction in render work

### Test Impact

```bash
bun run test:fast  # Must still pass
bun run test:all   # Final verification
```

## Common Mistakes

### 1. Incorrect Dependency Arrays

```tsx
// WRONG: node object changes reference every render
useMemo(() => processNode(node), [node])

// RIGHT: Use stable identifiers
useMemo(() => processNode(node), [node.id, node.content, node.status])
```

### 2. Memo Without Custom Comparison

```tsx
// INCOMPLETE: Shallow comparison may not be enough
const Item = React.memo(({ item }) => ...);

// BETTER: Explicit comparison of relevant fields
const Item = React.memo(({ item }) => ..., (prev, next) => {
  return prev.item.id === next.item.id && prev.item.name === next.item.name;
});
```

### 3. Premature Optimization

Don't optimize until you have evidence of a problem. Profile first:

- Is the component actually slow?
- How many items are being rendered?
- What's the actual impact on user experience?

## Files to Check in This Codebase

- `apps/km-tui/packages/km-ink/src/views/TreeNode.tsx` - Main tree node with memoization
- `apps/km-tui/packages/km-ink/src/views/CardColumn.tsx` - Card/Column with React.memo
- `apps/km-tui/packages/km-ink/src/views/ListView.tsx` - Stable callback pattern

## Reference: Bead km-8mp9

The original performance bug and solution design is documented in bead `km-8mp9`:

```bash
bd show km-8mp9
```
