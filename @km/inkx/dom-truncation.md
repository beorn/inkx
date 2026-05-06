---
mentions:
  - km
  - claude
id: "@km/inkx/dom-truncation"
aliases:
  - km-inkx.dom-truncation
  - km-inkx-dom-truncation
created_by: claude:36393b5d
created_at: 2026-02-19T13:42:42Z
closed_at: 2026-02-19T22:20:20Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Move text truncation from ANSI-level to layout-level @km/inkx #task #P2 @claude:8f007ba9

Move text truncation (wrap='truncate') from ANSI-level post-processing to DOM-level in inkx's render pipeline. Currently truncation happens by parsing ANSI strings (constrainText/sliceAnsi in inkx unicode.ts). This is fragile — every new escape type (OSC 8, etc.) is a new bug surface.

The fix: truncate text content at the DOM node level before ANSI serialization. The renderer only outputs what the layout says is visible. This makes OSC 8, hyperlinks, and other escape sequences safe by construction — they're never generated for content that won't be displayed.

Keep constrainText/sliceAnsi as general-purpose ANSI utility functions (useful for non-DOM contexts), but the renderer shouldn't rely on them for layout truncation.

This subsumes @km/tui/osc8-card-body — once truncation is DOM-level, OSC 8 sequences are never generated for truncated content.

