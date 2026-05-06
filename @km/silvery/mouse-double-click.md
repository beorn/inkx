---
mentions:
  - km
id: "@km/silvery/mouse-double-click"
aliases:
  - km-silvery.mouse-double-click
  - km-silvery-mouse-double-click
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:16Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-double-click
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Mouse: double-click word selection @km/silvery #feature #P2

blocks:: [[@km/silvery/opentui-parity]]

On 2nd click within double-click threshold, auto-extend selection to word boundary. Standard text editor behavior; missing from silvery's selection system.

