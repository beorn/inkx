---
id: "@km/tui/html-tags"
aliases:
  - km-tui.html-tags
  - km-tui-html-tags
created_at: 2026-02-04T11:27:20Z
closed_at: 2026-02-04T12:33:24Z
---

# [x] HTML anchor tags show as '<a' instead of being hidden/rendered @km/tui #bug #P2 @claude:a7826e85

In docs/principles.md, HTML <a> tags are partially rendered showing just '<a' in the TUI. They should either be:
1. Hidden entirely (strip HTML from display)
2. Rendered as clickable links
3. At minimum, show the link text without the tag markup