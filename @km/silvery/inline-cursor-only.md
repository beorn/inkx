---
id: "@km/silvery/inline-cursor-only"
aliases:
  - km-silvery.inline-cursor-only
  - km-silvery-inline-cursor-only
created_by: claude:c9beade3
created_at: 2026-03-13T04:29:17Z
closed_at: 2026-03-13T05:18:37Z
close_reason: "Won't fix: Cursor-only optimization would save ~33 bytes per
  keystroke in inline mode. Negligible compared to existing 28-192x reduction
  from incremental rendering. Not worth the complexity."
owner: bjorn@stabell.org
---

# [x] Inline incremental render suppresses cursor-only updates @km/silvery #bug #P3

inlineIncrementalRender() returns '' when content unchanged but cursor position/visibility/shape changed. Early return skips suffix emission entirely. Fix: include cursor state in the early-exit condition. Found by GPT pipeline review.