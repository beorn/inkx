---
mentions:
  - km
  - claude
id: "@km/tui/autolinks-hover-popover"
aliases:
  - km-tui.autolinks-hover-popover
  - km-tui-autolinks-hover-popover
created_by: claude:2405c72e
created_at: 2026-04-26T04:55:01Z
closed_at: 2026-04-26T06:38:26Z
close_reason: "Shipped: fd39c7f96 + 9de8cbf70. usePopover-based hover wiring via
  clientX/clientY (anchorRef substrate is BoxProp; inline Text spans can't take
  it without breaking word-wrap — migration noted for when silvery ships
  span-level fragment rects). 5 integration tests. Session:
  km-session.0425-evening"
started_at: 2026-04-26T05:29:52Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-tui.autolinks-hover-popover
    depends_on_id: km-silvery.overlay-anchor-impl-v1
    type: blocks
    created_at: 2026-04-25T21:55:09Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-tui.autolinks-hover-popover
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-25T21:55:08Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-tui.autolinks-hover-popover
    depends_on_id: km-tui.autolinks-adopt
    type: blocks
    created_at: 2026-04-25T21:55:09Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.overlay-anchor-impl-v1
      - type: link
        target: km-tui
      - type: link
        target: km-tui.autolinks-adopt
---

# [x] km-tui hover-popover via overlay-anchor system @km/tui #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery/overlay-anchor-impl-v1]], [[@km/tui]], [[@km/tui/autolinks-adopt]]

After autolinks adoption (@km/tui/autolinks-adopt) + overlay-anchor v1 (@km/silvery/overlay-anchor-impl-v1). Hovering an autolink match in @km/tui shows popover anchored to the text span via anchorRef + decorations. placeFloating chooses position. Parent: @km/tui.

