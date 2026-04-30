---
id: "@km/inbox/reporter-col1"
aliases:
  - km-reporter-col1
  - "@km/_orphan/reporter-col1"
created_at: 2026-01-28T07:40:28Z
closed_at: 2026-01-28T07:57:20Z
---

# [x] Reporter TTY mode shows dots on first column instead of live updating @km/_orphan #bug #P2

When running tests without TERM=dumb (TTY mode with inkx), the progress dots are showing on the first column of the terminal instead of the proper live-updating grouped view.

The non-TTY mode (VITEST_REPORTER_TTY=false) works correctly, showing grouped dots.

Expected behavior: Live updating grouped dots view with spinner animation
Actual behavior: Dots appear on first column only

Related to: @km/_orphan/reporter-tty, @km/_orphan/reporter-grouping