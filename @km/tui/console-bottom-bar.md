---
id: "@km/tui/console-bottom-bar"
aliases:
  - km-tui.console-bottom-bar
  - km-tui-console-bottom-bar
created_at: 2026-02-05T14:50:52Z
closed_at: 2026-02-05T15:18:50Z
assignee: claude:b53ef7e4
---

# [x] Bottom bar console stats indicator: show errors/warnings with search-style UX @km/tui #feature #P2 @claude:b53ef7e4

Bottom bar console stats indicator with contextual hints:

## Design
- On TUI (alt screen): `LOGS [icon]N (M⚠) press ` to see`
- On normal screen: `LOGS [icon]N (M⚠) press ESC to close`
- Flash effect: text and numbers go bright white for a few seconds when stats change, then fade to grey
- Flash pattern should be reusable for all updating bottom bar info (like toasts)
- Only visible when console has entries (hidden when empty)

## Current State
Bottom bar already has console stats (`🖥️N (M✗ K⚠)` format) but:
- Missing contextual hint text (press ` / press ESC)
- Missing flash-on-update animation
- No distinction between TUI vs normal screen state