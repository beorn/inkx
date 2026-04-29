---
id: "@km/tui/ui-polish-0226"
aliases:
  - km-tui.ui-polish-0226
  - km-tui-ui-polish-0226
created_by: claude:e7c823b8
created_at: 2026-02-26T17:00:14Z
closed_at: 2026-02-26T17:11:32Z
owner: bjorn@stabell.org
assignee: claude:e7c823b8
---

# [x] UI polish: theme neutralization, filter bug, rendering, truncation padding @km/tui #task #P2 @claude:e7c823b8

Batch of UI polish items from 2026-02-26 session:

1. [DONE] Neutral truecolor theme (no blue/Nord tint)
2. [DONE] Inline code/field cyan → $control token
3. [DONE] Chrome colors (COUNT, separator, overflow) → $text3
4. [DONE] Dialog bg restored, headings $primary
5. [DONE] Find & Replace spacing
6. [DONE] Detail pane focus, PaneBar cleanup
7. [DONE] Breadcrumbs transparent, filters default fg
8. [DONE] Link color brightened, duplicate mention fix
9. [DONE] vd filter — already fixed in prior commit
10. [DONE] Rendering ##### [x] — already fixed (heading depth cap, 7822c8c3)
11. [DONE] Truncation padding — already fixed (c4cfdf8b)
12. Run bun fix + bun run test:fast, commit, push