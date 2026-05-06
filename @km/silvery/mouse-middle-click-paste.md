---
mentions:
  - km
id: "@km/silvery/mouse-middle-click-paste"
aliases:
  - km-silvery.mouse-middle-click-paste
  - km-silvery-mouse-middle-click-paste
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:19Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-middle-click-paste
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

# [ ] Mouse: middle-click paste (X11 primary selection) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

On Linux/tmux, middle-click pastes primary selection buffer. Optional, platform-conditional.

