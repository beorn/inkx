---
mentions:
  - km
id: "@km/silvery/drag-select-shrink"
aliases:
  - km-silvery.drag-select-shrink
  - km-silvery-drag-select-shrink
created_by: claude:0940ca20
created_at: 2026-04-24T15:09:22Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.drag-select-shrink
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T08:09:37Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] silvery: drag-select extends but won't shrink, plus 2 mouse bugs @km/silvery #bug #P2

blocks:: [[@km/silvery]]

User reported 2026-04-24: drag-select can extend by dragging out but not shrink by dragging back. Recall surfaces 3 logged bugs in vendor/silvery/packages/headless/src/selection.ts: (1) extend action not firing — shrink IS supported in the headless state machine (head reassigns regardless of anchor direction, selection.ts:275-289) but extend is not invoked correctly, (2) mouseUp triggers onClick/onSelect incorrectly, (3) plain click selects 1 character unintentionally. Bug surfaces in silvercode SessionCard message area. Fix owner = silvery.

