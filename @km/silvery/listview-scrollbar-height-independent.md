---
id: "@km/silvery/listview-scrollbar-height-independent"
aliases:
  - km-silvery.listview-scrollbar-height-independent
  - km-silvery-listview-scrollbar-height-independent
created_by: claude:2405c72e
created_at: 2026-04-26T06:11:56Z
closed_at: 2026-04-26T06:39:02Z
close_reason: "Shipped: 1c360b80 (silvery) + 1989817f2 (km bump). Two root
  causes: scrollbar invisibility (estimateHeight×items vs measured rows
  mismatch) + bump-flicker (bumpedEdge held across grow). 2 tests. Session:
  km-session.0425-evening"
started_at: 2026-04-26T06:26:11Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.listview-scrollbar-height-independent
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-25T23:12:03Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Scrollbar invisible in height-independent ListView mode @km/silvery #bug #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

silvercode MessageList uses ListView without a height prop (height-independent mode) — scrollbar never renders. The scrollbarFrac/isScrolling logic at vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx:579+ may only fire in pixel-mode (explicit height). User reports: scrolling shows the bottom overscroll indicator but no side scrollbar. Investigate: does the scrollbar render path require height? If so, add support for height-independent mode (use measured viewport from useBoxRect or onLayout). Or: document that height is required for scrollbar.