---
id: "@km/inkx/kitty-keyboard"
aliases:
  - km-inkx.kitty-keyboard
  - km-inkx-kitty-keyboard
created_at: 2026-02-09T12:23:37Z
closed_at: 2026-02-09T12:50:07Z
assignee: claude:a3625ec3
---

# [x] Kitty keyboard protocol support @km/inkx #feature #P3 @claude:a3625ec3

Add Kitty keyboard protocol support with runtime detection and graceful fallback. Enables: shift+enter vs enter, ctrl+i vs tab, and other modifier combinations. Ink PR #852 is exploring this. See docs/ink-comparison.md.