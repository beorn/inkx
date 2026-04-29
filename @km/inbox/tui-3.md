---
id: "@km/_orphan/tui-3"
aliases:
  - km-tui-3
created_at: 2026-01-27T13:39:38Z
closed_at: 2026-02-04T11:27:22Z
---

# [x] TUI uses alternate screen buffer instead of inline display @km/_orphan #bug #P3

The km TUI currently uses alternate screen mode, clearing the terminal and displaying in a separate screen buffer. User prefers inline display where TUI output stays in the same terminal screen, preserving command history and previous output.

This is likely controlled by Ink's terminal mode settings.