---
id: "@km/tui/embed-syntax-leak"
aliases:
  - km-tui.embed-syntax-leak
  - km-tui-embed-syntax-leak
created_by: claude:23485adf
created_at: 2026-02-24T07:40:51Z
closed_at: 2026-02-24T20:36:47Z
owner: bjorn@stabell.org
assignee: claude:23485adf
---

# [x] Card content shows raw \!%5B%5B embed syntax @km/tui #bug #P1 @claude:23485adf

Cards display raw '\![%5B' prefix when content contains embed wikilinks (e.g., '\![%5Bfile.jpg]]'). The embed syntax should be resolved or stripped, not shown as-is. Visible on stabell/early-orbit board in 'Organize into boxes' card.