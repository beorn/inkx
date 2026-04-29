---
id: "@km/tui/attachment-links"
aliases:
  - km-tui.attachment-links
  - km-tui-attachment-links
created_by: claude:36393b5d
created_at: 2026-02-19T15:38:23Z
closed_at: 2026-02-19T17:01:59Z
owner: bjorn@stabell.org
---

# [x] Detail pane: show attachments as clickable hyperlinks @km/tui #bug #P2

Attachments in the detail pane should render as clickable hyperlinks (OSC 8) instead of plain text. Use the existing pretty-URL infrastructure (prettifyUrl + OSC 8 hyperlink support in inkx) to render attachment links as underlined, clickable file: or https: links.