---
id: "@km/tui/cmdbox-style"
aliases:
  - km-tui.cmdbox-style
  - km-tui-cmdbox-style
created_by: claude:f7f27703
created_at: 2026-02-24T14:05:56Z
closed_at: 2026-02-25T17:18:59Z
---

# [x] Command box: hide in normal mode, show with outline when active @km/tui #feature #P2 @claude:d697f216

Command box styling rework:
- Hide command box entirely in NORMAL mode (common case shows nothing)
- Show with outline/border when active (search, command input, non-NORMAL mode)
- Command feedback box flush above the command box when visible
- Bottom-left positioning with space for outline around it

Current: CommandBox always visible at bottom-left
Target: Only visible when focused/active, with outline chrome