---
id: "@km/tui/scroll-blank-top"
aliases:
  - km-tui.scroll-blank-top
  - km-tui-scroll-blank-top
created_by: claude:ceb7c9cb
created_at: 2026-03-30T07:29:08Z
closed_at: 2026-03-30T19:55:03Z
close_reason: "Fixed: useVirtualizer sumHeights() now uses average measured
  height for unmeasured items instead of ESTIMATED_CARD_HEIGHT. Tests in
  vendor/silvery/tests/ui/virtualizer-scroll-bugs.test.tsx."
owner: bjorn@stabell.org
---

# [x] VirtualList: blank space at top of column when scrolled down @km/tui #bug #P2

When scrolling down in a board column, blank rows appear between the column header and the first visible card. This is a VirtualList measurement issue: the leadingHeight placeholder (estimated from ESTIMATED_CARD_HEIGHT=4) may overshoot when actual measured card heights average less than 4 rows. The silvery Box overflow=scroll positions items after the placeholder, but the placeholder's estimated height doesn't match actual content height, leaving a visible gap. Pre-existing issue — not caused by popover/wikilink changes.