---
id: "@km/tui/visual-mode-dead-code"
aliases:
  - km-tui.visual-mode-dead-code
  - km-tui-visual-mode-dead-code
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:37Z
---

# [ ] [bug] Visual mode chord entry exists but UI hidden — dead state @km/tui #bug #P2

v v enters visual mode (per chord palette) but CommandBox.tsx:215 hardcodes to skip VISUAL label. j/k behave normally, no feedback. Either remove keybinding+chord or restore UI label.