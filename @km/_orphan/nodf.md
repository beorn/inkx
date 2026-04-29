---
id: "@km/_orphan/nodf"
aliases:
  - km-nodf
created_at: 2026-01-20T10:37:50Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] Test inkx in terminal multiplexers (tmux, Zellij) @km/_orphan #task #P0

Terminal multiplexers have unique rendering challenges that cause issues in ink. Test inkx thoroughly in:

1. tmux - most common multiplexer
2. Zellij - modern alternative

Test scenarios:
- Basic rendering
- Scrolling
- Input handling (especially IME)
- Resize behavior
- Color rendering

Reference: ink PRs #846, #851 both address tmux-specific IME issues via Synchronized Update Mode.