---
mentions:
  - km
  - claude
id: "@km/tui/card-border-render"
aliases:
  - km-tui.card-border-render
  - km-tui-card-border-render
created_by: claude:8f007ba9
created_at: 2026-02-20T07:48:29Z
closed_at: 2026-02-20T08:31:38Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Card border rendering issues with wrapped text @km/tui #bug #P2 @claude:8f007ba9

Screenshot (07.46.51.png): Cards with wrapped text show border/layout issues. '[Tech] Set up chrome dev tools for node ···' wraps to 3 lines with 'for' alone on line 2. May be related to how the ··· body indicator interacts with word-wrap width calculation. The border itself seems intact but text layout within bordered cards needs investigation.

