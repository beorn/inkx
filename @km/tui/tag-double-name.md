---
mentions:
  - -norway
  - km
id: "@km/tui/tag-double-name"
aliases:
  - km-tui.tag-double-name
  - km-tui-tag-double-name
created_by: claude:8f007ba9
created_at: 2026-02-20T07:43:21Z
closed_at: 2026-02-20T07:47:09Z
owner: bjorn@stabell.org
---

# [x] Tag columns show double name like '@-norway #norway' @km/tui #bug #P2

Asana tags like '@-norway' generate files named '#norway.md' but content title is '# @-norway'. The TUI shows both names in the column header: '@-norway #norway'. Root cause: converter strips '@' prefix for filename but keeps it in content title. Either filename should match content or content should match filename. Also affects @-us, @w, etc.

