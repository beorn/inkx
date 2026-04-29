---
id: "@km/inkz/10-scroll"
aliases:
  - km-inkz.10-scroll
  - km-inkz-10-scroll
created_at: 2026-01-19T12:02:51Z
closed_at: 2026-01-19T14:46:26Z
---

# [x] InkZ: Implement overflow=scroll with automatic content virtualization @km/inkz #feature #P2

## Goal

Enable scrollable containers in InkZ with zero configuration - developers just render their content.

## API

```tsx
// This just works - no virtualization config, no height estimation
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Card key={item.id} item={item} />)}
</Box>
```

Props:
- `overflow="scroll"` - enables scroll behavior with overflow indicators
- `overflow="hidden"` - clips without indicators
- `scrollTo={number}` - child index to keep visible (centered)

## How It Works

InkZ uses **measure-then-render**:
1. React creates all child elements
2. Yoga measures all children (fast - ~1ms for 500 nodes)
3. Calculate scroll position from `scrollTo` prop
4. Render content ONLY for visible children (skips expensive terminal strings)
5. Paint visible content to terminal

## Acceptance Criteria

- [ ] `overflow="scroll"` enables scroll behavior
- [ ] `scrollTo={n}` keeps nth child visible (centered when possible)
- [ ] Only visible children have content rendered
- [ ] Overflow indicators show count of hidden items
- [ ] Works with variable-height children (Yoga measures)
- [ ] Performance: 500 items renders in <5ms total
- [ ] Works with keyboard navigation
