---
mentions:
  - km
  - claude
id: "@km/tui/allviews-scroll"
aliases:
  - km-tui.allviews-scroll
  - km-tui-allviews-scroll
created_by: claude:949598cc
created_at: 2026-02-11T19:49:32Z
closed_at: 2026-02-18T08:25:43Z
owner: bjorn@stabell.org
assignee: claude:5770ce77
---

# [x] Storybook All Views section doesn't scroll (ArrowDown consumed or ignored) @km/tui #bug #P3 @claude:5770ce77

In fullscreen storybook (bun storybook), the All Views section (Layer 3) doesn't scroll with ArrowDown/ArrowUp keys. Other sections (Rich Text, Tag Pills, etc.) scroll fine. The All Views section renders 4 BoardCore components via ViewBox wrappers. Content is ~106 rows vs ~37 row viewport, so scrolling should work. ArrowDown is received (process stays alive) but scroll offset doesn't change visually. Possibly related to nested RepoProvider/StorybookProviders context providers, or something about how ViewBox explicit height interacts with overflow=scroll.

