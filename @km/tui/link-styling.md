---
id: "@km/tui/link-styling"
aliases:
  - km-tui.link-styling
  - km-tui-link-styling
created_by: claude:36393b5d
created_at: 2026-02-19T15:51:08Z
closed_at: 2026-02-19T18:52:55Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Detail pane: distinguish internal vs external links with different styling @km/tui #feature #P3 @claude:8f007ba9

Internal links (to other nodes) should use dotted underlines. External links (URLs) should use blue + underline (clickable via OSC 8). Centralize link styling so it can be easily tweaked. Asana shows internal links as clickable pills/boxes.