---
id: "@km/tui/curswanty-regress"
aliases:
  - km-tui.curswanty-regress
  - km-tui-curswanty-regress
created_by: claude:e7ea0892
created_at: 2026-02-11T21:30:20Z
closed_at: 2026-02-11T22:50:05Z
---

# [x] curswantY regression: j3→l→j3→l lands at card 1 not 2+ @km/tui #bug #P2

curswanty-combinatorial test fails: [vault-like] [tall] vertical-clear j3→l→j3→l. After navigating down 3, right, down 3, right, cursor should be at card 2+ in final column but lands at card 1. Likely regression from keybinding/view-navigation changes in commit 13ef8a67.