---
id: "@km/inbox/hl0w"
aliases:
  - km-hl0w
  - "@km/_orphan/hl0w"
created_at: 2026-01-19T14:05:35Z
closed_at: 2026-01-19T14:16:01Z
---

# [x] Fix H/L keybinding docs mismatch @km/_orphan #bug #P0

Documentation in docs/10-commands.md shows wrong keybindings for nav_cross_column commands. These commands were removed during the @km/cmd migration as they don't match TUI behavior. Update docs to reflect actual keybindings: h=cursor_left, l=cursor_right, Shift+H/L don't exist in TUI.