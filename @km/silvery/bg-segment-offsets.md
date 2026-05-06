---
mentions:
  - km
  - claude
id: "@km/silvery/bg-segment-offsets"
aliases:
  - km-silvery.bg-segment-offsets
  - km-silvery-bg-segment-offsets
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:17Z
closed_at: 2026-03-13T05:16:50Z
close_reason: "Fixed: mapLinesToCharOffsets now returns display-width offsets
  (matching BgSegment coordinate system), and applyBgSegmentsToLine uses col-x
  (display width) instead of charIdx (grapheme count)."
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] Text bg segment offsets mix UTF-16 length, display width, and grapheme count @km/silvery #bug #P2 @claude:65d845d9

BgSegment start/end uses display-width-ish offsets via getTextWidth, but mapLinesToCharOffsets uses string.length (UTF-16), and applyBgSegmentsToLine increments by grapheme count. Three coordinate systems mixed. Wide CJK, emoji, ZWJ sequences can mis-apply nested Text backgrounds after wrap/truncate. Most likely remaining text-layer bug. Found by GPT pipeline review.

