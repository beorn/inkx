---
id: "@km/tui/detail-esc-render"
aliases:
  - km-tui.detail-esc-render
  - km-tui-detail-esc-render
created_by: claude:536645b5
created_at: 2026-02-20T22:41:08Z
closed_at: 2026-02-20T23:17:18Z
owner: bjorn@stabell.org
assignee: claude:536645b5
---

# [x] Detail pane: Esc causes rendering issues, l doesn't switch focus @km/tui #bug #P1 @claude:536645b5

Steps to reproduce:
1. km view --repo imports/asana stabell
2. D to open detail pane
3. l (expected: move focus to detail pane, actual: nothing happens)
4. Esc → rendering issues (usually)

Two issues:
- l should switch focus to detail pane (vim-style: h=left/board, l=right/detail)
- Esc after detail pane open causes rendering corruption