---
mentions:
  - km
id: "@km/silvery/mouse-drag-preview"
aliases:
  - km-silvery.mouse-drag-preview
  - km-silvery-mouse-drag-preview
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:20Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.mouse-drag-preview
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Mouse: drag ghost preview + drop zones @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

HTML5-style drag/drop: onDragStart, ghost preview follows cursor, onDragOver highlights drop targets, onDrop handler. For card reordering, file drops, etc.

