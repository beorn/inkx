---
id: "@km/_orphan/hvlist"
aliases:
  - km-hvlist
created_at: 2026-02-02T20:33:30Z
closed_at: 2026-02-02T22:14:35Z
assignee: claude:227cdc41
---

# [x] HorizontalVirtualList component for horizontal virtualization @km/_orphan #feature #P3 @claude:227cdc41

Create a HorizontalVirtualList component in inkx that mirrors VirtualList but for horizontal scrolling. This will replace manual column slicing in Board.tsx with a consistent, reusable API.

Key features:
- Similar API to VirtualList (items, width, itemWidth, scrollTo, renderItem)
- Edge-based scrolling for keyboard navigation
- Support for fixed or variable item widths
- Overflow indicators (◀N/▶N)
- gap prop for item spacing

Design doc: docs/design/horizontal-virtualization.md