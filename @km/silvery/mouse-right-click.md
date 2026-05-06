---
mentions:
  - km
id: "@km/silvery/mouse-right-click"
aliases:
  - km-silvery.mouse-right-click
  - km-silvery-mouse-right-click
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:18Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-right-click
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Mouse: right-click context menu + onContextMenu @km/silvery #feature #P2

blocks:: [[@km/silvery/opentui-parity]]

Canonical ContextMenu component + onContextMenu handler on Box. Keyboard-navigable, theme-aware, focus-trapping.

