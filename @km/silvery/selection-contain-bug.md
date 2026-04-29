---
id: "@km/silvery/selection-contain-bug"
aliases:
  - km-silvery.selection-contain-bug
  - km-silvery-selection-contain-bug
created_by: Bjørn Stabell
created_at: 2026-04-06T09:41:39Z
closed_at: 2026-04-07T06:00:22Z
close_reason: Fixed via km 1fed20fad (silvery 3649785). Plumbs contain scope
  into terminalSelectionUpdate, extends
  extractText/renderSelectionOverlay/composeSelectionCells to clip per-row col
  range to scope. New termless e2e test passes. 103/103 selection tests green.
---

# [x] Selection ignores contain boundary — highlight spills outside container @km/silvery #bug #P1 @Bjørn Stabell

When selecting text inside a userSelect=contain box, the selection highlight extends beyond the container's borders. The contain scope should clamp the selection range to the container's bounding rect. Visible in text-selection-demo: drag inside 'Contained Selection' panel and the highlight bleeds into 'Selection State' panel. Screenshot: ~/Desktop/Screenshot 2026-04-06 at 02.40.42.png