---
mentions:
  - km
  - claude
id: "@km/tui/hover-select"
aliases:
  - km-tui.hover-select
  - km-tui-hover-select
created_by: claude:e31834da
created_at: 2026-03-20T01:46:01Z
closed_at: 2026-03-23T05:55:51Z
close_reason: Implemented card hover + click interaction via useCardInteraction
  hook. Plain hover highlights border, click selects, Cmd+hover arms for
  navigation, Cmd+click zooms. All 5 card variants covered. 1270 km-tui tests
  pass.
owner: bjorn@stabell.org
assignee: claude:c0da815b
---

# [x] Hover-over and click-navigation for UI elements @km/tui #feature #P1 @claude:c0da815b

Two hover interaction modes for interactive UI elements:

**hover-over** = show entire element as selectable (very faint highlight effect)

- click = selects/unselects the element

**cmd-hover-over** = show entire element as clickable (click navigates/opens)

- click = zoom into / open the element

**Applies to:**

- Breadcrumb segments
- Item titles (acts as handle for the item)
- Cards (entire card shows hover effect)

**Depends on:** @km/silvery/link-arm-variant (for the arm-on-hover Link variant and OSC 8 fix)

**TBD:** exact visual treatment for faint hover highlight, interaction details.

