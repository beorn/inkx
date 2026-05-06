---
mentions:
  - km
id: "@km/silvery/hover-broken"
aliases:
  - km-silvery.hover-broken
  - km-silvery-hover-broken
created_by: claude:656602a3
created_at: 2026-03-17T04:06:15Z
closed_at: 2026-03-17T05:40:28Z
close_reason: Fixed by km-silvery.inline-rects — virtual text nodes now have
  inlineRects for hit testing.
owner: bjorn@stabell.org
---

# [x] Link hover effect not working in real terminal despite mode 1003 @km/silvery #bug #P0

Root cause: Link renders <Text onMouseEnter> inside card content (which is already inside <Text>). The reconciler turns nested Text into virtual text nodes (no layoutNode, no screenRect). Virtual text is invisible to hitTest, so mouseenter never fires.

Fix options:

1. Make Link render as <Box> instead of <Text> — gets own layout node + screenRect
2. Hoist mouse event props from virtual text to nearest non-virtual ancestor
3. Make hitTest aware of virtual text children

Option 1 is simplest but changes layout behavior (Box is block, Text is inline). May need flexDirection='row' or inline display.
Option 2 is cleanest — the parent Text's screenRect covers the virtual text content.
Option 3 is most correct but complex.

