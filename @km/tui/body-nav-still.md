---
id: "@km/tui/body-nav-still"
aliases:
  - km-tui.body-nav-still
  - km-tui-body-nav-still
created_by: claude:a5c7f7de
created_at: 2026-02-15T09:21:54Z
closed_at: 2026-02-15T09:45:29Z
---

# [x] Body nav still broken: right from body goes to top of next column, not visual navigation @km/tui #bug #P2

Navigating right (l) from a body content card in a column goes to the top of the next column instead of maintaining visual position (stickyY). Repro: open /tmp/vt/CLAUDE.md, navigate to body content like 'Current projects:...', press l — cursor jumps to first card of next column instead of staying at same vertical position. This is a regression from the body content merge work.