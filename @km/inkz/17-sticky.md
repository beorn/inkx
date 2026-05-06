---
mentions:
  - km
id: "@km/inkz/17-sticky"
aliases:
  - km-inkz.17-sticky
  - km-inkz-17-sticky
created_at: 2026-01-19T14:01:53Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] InkZ: Implement position=sticky for scroll containers @km/inkz #feature #P3

## Goal

Implement CSS-like `position: sticky` behavior for elements within scrollable containers, allowing headers, footers, or other elements to remain visible while scrolling.

## Use Cases

1. **Sticky headers**: Column headers that stay visible when scrolling a list
2. **Sticky footers**: Action bars or status lines that stay at bottom
3. **Sticky group headers**: Section headers in grouped lists (like iOS contacts)
4. **Breadcrumb trails**: Parent context that stays visible when navigating deep trees

## Proposed API

```tsx
// Sticky header at top of scroll container
<Box overflow="scroll" scrollTo={selectedIdx}>
  <Box position="sticky" top={0}>
    <Text bold>Column Header</Text>
  </Box>
  {items.map(item => <Item key={item.id} {...item} />)}
</Box>

// Sticky footer at bottom
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Item key={item.id} {...item} />)}
  <Box position="sticky" bottom={0}>
    <Text>Press Enter to select</Text>
  </Box>
</Box>

// Sticky group headers (multiple)
<Box overflow="scroll">
  {groups.map(group => (
    <Box key={group.id}>
      <Box position="sticky" top={0}>
        <Text bold>{group.name}</Text>
      </Box>
      {group.items.map(item => <Item key={item.id} {...item} />)}
    </Box>
  ))}
</Box>
```

## Implementation Considerations

1. **Requires overflow="scroll"**: Sticky only makes sense in scrollable containers
2. **Respects scroll viewport**: Sticky elements are positioned relative to visible area
3. **Stacking**: Multiple sticky elements should stack (e.g., nested group headers)
4. **Z-index**: Sticky elements render on top of scrolled content
5. **Performance**: Must not re-layout entire tree on scroll

## Props

| Prop     | Type                                 | Description                      |
| -------- | ------------------------------------ | -------------------------------- |
| position | "relative" \| "absolute" \| "sticky" | Positioning mode                 |
| top      | number                               | Distance from top when sticky    |
| bottom   | number                               | Distance from bottom when sticky |

## Acceptance Criteria

- [ ] `position="sticky"` keeps element visible during scroll
- [ ] `top={0}` pins to top of scroll viewport
- [ ] `bottom={0}` pins to bottom of scroll viewport
- [ ] Multiple sticky elements stack correctly
- [ ] Works with `scrollTo` prop
- [ ] No layout recalculation on scroll (content-phase only)
- [ ] Example demonstrating sticky headers in a list

## Dependencies

- Requires @km/inkz/10-scroll (overflow="scroll") to be implemented first

