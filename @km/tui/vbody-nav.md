---
id: "@km/tui/vbody-nav"
aliases:
  - km-tui.vbody-nav
  - km-tui-vbody-nav
created_by: claude:5f0aee02
created_at: 2026-02-18T10:17:20Z
closed_at: 2026-02-19T08:10:20Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Left navigation into virtual body column jumps to wrong card @km/tui #bug #P2 @claude:36393b5d

In [Fam Travel] board, cursor on a card in 'Travel system' column. Moving right works. Moving left into '(no section)' (virtual body) column jumps to a card much further down — not the visually adjacent card. curswantY or virtual body column card indexing is off.