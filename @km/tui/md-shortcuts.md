---
id: "@km/tui/md-shortcuts"
aliases:
  - km-tui.md-shortcuts
  - km-tui-md-shortcuts
created_by: Bjørn Stabell
created_at: 2026-03-31T19:13:52Z
closed_at: 2026-04-01T04:58:21Z
close_reason: "detectPrefixConversion changed from exact equality to prefix
  matching (startsWith). All markdown shortcuts (-, *, 1., #, [], >) now work
  with existing content. 10 new tests."
---

# [x] Markdown shortcuts: []<space> etc. should work with existing content @km/tui #feature #P2 @Bjørn Stabell

Markdown shortcuts like []<space> at the beginning of a line should convert to task checkbox even when there is existing content after the cursor. Currently may only work on empty lines. Same principle applies to all smart shortcuts (-, 1., #, etc.).