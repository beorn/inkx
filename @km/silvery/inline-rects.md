---
id: "@km/silvery/inline-rects"
aliases:
  - km-silvery.inline-rects
  - km-silvery-inline-rects
created_by: claude:656602a3
created_at: 2026-03-17T05:21:31Z
closed_at: 2026-03-17T05:40:28Z
close_reason: Virtual text nodes get inlineRects during render. hitTest checks
  them. Mouse events (enter/leave/click) work on nested Text. 7 tests, no perf
  regression. Unlocks Link hover, Cmd+click, future interactive inline elements.
---

# [x] Virtual text inline rects: enable hit testing on nested Text (links, checkboxes, tags) @km/silvery #feature #P0

Virtual text nodes (nested <Text> inside <Text>) have no screenRect, making them invisible to hitTest. This blocks all interactive inline elements: Link hover, Cmd+click, checkboxes, tags, mentions.

**Root cause**: The render pipeline computes character positions for virtual text during text rendering (color segmentation, word wrap) but discards the position data instead of storing it on the node.

**Fix**: During text rendering, compute and store rects (or rect arrays for wrapped text) on virtual text nodes. Update hitTest to check inline rects when the parent Text is hit. This matches browser behavior where every DOM node — even inline spans — participates in hit testing.

**Unlocks**: Link onMouseEnter/onMouseLeave (hover effects), onClick (Cmd+click to follow), useMouseCursor (pointer shape), and future interactive inline elements (checkboxes, tags, mentions).

**Scope**: ~50 lines to store rects during render, ~20 lines to check in hitTest.