---
mentions:
  - km
  - claude
id: "@km/tui/search-blank"
aliases:
  - km-tui.search-blank
  - km-tui-search-blank
created_by: claude:36393b5d
created_at: 2026-02-19T13:24:33Z
closed_at: 2026-02-19T13:43:50Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Search: blank screen on special characters (ready-, backtick) @km/tui #bug #P1 @claude:36393b5d

Typing 'ready-' or backtick in search causes blank/black screen. Backtick is intermittent (every few keystrokes). Likely regex compilation error in search filter crashing render.

