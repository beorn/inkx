---
mentions:
  - km
id: "@km/silvery/mouse-shift-click"
aliases:
  - km-silvery.mouse-shift-click
  - km-silvery-mouse-shift-click
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:17Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-shift-click
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Mouse: shift-click range extend @km/silvery #feature #P2

blocks:: [[@km/silvery/opentui-parity]]

Clicking with shift held extends existing selection to click point, for both text and node/card selection. Standard everywhere.

