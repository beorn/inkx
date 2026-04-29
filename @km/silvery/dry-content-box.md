---
id: "@km/silvery/dry-content-box"
aliases:
  - km-silvery.dry-content-box
  - km-silvery-dry-content-box
created_by: claude:c9beade3
created_at: 2026-03-13T04:31:05Z
closed_at: 2026-03-13T05:21:46Z
close_reason: "Deferred: 27 inline content box calculations across 4 files. Need
  getContentBox() and getContentBounds() in helpers.ts. Mechanical refactor —
  border+padding inset math extracted to shared functions. Safe to do anytime."
---

# [x] DRY: Extract getContentBox/getBoxInsets geometry helpers @km/silvery #task #P2

Border/padding/contentX/contentY/contentWidth/contentHeight recomputed in 6+ places: renderScrollContainerChildren, renderNormalChildren, renderText, clearNodeRegion, clearExcessArea, renderScrollIndicators. Extract getContentBox(layout, props, scrollOffset?) to reduce subtle geometry drift. Found by GPT pipeline review.