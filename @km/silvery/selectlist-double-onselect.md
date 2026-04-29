---
id: "@km/silvery/selectlist-double-onselect"
aliases:
  - km-silvery.selectlist-double-onselect
  - km-silvery-selectlist-double-onselect
created_by: claude:c6244087
created_at: 2026-04-23T07:58:47Z
closed_at: 2026-04-23T08:18:01Z
close_reason: "Fixed in silvery fc7847ef — removed duplicated
  onClick/onMouseEnter from SelectList's inner Box, routed click/hover through
  ListView's onItemClick/onItemHover props. 45 tests (6 new: 3 SelectList
  regression, 3 ListView standalone coverage). Option (a) single-source-of-truth
  picked."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.selectlist-double-onselect
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T00:58:51Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] SelectList fires onSelect twice on click: ListView wrapper Box onClick duplicates SelectList's own onClick @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Discovered while fixing @km/silvery/mouse-drag-vs-click (see agent report for task #10). Commit `48143ef0` added a default `onClick` on ListView's item wrapper Box that now duplicates SelectList's own Box `onClick` — clicking a SelectList row fires `onSelect` twice.

Failing test: `vendor/silvery/packages/ag-react/tests/select-list-default-ux.test.tsx:107`.

Fix shape: either (a) SelectList owns click (don't add default onClick in ListView), (b) ListView adds the onClick only when parent didn't, or (c) onClick routes through a single handler shared between them.