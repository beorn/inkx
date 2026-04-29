---
id: "@km/silvery/mouse-wheel-horizontal"
aliases:
  - km-silvery.mouse-wheel-horizontal
  - km-silvery-mouse-wheel-horizontal
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:19Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-wheel-horizontal
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:19Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Mouse: shift+wheel → horizontal scroll @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Shift+wheel is standard horizontal-scroll convention for wide views (tables, code, timelines). Needs ScrollView/VirtualList integration.