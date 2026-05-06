---
mentions:
  - km
  - claude
id: "@km/tui/empty-link"
aliases:
  - km-tui.empty-link
  - km-tui-empty-link
created_by: claude:d697f216
created_at: 2026-02-25T12:02:27Z
closed_at: 2026-02-25T12:33:21Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Tasks show 'See <>' with missing link text in Asana import @km/tui #bug #P2 @claude:d697f216

Some imported Asana tasks display 'See <>' where a link should be. The link text/URL is missing. Check imports/asana/stabell/ source data and the inline component rendering pipeline. Likely a parser issue where the link node has no URL or text.

