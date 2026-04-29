---
id: "@km/inkx/roadmap"
aliases:
  - km-inkx.roadmap
  - km-inkx-roadmap
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:54:47Z
closed_at: 2026-02-23T00:11:37Z
owner: bjorn@stabell.org
---

# [x] inkx feature roadmap: graphics, clipboard, bracketed paste, devtools, animations @km/inkx #task #P3

Features to consider for inkx beyond CC compatibility. Compiled from deep research across notcurses, ratatui, crossterm, textual, bubbletea, ftxui, blessed, tcell.

HIGH PRIORITY:
- OSC 52 clipboard integration (copy/paste across SSH, easy to implement)
- Bracketed paste mode (ESC[?2004h — bubbletea enables by default now)
- Wide character handling improvements (correctness for CJK/emoji)

MEDIUM PRIORITY:
- Kitty/Sixel image rendering (<Image> component)
- Built-in devtools/inspector (component tree, layout bounds, event tracing)
- Theming system (ThemeProvider, semantic color names, dark/light mode)
- Progressive terminal capability detection (terminfo-based feature flags)
- Animated transitions (useAnimation hook, enter/exit animations)

LOW PRIORITY:
- Hot module reloading for TUI dev
- OSC 7 working directory reporting
- Multi-threaded rendering (worker threads)
- Accessibility/screen reader considerations

See deep research output at /tmp/llm-ee8efc0f-1771832170790-asdt.txt for full analysis with citations.