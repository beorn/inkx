---
id: "@km/tui/detail-pane"
aliases:
  - km-tui.detail-pane
  - km-tui-detail-pane
created_by: claude:d697f216
created_at: 2026-02-25T12:21:12Z
closed_at: 2026-03-02T11:07:27Z
---

# [x] Detail pane: black bg, no cursor nav, top bar styling, remove duplicate title @km/tui #bug #P2 @claude:d697f216

Multiple issues with the detail pane:
1. Background color is black instead of default/neutral (should match board bg)
2. Cursoring inside detail pane doesn't work
3. Top bar should match column head style: 1 space padding left, icon, space, title
4. Top bar should be selectable and editable (like board title / column head)
5. Since top bar has the title, remove from pane contents: title, 'Contents' heading, line separator (use blank line instead)