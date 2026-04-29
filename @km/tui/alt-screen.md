---
id: "@km/tui/alt-screen"
aliases:
  - km-tui.alt-screen
  - km-tui-alt-screen
created_at: 2026-02-04T11:27:21Z
closed_at: 2026-02-04T13:41:42Z
---

# [x] TUI uses alternate screen buffer instead of inline display @km/tui #bug #P3

The km TUI currently uses alternate screen mode, clearing the terminal and displaying in a separate screen buffer. User prefers inline display where TUI output stays in the same terminal screen, preserving command history and previous output.

This is likely controlled by Ink's terminal mode settings.