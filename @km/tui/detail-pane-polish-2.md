---
mentions:
  - km
  - claude
id: "@km/tui/detail-pane-polish-2"
aliases:
  - km-tui.detail-pane-polish-2
  - km-tui-detail-pane-polish-2
created_by: claude:019d032d
created_at: 2026-04-23T04:26:06Z
closed_at: 2026-04-23T04:48:19Z
close_reason: "Shipped a6a72d44c: scroll-to-cursor via CursorScrollRegistrar +
  useScrollRect + useLayoutEffect. Mirrors CardColumn's
  ScrollTrackingVirtualList pattern. 2515/2515 km-tui tests pass. Heading indent
  (paddingLeft=2) from 966618404 + visual polish from 414d65169 also landed."
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-tui.detail-pane-polish-2
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-22T21:26:25Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] DetailView: indent heading children, HR width, done-item readability, nav diagnosis for Done section @km/tui #bug #P2 @claude:019d032d

blocks:: [[@km/tui]]

Follow-up to @km/tui/detail-pane-polish. Screenshot shows: (1) HR extends to line 200 truncated with ellipsis instead of pane width, (2) Done-section tasks render with compounded strikethrough+muted+dim making them nearly invisible, (3) heading children render at same left margin as heading — no visual nesting, (4) user reports 'can't cursor down in Done blocks'. Nav instrumentation added to createDetailViewNavigation so user can DEBUG=km:nav to capture. Visual polish shipped; nav diagnosis pending user repro data.

