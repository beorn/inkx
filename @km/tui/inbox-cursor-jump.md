---
id: "@km/tui/inbox-cursor-jump"
aliases:
  - km-tui.inbox-cursor-jump
  - km-tui-inbox-cursor-jump
created_by: claude:a5c7f7de
created_at: 2026-02-15T12:57:27Z
closed_at: 2026-02-15T20:58:37Z
---

# [x] TUI: 'j' from Kaiser Health in @next.md#inbox jumps cursor to board title @km/tui #bug #P2

Navigating down ('j') in @next.md#inbox from the 'Kaiser Health' card causes the cursor to jump to the board title instead of the next card. Possible regression from @km/tui/virtual-nav fix (40f8a894) or uncovered variant of @km/_orphan/tui-cursor-jump.