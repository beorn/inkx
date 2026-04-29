---
id: "@km/inkx/dry-virtualizer"
aliases:
  - km-inkx.dry-virtualizer
  - km-inkx-dry-virtualizer
created_by: claude:d1f60fb4
created_at: 2026-02-26T14:41:01Z
closed_at: 2026-02-26T14:53:48Z
---

# [x] DRY: consolidate useVirtualization into useVirtualizer @km/inkx #task #P2 @claude:d1f60fb4

useVirtualization (items-based API) and useVirtualizer (count-based API) have duplicated core logic — edge-based scrolling, window calculation, synchronous scroll offset, freeze behavior. Refactor useVirtualization to be a thin adapter over useVirtualizer. Consumers: VirtualList, HorizontalVirtualList use useVirtualization; VirtualScrollView, ScrollView use useVirtualizer.