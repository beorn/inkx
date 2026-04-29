---
id: "@km/tui/scroll-bottom"
aliases:
  - km-tui.scroll-bottom
  - km-tui-scroll-bottom
created_by: claude:db326126
created_at: 2026-03-30T19:23:04Z
closed_at: 2026-03-30T19:55:03Z
close_reason: "Fixed: useVirtualizer sumHeights() now uses average measured
  height for unmeasured items instead of ESTIMATED_CARD_HEIGHT. Tests in
  vendor/silvery/tests/ui/virtualizer-scroll-bugs.test.tsx."
owner: bjorn@stabell.org
---

# [x] [bug] Column scroll doesn't reach bottom — items hidden below fold @km/tui #bug #P2

User reports: scrolling in columns doesn't let them scroll all the way down. Screenshot shows a 'completed' section at the bottom of a column that's partially visible with items beneath it. Likely the virtual list's scroll range calculation is off — either maxScrollOffset doesn't account for all content height, or the last items' heights are miscalculated.