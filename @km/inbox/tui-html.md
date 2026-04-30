---
id: "@km/inbox/tui-html"
aliases:
  - km-tui-html
  - "@km/_orphan/tui-html"
created_at: 2026-01-30T16:32:48Z
closed_at: 2026-02-04T11:27:20Z
---

# [x] HTML anchor tags show as '<a' instead of being hidden/rendered @km/_orphan #bug #P2

In docs/principles.md, HTML <a> tags are partially rendered showing just '<a' in the TUI. They should either be:
1. Hidden entirely (strip HTML from display)
2. Rendered as clickable links
3. At minimum, show the link text without the tag markup