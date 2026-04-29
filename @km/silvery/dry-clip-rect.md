---
id: "@km/silvery/dry-clip-rect"
aliases:
  - km-silvery.dry-clip-rect
  - km-silvery-dry-clip-rect
created_by: claude:c9beade3
created_at: 2026-03-13T04:31:06Z
closed_at: 2026-03-13T05:21:45Z
close_reason: "Deferred: 50+ inline Math.max/Math.min patterns across 4 files
  (content-phase.ts, render-box.ts, render-text.ts, content-phase-adapter.ts).
  Need clipRectToBounds() and intersectRects() in a new rect-utils.ts.
  Mechanical refactor — no behavior change, just DRY. Safe to do anytime."
---

# [x] DRY: Extract intersectRects/clipRectToBounds rectangle utilities @km/silvery #task #P3

Clip-and-fill rectangle logic duplicated across renderBox, clearNodeRegion, clippedFill, _clearDescendantOverflow with slight semantic differences. Introduce intersectRects(), clipRectToBounds(), fillClippedRect(). Found by GPT pipeline review.