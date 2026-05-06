---
mentions:
  - km
  - claude
id: "@km/silvery/virtual-history"
aliases:
  - km-silvery.virtual-history
  - km-silvery-virtual-history
created_by: claude:def7f8a1
created_at: 2026-03-17T07:13:19Z
closed_at: 2026-03-17T07:56:25Z
close_reason: viewport-compositor.ts merged with Phase 2's HistoryBuffer API.
  ListView history mode + viewport compositor. 27+6 tests.
owner: bjorn@stabell.org
assignee: claude:def7f8a1
---

# [x] Virtual history + viewport composition @km/silvery #task #P1 @claude:def7f8a1

Phase 3: Wire freeze pipeline through history strategy + viewport compositor. history={{ mode: virtual }} sends frozen items to HistoryBuffer. composeViewport() merges frozen + live rows. Scroll anchor preservation, resize reflow. Remove pushToScrollback frame-snapshot path from create-app.tsx.

